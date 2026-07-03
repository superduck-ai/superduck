import { isRecord } from '../../messageTypes';
import type { MessagesClient } from '../../mcpServersStore';
import { cdpDebugger } from '../browserAutomation';
import { trackEvent } from '../analytics';
import { tabGroupManager } from '../tabState';
import { beginTool, endTool } from '../agentActivity';
import { showPermissionPrompt } from './permissionPrompt';
import { createBridgePermissionManager } from '../domainPermissions';
import { startToolContext, cleanupAfterToolExecution } from './toolContextState';
import { getSelectedModel, invalidateCachedClient } from '../providerClient';
import { getOrCreateToolExecutor, createErrorResponse } from './toolExecutor';
import { mcpToolNames } from '../core/tools';
import { withTimeout } from '../core/utils';
import { extractAppName } from '../core/urlUtils';
import { recordEvent, recordError, redactUrl } from '../../debug';
import type {
  ExecuteToolResponse,
  PermissionPromptHandler,
  PermissionPromptRequest,
  ToolExecutorProcessOptions
} from '../core/types';

function extractInputFields(args: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof args.action === 'string') fields.action = args.action;
  if (typeof args.filter === 'string') fields.filter = args.filter;
  if (typeof args.depth === 'number') fields.depth = args.depth;
  if (typeof args.limit === 'number') fields.limit = args.limit;
  if (typeof args.clear === 'boolean') fields.clear = args.clear;
  if (typeof args.diff === 'boolean') fields.diff = args.diff;
  if (typeof args.newTab === 'boolean') fields.newTab = args.newTab;
  if (typeof args.full === 'boolean') fields.full = args.full;
  if (args.ref !== undefined) fields.hasRef = true;
  if (args.coordinate !== undefined) fields.hasCoordinate = true;
  return fields;
}

const TOOLS_WITH_INTERNAL_DEBUGGER_MANAGEMENT = new Set(['browser_batch']);
const DEBUGGER_ATTACH_TIMEOUT_MS = 10000;
const TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE = new Set([
  'read_page',
  'find',
  'get_page_text',
  'form_input'
]);

let navigationBlockedError: string | undefined;
let navigationBlockedTime: number | undefined;
const NAVIGATION_BLOCK_TIMEOUT = 60000;

export interface ExecuteToolOptions {
  toolName: string;
  args: unknown;
  tabId?: number;
  tabGroupId?: number;
  clientId?: string;
  source?: string;
  permissionMode?: string;
  allowedDomains?: string[];
  toolUseId?: string;
  handlePermissionPrompts?: boolean;
  onPermissionRequired?: PermissionPromptHandler;
  messagesClient?: MessagesClient | null;
}

type RequestBridgePermissionFn = (
  toolUseId: string,
  permission: PermissionPromptRequest
) => Promise<boolean>;

let requestBridgePermissionFn: RequestBridgePermissionFn | undefined;

export function setRequestBridgePermissionFn(fn: RequestBridgePermissionFn): void {
  requestBridgePermissionFn = fn;
}

export async function executeTool(options: ExecuteToolOptions): Promise<ExecuteToolResponse> {
  beginTool();
  try {
    return await executeToolInner(options);
  } finally {
    endTool();
  }
}

async function executeToolInner(options: ExecuteToolOptions): Promise<ExecuteToolResponse> {
  const requestId = crypto.randomUUID();
  const clientId = options.clientId;
  const startTime = Date.now();
  const model = await getSelectedModel();
  const inputFields = extractInputFields(isRecord(options.args) ? options.args : {});

  recordEvent({
    domain: 'tool-runtime',
    event: 'tool.request.received',
    ids: {
      requestId,
      nativeRequestId: clientId,
      toolUseId: options.toolUseId,
      tabId: options.tabId,
      tabGroupId: options.tabGroupId
    },
    data: {
      toolName: options.toolName,
      source: options.source ?? 'sidepanel',
      clientId,
      permissionMode: options.permissionMode,
      model,
      inputFields
    }
  });

  if (navigationBlockedError && navigationBlockedTime) {
    if (Date.now() - navigationBlockedTime < NAVIGATION_BLOCK_TIMEOUT) {
      const errorMsg = navigationBlockedError;
      navigationBlockedError = undefined;
      navigationBlockedTime = undefined;
      recordEvent({
        domain: 'tool-runtime',
        event: 'tool.error',
        ids: { requestId },
        level: 'error',
        data: {
          errorType: 'navigation_blocked',
          durationMs: Date.now() - startTime
        }
      });
      trackEvent('superduck.mcp.tool_called', {
        tool_name: options.toolName,
        client_id: clientId,
        model,
        success: false,
        error_type: 'navigation_blocked',
        duration_ms: Date.now() - startTime
      });
      return createErrorResponse(errorMsg);
    }
    navigationBlockedError = undefined;
    navigationBlockedTime = undefined;
  }

  let tabId: number | undefined;
  let domain: string | undefined;
  let url: string | undefined;
  let toolResult: ExecuteToolResponse;

  try {
    const skipTabLookup = mcpToolNames.includes(options.toolName) && options.tabId === undefined;
    if (!skipTabLookup) {
      recordEvent({
        domain: 'tool-runtime',
        event: 'tool.tab.resolve.start',
        ids: { requestId }
      });
      const tabInfo = await tabGroupManager.getTabForMcp(options.tabId, options.tabGroupId);
      tabId = tabInfo.tabId;
      domain = tabInfo.domain;
      url = tabInfo.url;
      recordEvent({
        domain: 'tool-runtime',
        event: 'tool.tab.resolve.end',
        ids: { requestId, tabId },
        data: { success: true, domain, urlOrigin: url ? redactUrl(url) : undefined }
      });
    }
  } catch (tabErr) {
    recordError('tool-runtime', 'tool.tab.resolve.end', tabErr, { requestId }, { success: false });
    trackEvent('superduck.mcp.tool_called', {
      tool_name: options.toolName,
      client_id: clientId,
      model,
      success: false,
      error_type: 'no_tabs_available',
      duration_ms: Date.now() - startTime
    });
    return createErrorResponse(
      'No tabs available. Please open a new tab or window in your browser.'
    );
  }

  if (
    tabId !== undefined &&
    !TOOLS_WITH_INTERNAL_DEBUGGER_MANAGEMENT.has(options.toolName) &&
    !TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE.has(options.toolName)
  ) {
    recordEvent({
      domain: 'tool-runtime',
      event: 'tool.debugger.attach.start',
      ids: { requestId, tabId }
    });
    try {
      let wasAttached = false;
      try {
        wasAttached = await withTimeout(
          cdpDebugger.isDebuggerAttached(tabId),
          DEBUGGER_ATTACH_TIMEOUT_MS,
          'Timed out checking debugger attachment'
        );
      } catch {
        wasAttached = false;
      }
      await withTimeout(
        cdpDebugger.attachDebugger(tabId),
        DEBUGGER_ATTACH_TIMEOUT_MS,
        'Timed out attaching debugger'
      );
      if (!wasAttached) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      recordEvent({
        domain: 'tool-runtime',
        event: 'tool.debugger.attach.end',
        ids: { requestId, tabId },
        data: { success: true, wasAttached }
      });
    } catch (attachErr) {
      const isInternalPage =
        url === undefined ||
        url === '' ||
        url?.startsWith('chrome://') ||
        url?.startsWith('chrome-extension://') ||
        url?.startsWith('edge://') ||
        url?.startsWith('brave://') ||
        url?.startsWith('about:');
      recordError(
        'tool-runtime',
        'tool.debugger.attach.end',
        attachErr,
        { requestId, tabId },
        {
          success: false,
          isInternalPage,
          urlOrigin: url ? redactUrl(url) : undefined
        }
      );
      if (
        !isInternalPage &&
        !TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE.has(options.toolName)
      ) {
        trackEvent('superduck.mcp.tool_called', {
          tool_name: options.toolName,
          client_id: options.clientId,
          model: await getSelectedModel(),
          success: false,
          error_type: 'debugger_attach_failed',
          duration_ms: Date.now() - startTime
        });
        return createErrorResponse(
          `Failed to attach debugger to tab: ${attachErr instanceof Error ? attachErr.message : String(attachErr)}. The user may have declined the Chrome debugger prompt, or the tab may have been closed. Please try again or use a different tab.`
        );
      }
      console.warn(
        `[executeTool] continuing ${options.toolName} without debugger after attach failure:`,
        attachErr
      );
    }
  }

  let errorType: string | undefined;
  let isError: boolean;

  try {
    if (tabId !== undefined) {
      await startToolContext(tabId, options.toolName, requestId, (err) => {
        navigationBlockedError = err;
        navigationBlockedTime = Date.now();
      });
    }

    const executor = await getOrCreateToolExecutor(tabId, options.tabGroupId);

    recordEvent({
      domain: 'tool-runtime',
      event: 'tool.executor.start',
      ids: { requestId, tabId, tabGroupId: options.tabGroupId },
      data: { toolName: options.toolName, source: options.source ?? 'sidepanel' }
    });

    if (options.messagesClient) {
      executor.context.messagesClient = options.messagesClient;
    }

    const processOptions: ToolExecutorProcessOptions = {};

    if (options.permissionMode && 'ask' !== options.permissionMode) {
      const permManager = createBridgePermissionManager(
        options.permissionMode,
        options.allowedDomains
      );
      if (permManager) {
        processOptions.permissionManager = permManager;
      }
    }

    if ('bridge' === options.source || 'native-messaging' === options.source) {
      const bridgeToolUseId = options.toolUseId;
      const bridgePermissionFn = requestBridgePermissionFn;
      if (options.handlePermissionPrompts && bridgeToolUseId && bridgePermissionFn) {
        processOptions.onPermissionRequired = async (permissionData: PermissionPromptRequest) =>
          bridgePermissionFn(bridgeToolUseId, permissionData);
      }
    } else if (options.onPermissionRequired) {
      processOptions.onPermissionRequired = options.onPermissionRequired;
    } else if (options.handlePermissionPrompts) {
      processOptions.onPermissionRequired = async (
        permissionData: PermissionPromptRequest,
        permTabId: number
      ) => await showPermissionPrompt(permissionData, permTabId ?? tabId);
    }

    [toolResult] = await executor.processToolResults(
      [
        {
          type: 'tool_use',
          id: requestId,
          name: options.toolName,
          input: options.args
        }
      ],
      processOptions
    );
    isError = true === toolResult?.is_error;
    recordEvent({
      domain: 'tool-runtime',
      event: 'tool.execute.end',
      ids: { requestId, tabId },
      data: {
        success: !isError,
        resultType: isError ? 'is_error' : 'success',
        durationMs: Date.now() - startTime
      }
    });
  } catch (err) {
    isError = true;
    if (
      err instanceof Error &&
      (err.message.includes('401') ||
        err.message.includes('authentication') ||
        err.message.includes('invalid x-api-key'))
    ) {
      invalidateCachedClient();
      errorType = 'authentication_failed';
      toolResult = createErrorResponse(
        'Authentication failed. The extension may need to be re-authenticated. Please check your login status in the extension or configure an API key in settings.'
      );
    } else {
      errorType = 'execution_error';
      toolResult = createErrorResponse(err instanceof Error ? err.message : String(err));
    }
    recordError(
      'tool-runtime',
      'tool.execute.end',
      err,
      { requestId, tabId },
      {
        success: false,
        resultType: errorType ?? 'exception',
        durationMs: Date.now() - startTime
      }
    );
  }

  if (tabId !== undefined) {
    cleanupAfterToolExecution(tabId, clientId);
  }

  const appName = url ? extractAppName(url) : undefined;

  const mcpArgs = isRecord(options.args) ? options.args : {};
  const mcpInputFields: Record<string, unknown> = {};
  if (typeof mcpArgs.action === 'string') mcpInputFields.action = mcpArgs.action;
  if (typeof mcpArgs.filter === 'string') mcpInputFields.input_filter = mcpArgs.filter;
  if (typeof mcpArgs.depth === 'number') mcpInputFields.input_depth = mcpArgs.depth;
  if (typeof mcpArgs.limit === 'number') mcpInputFields.input_limit = mcpArgs.limit;
  if (typeof mcpArgs.clear === 'boolean') mcpInputFields.input_clear = mcpArgs.clear;
  if (typeof mcpArgs.diff === 'boolean') mcpInputFields.input_diff = mcpArgs.diff;
  if (typeof mcpArgs.newTab === 'boolean') mcpInputFields.input_new_tab = mcpArgs.newTab;
  if (typeof mcpArgs.full === 'boolean') mcpInputFields.input_full = mcpArgs.full;

  trackEvent('superduck.mcp.tool_called', {
    tool_name: options.toolName,
    client_id: clientId,
    model,
    success: !isError,
    tab_id: tabId,
    tab_group_id: options.tabGroupId,
    duration_ms: Date.now() - startTime,
    ...mcpInputFields,
    ...(domain && { domain }),
    ...(appName && { app: appName }),
    ...(errorType && { error_type: errorType })
  });

  recordEvent({
    domain: 'tool-runtime',
    event: 'tool.response.sent',
    ids: { requestId, tabId, tabGroupId: options.tabGroupId },
    data: {
      success: !isError,
      resultType: isError ? (errorType ?? 'is_error') : 'success',
      durationMs: Date.now() - startTime
    }
  });

  return toolResult;
}
