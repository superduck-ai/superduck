import { useCallback, useEffect } from 'react';
import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import { getConversationStorageKey, getHistoryStorageKey } from '../sessionHistory';
import {
  isPermissionMode,
  type PermissionMode,
  type PromptAttachmentPayload,
  decodeBase64ToFile
} from '../sidepanelUtils';
import { isSessionSnapshot, isStringRecord } from '../sidepanelGuards';
import { SESSION_CONVERSATION_MAP_KEY, SESSION_REMOTE_MAP_KEY } from '../sidepanelGuards';
import type { PairingPromptState, PendingPromptPayload } from '../types';

export interface UseRuntimeMessagesProps {
  queryTabId: number | undefined;
  queryMode: string | undefined;
  querySessionId: string | undefined;
  querySkipPermissions: boolean | undefined;
  secondaryState: {
    isSecondaryTab: boolean;
    mainTabId: number | null;
  };
  setActiveConversationUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveRemoteSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string>>;
  setPairingPrompt: React.Dispatch<React.SetStateAction<PairingPromptState | null>>;
  setPairingName: React.Dispatch<React.SetStateAction<string>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
  setSelectedModel: (model: string) => void;
  setAttachmentCount: React.Dispatch<React.SetStateAction<number>>;
  setPendingAttachments: React.Dispatch<React.SetStateAction<PromptAttachmentPayload[]>>;
  setPreviewAttachmentImage: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingPrompt: React.Dispatch<React.SetStateAction<PendingPromptPayload | null>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  loadSnapshotForSession: (sessionId: string, conversationUuid?: string | null) => Promise<any>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
  sendPromptRef: React.MutableRefObject<((text: string, options?: any) => Promise<void>) | null>;
  isAgentRunningRef: React.MutableRefObject<boolean>;
  hasBrowserControlPermissionAcceptedRef: React.RefObject<boolean | null>;
  pushMessageRef: React.RefObject<((role: any, text: string) => void) | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  shouldDisableSkipPermissions: boolean;
}

export function useRuntimeMessages({
  queryTabId,
  queryMode,
  querySessionId,
  querySkipPermissions,
  secondaryState,
  setActiveConversationUuid,
  setActiveRemoteSessionId,
  setActiveSessionId,
  setPairingPrompt,
  setPairingName,
  setInput,
  setPermissionMode,
  setSelectedModel,
  setAttachmentCount,
  setPendingAttachments,
  setPreviewAttachmentImage,
  setPendingPrompt,
  setIsAgentRunning,
  loadSnapshotForSession,
  sessionCreatedAtRef,
  sendPromptRef,
  isAgentRunningRef,
  hasBrowserControlPermissionAcceptedRef,
  pushMessageRef,
  abortControllerRef,
  shouldDisableSkipPermissions
}: UseRuntimeMessagesProps) {
  // PANEL_OPENED
  useEffect(() => {
    if (typeof queryTabId !== 'number') return;
    void chrome.runtime.sendMessage({
      type: 'PANEL_OPENED',
      tabId: queryTabId,
      mainTabId: secondaryState.mainTabId ?? queryTabId
    });
  }, [queryTabId, secondaryState.mainTabId]);

  // PANEL_CLOSED on visibility hidden
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || typeof queryTabId !== 'number') return;
      void chrome.runtime.sendMessage({
        type: 'PANEL_CLOSED',
        tabId: queryTabId,
        mainTabId: secondaryState.mainTabId ?? queryTabId
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [queryTabId, secondaryState.mainTabId]);

  // shouldHandleTaskForCurrentContext
  const shouldHandleTaskForCurrentContext = useCallback(
    (message: any) => {
      const isWindowMode = queryMode === 'window';
      if (isWindowMode && querySessionId) {
        return message.windowSessionId === querySessionId;
      }
      if (isWindowMode || message.windowSessionId) return false;
      if (
        typeof message.targetTabId === 'number' &&
        typeof queryTabId === 'number' &&
        message.targetTabId !== queryTabId
      ) {
        return false;
      }
      return true;
    },
    [queryMode, querySessionId, queryTabId]
  );

  // Main runtime message listener
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const listener = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'PING_SIDEPANEL') {
        sendResponse({ success: true, tabId: queryTabId });
        return;
      }

      if (message.type === 'show_pairing_prompt') {
        const requestId = typeof message.request_id === 'string' ? message.request_id : '';
        if (!requestId) {
          sendResponse({ handled: false });
          return;
        }
        setPairingPrompt({
          requestId,
          clientType: typeof message.client_type === 'string' ? message.client_type : 'desktop',
          currentName: typeof message.current_name === 'string' ? message.current_name : undefined
        });
        setPairingName(typeof message.current_name === 'string' ? message.current_name : '');
        sendResponse({ handled: true });
        return;
      }

      if (message.type === 'MAIN_TAB_ACK_REQUEST') {
        if (
          typeof queryTabId === 'number' &&
          typeof message.mainTabId === 'number' &&
          queryTabId === message.mainTabId
        ) {
          void chrome.runtime.sendMessage({
            type: 'MAIN_TAB_ACK_RESPONSE',
            secondaryTabId: message.secondaryTabId,
            mainTabId: queryTabId,
            success: true
          });
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false });
        }
        return;
      }

      if (message.type === 'POPULATE_INPUT_TEXT') {
        const prompt = typeof message.prompt === 'string' ? message.prompt : '';
        setInput(prompt);
        if (isPermissionMode(message.permissionMode)) {
          if (
            shouldDisableSkipPermissions &&
            message.permissionMode === 'skip_all_permission_checks'
          ) {
            setPermissionMode('follow_a_plan');
          } else {
            setPermissionMode(message.permissionMode);
          }
        }
        if (typeof message.selectedModel === 'string') {
          setSelectedModel(message.selectedModel);
          void setStorageValue(StorageKeys.SELECTED_MODEL, message.selectedModel);
        }

        const validAttachments: PromptAttachmentPayload[] = [];
        let hasAnnotatedAttachment = false;
        if (Array.isArray(message.attachments)) {
          for (const attachment of message.attachments) {
            if (!decodeBase64ToFile(attachment)) continue;
            validAttachments.push(attachment);
            if (attachment.isAnnotated) hasAnnotatedAttachment = true;
          }
        }
        setAttachmentCount(validAttachments.length);
        setPendingAttachments(validAttachments);
        setPendingPrompt({
          prompt,
          attachments: validAttachments,
          isAnnotated: hasAnnotatedAttachment
        });
        sendResponse({ success: true });

        timeoutId = setTimeout(() => {
          if (!prompt.trim()) return;
          if (hasBrowserControlPermissionAcceptedRef.current && !isAgentRunningRef.current) {
            setInput('');
            void sendPromptRef.current?.(prompt, {
              attachments: validAttachments,
              isAnnotated: hasAnnotatedAttachment
            });
            setPendingPrompt(null);
            setPendingAttachments([]);
            setPreviewAttachmentImage(null);
            setAttachmentCount(0);
          } else {
            setPendingPrompt({
              prompt,
              attachments: validAttachments,
              isAnnotated: hasAnnotatedAttachment
            });
          }
        }, 500);
        return;
      }

      if (message.type === 'LOAD_CONVERSATION') {
        if (message.conversationUuid) {
          const targetConversationUuid = message.conversationUuid;
          void (async () => {
            const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
            const conversationMap = isStringRecord(rawMap) ? rawMap : {};
            const rawRemoteMap = await getStorageValue(SESSION_REMOTE_MAP_KEY, {});
            const remoteMap = isStringRecord(rawRemoteMap) ? rawRemoteMap : {};

            let targetSessionId = conversationMap[targetConversationUuid];
            let targetRemoteSessionId =
              typeof message.sessionId === 'string' && message.sessionId
                ? message.sessionId
                : remoteMap[targetConversationUuid];
            let targetCreatedAt = Date.now();

            if (!targetSessionId) {
              const aliasSnapshot = await getStorageValue(
                getConversationStorageKey(targetConversationUuid)
              );
              if (isSessionSnapshot(aliasSnapshot) && typeof aliasSnapshot.createdAt === 'number') {
                targetSessionId = crypto.randomUUID();
                await setStorageValue(getHistoryStorageKey(targetSessionId), aliasSnapshot);
                targetCreatedAt = aliasSnapshot.createdAt;
                if (!targetRemoteSessionId && aliasSnapshot.remoteSessionId) {
                  targetRemoteSessionId = aliasSnapshot.remoteSessionId;
                }
              } else {
                targetSessionId = crypto.randomUUID();
              }
              await setStorageValue(SESSION_CONVERSATION_MAP_KEY, {
                ...conversationMap,
                [targetConversationUuid]: targetSessionId
              });
            } else {
              const existingSnapshot = await loadSnapshotForSession(
                targetSessionId,
                targetConversationUuid
              );
              if (existingSnapshot?.createdAt && typeof existingSnapshot.createdAt === 'number') {
                targetCreatedAt = existingSnapshot.createdAt;
              }
              if (!targetRemoteSessionId && existingSnapshot?.remoteSessionId) {
                targetRemoteSessionId = existingSnapshot.remoteSessionId;
              }
            }

            if (
              targetRemoteSessionId &&
              remoteMap[targetConversationUuid] !== targetRemoteSessionId
            ) {
              await setStorageValue(SESSION_REMOTE_MAP_KEY, {
                ...remoteMap,
                [targetConversationUuid]: targetRemoteSessionId
              });
            }

            sessionCreatedAtRef.current = targetCreatedAt;
            setActiveConversationUuid(targetConversationUuid);
            setActiveRemoteSessionId(targetRemoteSessionId || null);
            setActiveSessionId(targetSessionId);
            sendResponse({ success: true });
          })();
          return true; // Indicate async response
        }
        sendResponse({ success: false });
        return;
      }

      if (message.type === 'EXECUTE_TASK') {
        if (!shouldHandleTaskForCurrentContext(message)) {
          sendResponse({ success: false, skipped: true });
          return;
        }
        if (querySkipPermissions) {
          setPermissionMode('skip_all_permission_checks');
        }
        const prompt = typeof message.prompt === 'string' ? message.prompt : '';
        if (prompt) {
          const taskPrompt =
            message.isScheduledTask && message.taskName
              ? `[Scheduled Task: ${message.taskName}]\n${prompt}`
              : prompt;
          setInput('');
          void sendPromptRef.current?.(taskPrompt);
        }
        sendResponse({ success: true });
        return;
      }

      if (message.type === 'STOP_AGENT') {
        if (
          typeof message.targetTabId === 'number' &&
          typeof queryTabId === 'number' &&
          message.targetTabId !== queryTabId
        ) {
          sendResponse({ success: false, skipped: true });
          return;
        }

        // Abort the current request
        abortControllerRef.current?.abort();

        // Show "Generation stopped" message
        pushMessageRef.current?.('system', 'Generation stopped.');

        // Update state
        setIsAgentRunning(false);

        sendResponse({ success: true });
        return;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      if (timeoutId) clearTimeout(timeoutId);
    };
    // sendPrompt, isAgentRunning, hasBrowserControlPermissionAccepted accessed via refs
  }, [loadSnapshotForSession, querySkipPermissions, queryTabId, shouldHandleTaskForCurrentContext]);

  return { shouldHandleTaskForCurrentContext };
}
