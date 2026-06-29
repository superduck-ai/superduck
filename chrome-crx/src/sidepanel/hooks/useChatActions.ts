import { useCallback } from 'react';
import { setStorageValue } from '../../extensionServices';
import { tabGroupManager } from '../../mcpRuntime/tabState/tabGroups';
import { trackEvent } from '../../mcpRuntime';
import { getTabSessionKey } from '../sidepanelGuards';
import { createId } from '../sidepanelUtils';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useAttachmentStore } from '../stores/attachmentStore';
import type { PermissionManager } from '@/permissions/PermissionManager';
import type { ChatRole, VisibleChatRole } from '../types';

export interface UseChatActionsProps {
  sessionTabId: number | undefined;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  permissionResolveRef: React.MutableRefObject<((value: boolean) => void) | null>;
  permissionManagerRef: React.MutableRefObject<PermissionManager | null>;
  hasApprovedPlanRef: React.MutableRefObject<boolean>;
  hasLoadedSessionRef: React.MutableRefObject<boolean>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
  querySessionId: string | undefined;
  flushSession: () => void;
  streamingTextStoreRef: React.MutableRefObject<{
    set: (text: string) => void;
    getSnapshot: () => string;
  }>;
  lastSentPayloadRef: React.MutableRefObject<any>;
  notificationBannerTimerRef: React.MutableRefObject<number | null>;
}

/**
 * useChatActions — 聊天相关操作
 * 封装 clearConversation, handleLoadHistorySession 等核心操作
 */
export function useChatActions({
  sessionTabId,
  lockedTabIdRef,
  abortControllerRef,
  permissionResolveRef,
  permissionManagerRef,
  hasApprovedPlanRef,
  hasLoadedSessionRef,
  sessionCreatedAtRef,
  querySessionId,
  flushSession,
  streamingTextStoreRef,
  lastSentPayloadRef,
  notificationBannerTimerRef
}: UseChatActionsProps) {
  // Store reads
  const messages = useChatStore((s) => s.messages);
  const setMessages = useChatStore((s) => s.setMessages);
  const setApiMessages = useChatStore((s) => s.setApiMessages);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const setActiveConversationUuid = useSessionStore((s) => s.setActiveConversationUuid);
  const setActiveRemoteSessionId = useSessionStore((s) => s.setActiveRemoteSessionId);
  const setIsAgentRunning = useAgentStore((s) => s.setIsAgentRunning);
  const setTokensSaved = useAgentStore((s) => s.setTokensSaved);
  const setRuntimeError = useAgentStore((s) => s.setRuntimeError);
  const setLastStopReason = useAgentStore((s) => s.setLastStopReason);
  const setPermissionPrompt = usePermissionStore((s) => s.setPermissionPrompt);
  const setPermissionMode = usePermissionStore((s) => s.setPermissionMode);
  const setPendingAttachments = useAttachmentStore((s) => s.setPendingAttachments);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const setAttachmentCount = useAttachmentStore((s) => s.setAttachmentCount);

  const clearConversation = useCallback(() => {
    const conversationTabId = lockedTabIdRef.current ?? sessionTabId;
    const hadMessages = messages.length > 0;
    setMessages([]);
    if (hadMessages) {
      void trackEvent('superduck.sidebar.conversation_cleared', { had_messages: true });
    }
    abortControllerRef.current?.abort();
    setIsAgentRunning(false);
    if (typeof conversationTabId === 'number') {
      chrome.tabs.sendMessage(conversationTabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
      tabGroupManager.setTabIndicatorState(conversationTabId, 'none').catch(() => {});
    }
    setApiMessages([]);
    setTokensSaved(null);
    setRuntimeError(null);
    setLastStopReason(null);
    setActiveConversationUuid(null);
    setActiveRemoteSessionId(null);
    if (permissionResolveRef.current) {
      permissionResolveRef.current(false);
      permissionResolveRef.current = null;
    }
    setPermissionPrompt(null);
    setPermissionMode('skip_all_permission_checks');
    hasApprovedPlanRef.current = false;
    permissionManagerRef.current?.clearTurnApprovedDomains();
    flushSession();
    hasLoadedSessionRef.current = false;
    if (!querySessionId) {
      const nextSessionId = crypto.randomUUID();
      sessionCreatedAtRef.current = Date.now();
      setActiveSessionId(nextSessionId);
      if (typeof conversationTabId === 'number') {
        void setStorageValue(getTabSessionKey(conversationTabId), nextSessionId);
      }
    }
  }, [
    flushSession,
    lockedTabIdRef,
    messages.length,
    querySessionId,
    sessionTabId,
    setMessages,
    setApiMessages,
    setIsAgentRunning,
    setTokensSaved,
    setRuntimeError,
    setLastStopReason,
    setActiveConversationUuid,
    setActiveRemoteSessionId,
    setPermissionPrompt,
    setPermissionMode,
    setActiveSessionId,
    abortControllerRef,
    permissionResolveRef,
    hasApprovedPlanRef,
    hasLoadedSessionRef,
    sessionCreatedAtRef,
    permissionManagerRef
  ]);

  const handleLoadHistorySession = useCallback(
    (sessionId: string, conversationUuid?: string) => {
      if (sessionId === activeSessionId) return;
      void trackEvent('superduck.sidebar.history_session_loaded', {});
      const conversationTabId = lockedTabIdRef.current ?? sessionTabId;
      abortControllerRef.current?.abort();
      setIsAgentRunning(false);
      if (typeof conversationTabId === 'number') {
        chrome.tabs
          .sendMessage(conversationTabId, { type: 'HIDE_AGENT_INDICATORS' })
          .catch(() => {});
        tabGroupManager.setTabIndicatorState(conversationTabId, 'none').catch(() => {});
      }
      setMessages([]);
      setApiMessages([]);
      setRuntimeError(null);
      setLastStopReason(null);
      setTokensSaved(null);
      streamingTextStoreRef.current.set('');
      setPendingAttachments([]);
      setPreviewAttachmentImage(null);
      setAttachmentCount(0);
      lastSentPayloadRef.current = null;
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }
      if (permissionResolveRef.current) {
        permissionResolveRef.current(false);
        permissionResolveRef.current = null;
      }
      setPermissionPrompt(null);
      flushSession();
      hasLoadedSessionRef.current = false;
      setActiveConversationUuid(conversationUuid || null);
      setActiveRemoteSessionId(null);
      sessionCreatedAtRef.current = Date.now();
      setActiveSessionId(sessionId);
      if (typeof conversationTabId === 'number') {
        void setStorageValue(getTabSessionKey(conversationTabId), sessionId);
      }
    },
    [
      activeSessionId,
      lockedTabIdRef,
      sessionTabId,
      abortControllerRef,
      permissionResolveRef,
      hasLoadedSessionRef,
      sessionCreatedAtRef,
      streamingTextStoreRef,
      lastSentPayloadRef,
      notificationBannerTimerRef,
      flushSession,
      setMessages,
      setApiMessages,
      setRuntimeError,
      setLastStopReason,
      setTokensSaved,
      setPendingAttachments,
      setPreviewAttachmentImage,
      setAttachmentCount,
      setPermissionPrompt,
      setIsAgentRunning,
      setActiveSessionId,
      setActiveConversationUuid,
      setActiveRemoteSessionId
    ]
  );

  const pushMessage = useCallback((role: ChatRole, text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: createId(), role, text }]);
  }, []);

  const appendVisibleLocalMessages = useCallback(
    (entries: Array<{ role: VisibleChatRole; text: string }>) => {
      const visibleEntries = entries.filter(({ text }) => text.trim().length > 0);
      if (visibleEntries.length === 0) return;

      setMessages((prev) => [
        ...prev,
        ...visibleEntries.map(({ role, text }) => ({ id: createId(), role, text }))
      ]);
      setApiMessages((prev) => [
        ...prev,
        ...visibleEntries.map(({ role, text }) => ({
          role,
          content: text,
          isLocalOnlyMessage: true
        }))
      ]);
    },
    []
  );

  const updateLastAssistantMessage = useCallback((text: string) => {
    // During streaming, only update the external store — avoids re-rendering the
    // entire SidepanelApp component tree on every rAF frame.
    streamingTextStoreRef.current.set(text);
  }, []);

  // Flush streaming text to messages state (call once at end of streaming)
  const flushStreamingText = useCallback(() => {
    const text = streamingTextStoreRef.current.getSnapshot();
    if (text) {
      setMessages((prev) => {
        // Find the last assistant message — not just the last element — because
        // tool calls insert system messages (e.g. "🔧 tool_name") after the
        // assistant placeholder, which would cause the naive lastIndex check
        // to silently drop the streamed text.
        let lastAssistantIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') {
            lastAssistantIdx = i;
            break;
          }
        }
        if (lastAssistantIdx < 0) return prev;
        const updated = [...prev];
        updated[lastAssistantIdx] = { ...updated[lastAssistantIdx], text };
        return updated;
      });
    }
    streamingTextStoreRef.current.set('');
  }, []);

  return {
    clearConversation,
    handleLoadHistorySession,
    pushMessage,
    appendVisibleLocalMessages,
    updateLastAssistantMessage,
    flushStreamingText
  };
}
