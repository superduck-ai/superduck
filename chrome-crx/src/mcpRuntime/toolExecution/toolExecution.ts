import { isRecord } from '../../messageTypes';
import type { MessagesClient } from '../../mcpServersStore';
import { cdpDebugger } from '../browserAutomation';
import { trackEvent } from '../analytics';
import { tabGroupManager } from '../tabState';
import { BrowserSessionConflictError } from '../tabState/tabLeases';
import { beginTool, endTool } from '../agentActivity';
import { showPermissionPrompt } from './permissionPrompt';
import { createBridgePermissionManager } from '../domainPermissions';
import { startToolContext, cleanupAfterToolExecution } from './toolContextState';
import { getSelectedModel, invalidateCachedClient } from '../providerClient';
import {
  getOrCreateToolExecutor,
  createErrorResponse,
  MCP_NATIVE_SESSION_ID
} from './toolExecutor';
import { getToolTabAccess, hasTool, mcpToolNames } from '../core/tools';
import { withTimeout } from '../core/utils';
import { extractAppName } from '../core/urlUtils';
import {
  hasReservedBrowserSessionArgs,
  reservedBrowserSessionArgsError,
  resolveToolExecutionSession
} from '../sessionScope';
import type {
  ExecuteToolResponse,
  PermissionPromptHandler,
  PermissionPromptRequest,
  ToolExecutorProcessOptions
} from '../core/types';

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
  sessionId?: string;
  browserSessionId?: string;
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
  const argsRecord = isRecord(options.args) ? options.args : {};
  if (hasReservedBrowserSessionArgs(argsRecord)) {
    return createErrorResponse(reservedBrowserSessionArgsError());
  }
  const { sessionId, browserScope } = resolveToolExecutionSession({
    defaultSessionId: MCP_NATIVE_SESSION_ID,
    sessionId: options.sessionId,
    browserSessionId: options.browserSessionId
  });
  if (!hasTool(options.toolName)) {
    trackEvent('superduck.mcp.tool_called', {
      tool_name: options.toolName,
      client_id: clientId,
      model,
      success: false,
      error_type: 'unknown_tool',
      duration_ms: Date.now() - startTime
    });
    return createErrorResponse(`Unknown tool: ${options.toolName}`);
  }

  if (navigationBlockedError && navigationBlockedTime) {
    if (Date.now() - navigationBlockedTime < NAVIGATION_BLOCK_TIMEOUT) {
      const errorMsg = navigationBlockedError;
      navigationBlockedError = undefined;
      navigationBlockedTime = undefined;
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
  const toolTabAccess = getToolTabAccess(options.toolName, argsRecord);

  try {
    const skipTabLookup = mcpToolNames.includes(options.toolName) && options.tabId === undefined;
    if (!skipTabLookup) {
      const tabInfo = await tabGroupManager.getTabForMcp(options.tabId, options.tabGroupId, {
        sessionId: browserScope.sessionId,
        claimUnleased: toolTabAccess === 'write',
        source: options.source
      });
      tabId = tabInfo.tabId;
      domain = tabInfo.domain;
      url = tabInfo.url;
    }
  } catch (err) {
    const isBrowserSessionConflict = err instanceof BrowserSessionConflictError;
    const message = err instanceof Error ? err.message : String(err);
    trackEvent('superduck.mcp.tool_called', {
      tool_name: options.toolName,
      client_id: clientId,
      model,
      success: false,
      error_type: isBrowserSessionConflict ? 'browser_session_conflict' : 'no_tabs_available',
      duration_ms: Date.now() - startTime
    });
    return createErrorResponse(
      isBrowserSessionConflict
        ? message
        : 'No tabs available. Please open a new tab or window in your browser.'
    );
  }

  if (
    tabId !== undefined &&
    !TOOLS_WITH_INTERNAL_DEBUGGER_MANAGEMENT.has(options.toolName) &&
    !TOOLS_WITH_SCRIPT_FALLBACK_ON_DEBUGGER_FAILURE.has(options.toolName)
  ) {
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
    } catch (attachErr) {
      const isInternalPage =
        url === undefined ||
        url === '' ||
        url?.startsWith('chrome://') ||
        url?.startsWith('chrome-extension://') ||
        url?.startsWith('edge://') ||
        url?.startsWith('brave://') ||
        url?.startsWith('about:');
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

    const executor = await getOrCreateToolExecutor(
      tabId,
      options.tabGroupId,
      sessionId,
      browserScope,
      options.messagesClient,
      toolTabAccess
    );

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
  } catch (err) {
    isError = true;
    if (err instanceof BrowserSessionConflictError) {
      errorType = 'browser_session_conflict';
      toolResult = createErrorResponse(err.message);
    } else if (
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
  }

  if (tabId !== undefined) {
    cleanupAfterToolExecution(tabId, clientId);
  }

  const appName = url ? extractAppName(url) : undefined;

  const mcpArgs = argsRecord;
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

  return toolResult;
}
