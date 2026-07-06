import { useCallback } from 'react';
import { trackEvent, executeTool } from '../../mcpRuntime';
import { tabGroupManager } from '../../mcpRuntime/tabState/tabGroups';
import { usePermissionStore } from '../stores/permissionStore';
import { PermissionDuration } from '../../extensionServices';
import { isPermissionPromptData } from '@/sidepanel/components/PermissionPrompt';
import { formatToolResult, getErrorMessage } from '../conversation/messageProcessing';
import { normalizeToolResultContent } from '../sidepanelGuards';
import { getBrowserBatchActions } from '../toolViews/toolDisplay';
import { isRecord } from '../../messageTypes';
import type { PermissionManager } from '@/permissions/PermissionManager';
import type { PermissionPromptData, PermissionGrantScope, ToolUseBlock } from '../types';
import type { ApiToolResultBlock } from '../../messageTypes';

export interface UsePermissionActionsProps {
  permissionResolveRef: React.MutableRefObject<((allowed: boolean) => void) | null>;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
  permissionManagerRef: React.MutableRefObject<PermissionManager | null>;
  permissionModeRef: React.MutableRefObject<string>;
  getPermissionManager: () => PermissionManager;
  queryTabId: number | undefined;
  effectiveMessagesClient: unknown;
  permissionMode: string;
  activeSessionId: string;
}

/**
 * usePermissionActions — 权限相关操作
 * 封装 handlePermissionAllow, handlePermissionDeny, onPermissionRequired, executeToolUse
 */
export function usePermissionActions({
  permissionResolveRef,
  lockedTabIdRef,
  getPermissionManager,
  queryTabId,
  effectiveMessagesClient,
  permissionMode,
  activeSessionId
}: UsePermissionActionsProps) {
  const permissionPrompt = usePermissionStore((s) => s.permissionPrompt);
  const setPermissionPrompt = usePermissionStore((s) => s.setPermissionPrompt);

  const handlePermissionAllow = useCallback(
    async (duration: PermissionDuration, scope: PermissionGrantScope) => {
      if (!permissionPrompt || !permissionResolveRef.current) return;
      const pm = getPermissionManager();
      await pm.grantPermission(
        scope,
        duration,
        duration === PermissionDuration.ONCE ? permissionPrompt.toolUseId : undefined
      );
      permissionResolveRef.current(true);
      permissionResolveRef.current = null;
      setPermissionPrompt(null);
      // Re-add loading prefix to tab title
      const permissionTabId = lockedTabIdRef.current ?? queryTabId;
      if (permissionTabId != null) {
        tabGroupManager.addLoadingPrefix(permissionTabId).catch(() => {});
      }
    },
    [permissionPrompt, getPermissionManager, queryTabId]
  );

  const handlePermissionDeny = useCallback(() => {
    if (permissionResolveRef.current) {
      permissionResolveRef.current(false);
      permissionResolveRef.current = null;
    }
    setPermissionPrompt(null);
  }, []);

  const onPermissionRequired = useCallback(
    async (promptData: PermissionPromptData): Promise<boolean> => {
      setPermissionPrompt(promptData);
      // Send a Chrome notification to draw user attention
      try {
        const domain = promptData.url ? new URL(promptData.url).hostname : 'this page';
        chrome.runtime.sendMessage(
          { type: 'SHOW_PERMISSION_NOTIFICATION', action: 'browser_automation', domain },
          () => {
            chrome.runtime.lastError;
          }
        );
      } catch {
        /* ignore */
      }
      return new Promise<boolean>((resolve) => {
        permissionResolveRef.current = resolve;
      });
    },
    []
  );

  const executeToolUse = useCallback(
    async (toolUse: ToolUseBlock): Promise<ApiToolResultBlock> => {
      // Use the locked tab ID during agent execution to prevent tool calls
      // from being redirected to a different tab when the user switches tabs.
      // This avoids duplicate "debugging" banners and unexpected tab group creation.
      const targetTabId = lockedTabIdRef.current ?? queryTabId;
      if (typeof targetTabId !== 'number') {
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'No active tab for tool execution.',
          is_error: true
        };
      }
      const toolStart = Date.now();
      try {
        // Pass the inline permission handler directly to executeTool.
        // processToolResults in mcpRuntime handles the permission flow
        // (prompt → re-execute) using this handler, matching the bundle's
        // deferred-Promise pattern where the sidepanel manages the UI inline.
        const result = await executeTool({
          toolName: toolUse.name,
          args: toolUse.input,
          tabId: targetTabId,
          sessionId: activeSessionId,
          permissionMode,
          toolUseId: toolUse.id,
          messagesClient: effectiveMessagesClient as any,
          onPermissionRequired: async (permissionData: unknown, _permTabId: number) => {
            if (!isPermissionPromptData(permissionData)) return false;
            return onPermissionRequired(permissionData);
          }
        });

        const content = await formatToolResult({
          output: result.output,
          error: result.error,
          base64Image: result.base64Image,
          imageFormat: result.imageFormat,
          content: result.content
        });
        const hasError = isRecord(result) && result.is_error === true;
        const batchActions =
          toolUse.name === 'browser_batch' && isRecord(toolUse.input)
            ? getBrowserBatchActions(toolUse.input)
            : [];
        void trackEvent('superduck.sidebar.tool_executed', {
          tool_name: toolUse.name,
          success: !hasError,
          duration_ms: Date.now() - toolStart,
          ...(batchActions.length > 0
            ? {
                sub_action_count: batchActions.length,
                sub_actions: batchActions.map((action) => action.toolName)
              }
            : {})
        });
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: normalizeToolResultContent(content, 'Tool executed.'),
          ...(hasError ? { is_error: true } : {})
        };
      } catch (error) {
        void trackEvent('superduck.sidebar.tool_executed', {
          tool_name: toolUse.name,
          success: false,
          duration_ms: Date.now() - toolStart
        });
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Tool execution failed: ${getErrorMessage(error)}`,
          is_error: true
        };
      }
    },
    [queryTabId, onPermissionRequired, effectiveMessagesClient, permissionMode, activeSessionId]
  );

  return {
    handlePermissionAllow,
    handlePermissionDeny,
    onPermissionRequired,
    executeToolUse
  };
}
