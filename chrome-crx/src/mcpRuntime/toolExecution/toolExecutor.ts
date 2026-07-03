import type { Span } from '@opentelemetry/api';
import { PermissionDuration as PermissionDurationEnum } from '../../extensionServices';
import {
  isRecord,
  type ApiToolResultBlock,
  type ApiToolResultContentBlock
} from '../../messageTypes';
import { MessagesClient } from '../../mcpServersStore';
import { PermissionManager as PermissionManagerClass } from '@/permissions/PermissionManager';
import { withTracing } from '../../observability';
import { dispatchMessagesClient } from '../../utils/providerClient';
import { compressBase64Image } from '../../utils/imageCompressor';
import { extractAppName } from '../core/urlUtils';
import { trackEvent } from '../analytics';
import { allTools, mcpToolNames } from '../core/tools';
import type { BrowserSessionScope } from '../sessionScope';

export const MCP_NATIVE_SESSION_ID = `mcp_native_${Date.now()}`;
import { recordToolAction } from './toolRecording';
import { getSelectedModel, refreshMessagesClient } from '../providerClient';
import { showPermissionPrompt } from './permissionPrompt';
import { coerceToolInput, validateInput, isPermissionPromptRequest } from '../core/utils';
import type {
  RuntimeCreateApiMessage,
  ToolExecutorProcessOptions,
  ToolUseRequest,
  PermissionPromptHandler,
  PermissionPromptRequest,
  ErrorResponse,
  ExecuteToolResponse
} from '../core/types';
import type { ToolResult, ToolTabSummary } from '../pageToolsSupport/types';

export interface ToolExecutorContext {
  tabId?: number;
  tabGroupId?: number;
  model: string;
  sessionId: string;
  browserSessionScope?: BrowserSessionScope;
  messagesClient?: MessagesClient;
  permissionManager: PermissionManagerClass;
  onPermissionRequired?: PermissionPromptHandler;
  refreshClient?: () => Promise<MessagesClient | undefined>;
}

export class ToolExecutor {
  context: ToolExecutorContext;

  constructor(context: ToolExecutorContext) {
    this.context = context;
  }

  async handleToolCall(
    toolName: string,
    toolInput: unknown,
    toolUseId: string,
    permissions?: string,
    domain?: string,
    spanParent?: Span,
    url?: string,
    permissionManagerOverride?: PermissionManagerClass
  ): Promise<ToolResult> {
    const action =
      isRecord(toolInput) && typeof toolInput.action === 'string' ? toolInput.action : undefined;
    return await withTracing(
      `tool_execution_${toolName}${action ? '_' + action : ''}`,
      async (span: Span) => {
        if (!this.context.tabId && !mcpToolNames.includes(toolName)) {
          throw new Error('No tab available');
        }
        span.setAttribute('session_id', this.context.sessionId);
        span.setAttribute('tool_name', toolName);
        if (permissions) span.setAttribute('permissions', permissions);
        if (action) span.setAttribute('action', action);

        const executionContext = {
          toolUseId,
          tabId: this.context.tabId,
          tabGroupId: this.context.tabGroupId,
          model: this.context.model,
          sessionId: this.context.sessionId,
          browserSessionScope: this.context.browserSessionScope,
          messagesClient: this.context.messagesClient,
          permissionManager: permissionManagerOverride ?? this.context.permissionManager,
          createApiMessage: this.createApiMessage(),
          availableTools: allTools
        };

        const tool = allTools.find((t) => t.name === toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);

        const trackData: Record<string, unknown> = {
          name: toolName,
          sessionId: this.context.sessionId,
          permissions,
          quick_mode: false
        };
        if ('computer' === toolName && action) {
          trackData.action = action;
        }
        if (domain) {
          trackData.domain = domain;
        }
        if (url) {
          const appName = extractAppName(url);
          if (appName) trackData.app = appName;
        }

        // Audit: include safe, low-cardinality input fields for traceability.
        // Per RoboCFO: "record every action, tool call." Avoid PII — only
        // include structural parameters (filter, depth, mode), not user data.
        const input = isRecord(toolInput) ? toolInput : {};
        if (typeof input.filter === 'string') trackData.input_filter = input.filter;
        if (typeof input.depth === 'number') trackData.input_depth = input.depth;
        if (typeof input.limit === 'number') trackData.input_limit = input.limit;
        if (typeof input.clear === 'boolean') trackData.input_clear = input.clear;
        if (typeof input.diff === 'boolean') trackData.input_diff = input.diff;
        if (typeof input.newTab === 'boolean') trackData.input_new_tab = input.newTab;
        if (typeof input.full === 'boolean') trackData.input_full = input.full;
        if (typeof input.allowCrossOrigin === 'boolean')
          trackData.input_cross_origin = input.allowCrossOrigin;

        try {
          const coercedInput = coerceToolInput(toolName, toolInput, allTools);
          // Schema-driven runtime validation. The `parameters` declaration
          // on each `ToolDefinition` already specifies `minimum` / `maximum`
          // / `enum` / `required` / etc — `coerceToolInputTypes` only does
          // string→number / string→boolean coercion, so the *enforcement*
          // has to live somewhere. Doing it here, before `tool.execute()`,
          // means a malicious or buggy model that passes an out-of-range
          // `duration: 999` to the `computer` tool gets a structured error
          // instead of letting the bad value flow into the CDP layer.
          const validation = validateInput(toolName, coercedInput, allTools);
          if (!validation.valid) {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'invalid_input');
            return createErrorResponse(
              `Invalid input for ${toolName}: ${validation.errors.join('; ')}`
            );
          }
          const result = await tool.execute(coercedInput, executionContext);
          const failed =
            result.type === 'permission_required' || !!result.error || result.is_error === true;

          if (result.type === 'permission_required') {
            trackData.success = false;
            span.setAttribute('success', false);
            span.setAttribute('failure_reason', 'needs_permission');
          } else {
            trackData.success = !failed;
            span.setAttribute('success', !failed);
            if (failed) span.setAttribute('failure_reason', 'tool_error');
          }

          if (!failed && executionContext.tabId) {
            await recordToolAction(toolName, coercedInput, executionContext.tabId);
          }

          void trackEvent('superduck.chat.tool_called', trackData);
          return result;
        } catch (err) {
          void trackEvent('superduck.chat.tool_called', {
            ...trackData,
            success: false,
            failureReason: 'exception'
          });
          throw err;
        }
      },
      spanParent
    );
  }

  createApiMessage(): RuntimeCreateApiMessage | undefined {
    if (this.context.messagesClient || this.context.refreshClient) {
      return async (params, _label) => {
        if (this.context.refreshClient) {
          const refreshed = await this.context.refreshClient();
          if (refreshed) this.context.messagesClient = refreshed;
        }
        if (!this.context.messagesClient) {
          throw new Error('API client not available');
        }
        const { modelClass: _modelClass, maxTokens, max_tokens: legacyMaxTokens, ...rest } = params;
        // model is now the selected provider id; tier/fast-model switching removed.
        const model = this.context.model;
        // Dispatch to the selected provider (falls back to context.messagesClient).
        const dispatched = await dispatchMessagesClient(model, this.context.messagesClient);
        const requestedMaxTokens = maxTokens ?? legacyMaxTokens;
        if (typeof requestedMaxTokens !== 'number') {
          throw new Error('maxTokens is required');
        }
        return await dispatched.runtime.create({
          ...rest,
          max_tokens: requestedMaxTokens,
          model: dispatched.modelId
        });
      };
    }
    return undefined;
  }

  async processToolResults(
    toolUses: ToolUseRequest[],
    options?: ToolExecutorProcessOptions
  ): Promise<ExecuteToolResponse[]> {
    const results: ExecuteToolResponse[] = [];

    const formatContent = async (result: ToolResult): Promise<ApiToolResultBlock['content']> => {
      if (result.error) return result.error;
      const content: ApiToolResultContentBlock[] = [];
      if (result.output) {
        content.push({ type: 'text', text: result.output });
      }
      if (typeof result.content === 'string') {
        content.push({ type: 'text', text: result.content });
      } else if (Array.isArray(result.content)) {
        content.push(...(result.content as ApiToolResultContentBlock[]));
      }
      if (result.tabContext) {
        const availableTabs = result.tabContext.availableTabs ?? [];
        const tabContextText = `\n\nTab Context:${result.tabContext.executedOnTabId ? `\n- Executed on tabId: ${result.tabContext.executedOnTabId}` : ''}\n- Available tabs:\n${availableTabs.map((tab: ToolTabSummary) => `  • tabId ${tab.id}: "${tab.title}" (${tab.url})`).join('\n')}`;
        content.push({ type: 'text', text: tabContextText });
      }
      if (result.base64Image) {
        const rawMediaType = result.imageFormat ? `image/${result.imageFormat}` : 'image/png';
        const { data, mediaType } = await compressBase64Image(result.base64Image, rawMediaType);
        const normalizedMediaType =
          mediaType === 'image/jpeg' ||
          mediaType === 'image/png' ||
          mediaType === 'image/gif' ||
          mediaType === 'image/webp'
            ? mediaType
            : 'image/png';
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedMediaType,
            data
          }
        });
      }
      return content.length > 0 ? content : '';
    };

    const formatToolResult = async (
      toolUseId: string,
      result: ToolResult
    ): Promise<ExecuteToolResponse> => {
      const isError = !!result.error || result.is_error === true;
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: await formatContent(result),
        ...(result.tabContext && { tabContext: result.tabContext }),
        ...(isError && { is_error: true })
      };
    };

    for (const toolUse of toolUses) {
      try {
        const result = await this.handleToolCall(
          toolUse.name,
          toolUse.input,
          toolUse.id,
          undefined,
          undefined,
          undefined,
          undefined,
          options?.permissionManager
        );

        if (isPermissionPromptRequest(result)) {
          const handler = options?.onPermissionRequired ?? this.context.onPermissionRequired;
          if (!handler || !this.context.tabId) {
            results.push(
              await formatToolResult(toolUse.id, {
                error: 'Permission required but no handler or tab id available'
              })
            );
            continue;
          }
          const allowed = await handler(result, this.context.tabId);
          if (!allowed) {
            results.push(
              await formatToolResult(toolUse.id, {
                error:
                  'update_plan' === toolUse.name
                    ? 'Plan rejected by user. Ask the user how they would like to change the plan.'
                    : 'Permission denied by user'
              })
            );
            continue;
          }
          if ('update_plan' === toolUse.name) {
            results.push(
              await formatToolResult(toolUse.id, {
                output:
                  'User has approved your plan. You can now start executing the plan. Start with updating your todo list if applicable.'
              })
            );
            continue;
          }
          const permResult = result;
          if (permResult.url) {
            try {
              const { host } = new URL(permResult.url);
              const pm = options?.permissionManager ?? this.context.permissionManager;
              await pm.grantPermission(
                { type: 'netloc', netloc: host },
                PermissionDurationEnum.ONCE,
                permResult.toolUseId
              );
            } catch {
              // silently fail
            }
          }
          const retryResult = await this.handleToolCall(
            toolUse.name,
            toolUse.input,
            toolUse.id,
            undefined,
            undefined,
            undefined,
            undefined,
            options?.permissionManager
          );
          if (isPermissionPromptRequest(retryResult)) {
            throw new Error('Permission still required after granting');
          }
          results.push(await formatToolResult(toolUse.id, retryResult));
        } else {
          results.push(await formatToolResult(toolUse.id, result));
        }
      } catch (err) {
        results.push(
          await formatToolResult(toolUse.id, {
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        );
      }
    }
    return results;
  }
}

let toolExecutorInstance: ToolExecutor | undefined;

export async function getOrCreateToolExecutor(
  tabId?: number,
  tabGroupId?: number,
  sessionId = MCP_NATIVE_SESSION_ID,
  browserSessionScope?: BrowserSessionScope
): Promise<ToolExecutor> {
  if (toolExecutorInstance) {
    const cloned = Object.create(Object.getPrototypeOf(toolExecutorInstance)) as ToolExecutor;
    Object.assign(cloned, toolExecutorInstance);
    cloned.context = {
      ...toolExecutorInstance.context,
      tabId,
      tabGroupId,
      sessionId,
      browserSessionScope
    };
    // Refresh the messagesClient if it's missing (e.g., auth wasn't ready on first creation)
    if (!cloned.context.messagesClient) {
      const refreshed = await refreshMessagesClient();
      if (refreshed) {
        toolExecutorInstance.context.messagesClient = refreshed;
        cloned.context.messagesClient = refreshed;
      }
    }
    return cloned;
  }
  const [client, model] = await Promise.all([refreshMessagesClient(), getSelectedModel()]);
  toolExecutorInstance = new ToolExecutor({
    messagesClient: client,
    permissionManager: new PermissionManagerClass(() => false, {}),
    sessionId,
    browserSessionScope,
    tabId,
    tabGroupId,
    model,
    onPermissionRequired: async (permission: PermissionPromptRequest, tabId: number) =>
      await showPermissionPrompt(permission, tabId),
    refreshClient: refreshMessagesClient
  });
  return toolExecutorInstance;
}

export const createErrorResponse = (text: string): ErrorResponse => ({
  content: [{ type: 'text', text }],
  is_error: true
});
