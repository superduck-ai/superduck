import { useCallback } from 'react';
import { StorageKeys, setStorageValue } from '../../extensionServices';
import { trackEvent } from '../../mcpRuntime';
import { getTextFromBlockContent } from '../sidepanelUtils';
import { getErrorMessage } from '../conversation/messageProcessing';
import type { ApiConversationMessage } from '../../messageTypes';
import type { PendingPromptPayload } from '../types';

export interface UseActionCallbacksProps {
  effectiveIsAgentRunning: boolean;
  isConvertingToTask: boolean;
  setIsConvertingToTask: (value: boolean) => void;
  effectiveApiMessages: ApiConversationMessage[];
  input: string;
  permissionMode: string;
  effectiveSelectedModel: string;
  setRuntimeError: (error: string | null) => void;
  setIsHeaderMenuOpen: (open: boolean) => void;
  setIsLanguageSubmenuOpen: (open: boolean) => void;
  pendingPrompt: PendingPromptPayload | null;
  setPendingPrompt: (prompt: PendingPromptPayload | null) => void;
  setInput: (value: string) => void;
  setPopulatedInputTargetTabId: (tabId: number | undefined) => void;
  effectiveSendPrompt: (prompt: string, options?: any) => void;
  setHasBrowserControlPermissionAccepted: (accepted: boolean) => void;
  queryTabId: number | undefined;
  blockedTabInfo: {
    isMainTabBlocked: boolean;
    blockedTabs: Array<{ tabId: number; category: string }>;
  };
  announcementConfig: { id?: string; enabled?: boolean; text?: string };
  setAnnouncementDismissed: (dismissed: boolean) => void;
  setRefusalFeedbackSent: (sent: boolean) => void;
  activeSessionId: string;
  selectedModel: string;
  fallbackConfig: { fallbackModelName?: string } | undefined;
}

/**
 * useActionCallbacks — 各种操作回调函数
 * 封装任务转换、权限接受、站点关闭、公告关闭、反馈发送等操作
 */
export function useActionCallbacks({
  effectiveIsAgentRunning,
  isConvertingToTask,
  setIsConvertingToTask,
  effectiveApiMessages,
  input,
  permissionMode,
  effectiveSelectedModel,
  setRuntimeError,
  setIsHeaderMenuOpen,
  setIsLanguageSubmenuOpen,
  pendingPrompt,
  setPendingPrompt,
  setInput,
  setPopulatedInputTargetTabId,
  effectiveSendPrompt,
  setHasBrowserControlPermissionAccepted,
  queryTabId,
  blockedTabInfo,
  announcementConfig,
  setAnnouncementDismissed,
  setRefusalFeedbackSent,
  activeSessionId,
  selectedModel,
  fallbackConfig
}: UseActionCallbacksProps) {
  const handleConvertToScheduledTask = useCallback(() => {
    if (effectiveIsAgentRunning || isConvertingToTask) return;
    const lastUserPrompt = [...effectiveApiMessages].reverse().find((message) => {
      if (message.role !== 'user') return false;
      const text =
        typeof message.content === 'string'
          ? message.content
          : getTextFromBlockContent(message.content, '');
      return text.trim().length > 0;
    });
    const resolvedLastUserPrompt = lastUserPrompt
      ? typeof lastUserPrompt.content === 'string'
        ? lastUserPrompt.content
        : getTextFromBlockContent(lastUserPrompt.content, '')
      : '';
    const promptToConvert = (resolvedLastUserPrompt || input).trim();
    if (!promptToConvert) {
      setRuntimeError('Nothing to convert yet. Send a message first.');
      setIsHeaderMenuOpen(false);
      setIsLanguageSubmenuOpen(false);
      return;
    }

    setIsConvertingToTask(true);
    setIsHeaderMenuOpen(false);
    setIsLanguageSubmenuOpen(false);
    void (async () => {
      try {
        const taskDraft = {
          id: `prompt_${Date.now()}`,
          command: '',
          prompt: promptToConvert,
          repeatType: 'none',
          skipPermissions: permissionMode === 'skip_all_permission_checks',
          model: effectiveSelectedModel,
          createdAt: Date.now(),
          usageCount: 0
        };
        const response = await chrome.runtime.sendMessage({
          type: 'OPEN_OPTIONS_WITH_TASK',
          task: taskDraft
        });
        if (response && response.success === false) {
          throw new Error(
            typeof response.error === 'string' ? response.error : 'Failed to open task editor.'
          );
        }
      } catch (error) {
        setRuntimeError(`Unable to open task editor: ${getErrorMessage(error)}`);
      } finally {
        setIsConvertingToTask(false);
      }
    })();
  }, [
    effectiveSelectedModel,
    input,
    effectiveIsAgentRunning,
    isConvertingToTask,
    effectiveApiMessages,
    permissionMode
  ]);

  const acceptBrowserControlPermission = useCallback(async () => {
    await setStorageValue(StorageKeys.BROWSER_CONTROL_PERMISSION_ACCEPTED, true);
    setHasBrowserControlPermissionAccepted(true);
    void trackEvent('superduck.sidebar.browser_permission_accepted', {});
    if (pendingPrompt) {
      void effectiveSendPrompt(pendingPrompt.prompt, {
        attachments: pendingPrompt.attachments,
        isAnnotated: pendingPrompt.isAnnotated,
        targetTabId: pendingPrompt.targetTabId
      });
      setPendingPrompt(null);
      setInput('');
      setPopulatedInputTargetTabId(undefined);
    }
  }, [pendingPrompt, effectiveSendPrompt]);

  const closeBlockedSites = useCallback(async () => {
    if (typeof queryTabId !== 'number') return;
    const blockedTabs = blockedTabInfo.blockedTabs.filter((item) => item.tabId !== queryTabId);
    for (const blockedTab of blockedTabs) {
      try {
        await chrome.tabs.remove(blockedTab.tabId);
      } catch {
        // ignore close failures
      }
    }
  }, [blockedTabInfo.blockedTabs, queryTabId]);

  const dismissAnnouncement = useCallback(async () => {
    const announcementId = announcementConfig.id || '';
    setAnnouncementDismissed(true);
    await setStorageValue(StorageKeys.ANNOUNCEMENT_DISMISSED, announcementId);
  }, [announcementConfig.id]);

  const sendRefusalFeedback = useCallback(async () => {
    setRefusalFeedbackSent(true);
    try {
      await chrome.runtime.sendMessage({
        type: 'superduck.chat.feedback',
        category: 'sc/false_positive',
        sentiment: 'negative',
        sessionId: activeSessionId,
        currentModel: selectedModel,
        fallbackModel: fallbackConfig?.fallbackModelName ?? undefined
      });
    } catch {
      // swallow missing listeners
    }
    chrome.tabs.create({
      url: 'https://superduck-ai.github.io/superduck/'
    });
  }, [activeSessionId, fallbackConfig?.fallbackModelName, selectedModel]);

  return {
    handleConvertToScheduledTask,
    acceptBrowserControlPermission,
    closeBlockedSites,
    dismissAnnouncement,
    sendRefusalFeedback
  };
}
