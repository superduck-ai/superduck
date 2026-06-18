import { useCallback, useEffect, useRef } from 'react';
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
import type { PairingPromptState, PendingPromptPayload, SendPromptOptions } from '../types';

const TARGET_SESSION_READY_TIMEOUT_MS = 2000;
const TARGET_SESSION_READY_POLL_MS = 50;
export interface UseRuntimeMessagesProps {
  queryTabId: number | undefined;
  runtimeTabId: number | undefined;
  queryMode: string | undefined;
  querySessionId: string | undefined;
  querySkipPermissions: boolean | undefined;
  activeSessionId: string;
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
  setPopulatedInputTargetTabId: React.Dispatch<React.SetStateAction<number | undefined>>;
  setPendingPrompt: React.Dispatch<React.SetStateAction<PendingPromptPayload | null>>;
  setIsAgentRunning: React.Dispatch<React.SetStateAction<boolean>>;
  loadSnapshotForSession: (sessionId: string, conversationUuid?: string | null) => Promise<any>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
  hasLoadedSessionRef: React.MutableRefObject<boolean>;
  sendPromptRef: React.MutableRefObject<
    ((text: string, options?: SendPromptOptions) => Promise<void>) | null
  >;
  isAgentRunningRef: React.MutableRefObject<boolean>;
  hasBrowserControlPermissionAcceptedRef: React.RefObject<boolean | null>;
  pushMessageRef: React.RefObject<((role: any, text: string) => void) | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  shouldDisableSkipPermissions: boolean;
  clearPreservedTranscriptForTarget: (targetTabId: number | undefined) => Promise<string | null>;
}

async function waitForTargetSessionReady(
  targetSessionId: string,
  activeSessionIdRef: React.MutableRefObject<string>,
  hasLoadedSessionRef: React.MutableRefObject<boolean>
): Promise<boolean> {
  const deadline = Date.now() + TARGET_SESSION_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (activeSessionIdRef.current === targetSessionId && hasLoadedSessionRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return activeSessionIdRef.current === targetSessionId && hasLoadedSessionRef.current;
    }
    await new Promise((resolve) => setTimeout(resolve, TARGET_SESSION_READY_POLL_MS));
  }
  return activeSessionIdRef.current === targetSessionId && hasLoadedSessionRef.current;
}

export function useRuntimeMessages({
  queryTabId,
  runtimeTabId,
  queryMode,
  querySessionId,
  querySkipPermissions,
  activeSessionId,
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
  setPopulatedInputTargetTabId,
  setPendingPrompt,
  setIsAgentRunning,
  loadSnapshotForSession,
  sessionCreatedAtRef,
  hasLoadedSessionRef,
  sendPromptRef,
  isAgentRunningRef,
  hasBrowserControlPermissionAcceptedRef,
  pushMessageRef,
  abortControllerRef,
  shouldDisableSkipPermissions,
  clearPreservedTranscriptForTarget
}: UseRuntimeMessagesProps) {
  // Track the current activeSessionId in a ref so async callbacks (like the
  // POPULATE_INPUT_TEXT timeout) can detect stale sessions without re-running
  // the effect on every session change.
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const clearPreservedTranscriptForTargetRef = useRef(clearPreservedTranscriptForTarget);
  useEffect(() => {
    clearPreservedTranscriptForTargetRef.current = clearPreservedTranscriptForTarget;
  }, [clearPreservedTranscriptForTarget]);

  // PANEL_OPENED
  useEffect(() => {
    if (typeof queryTabId !== 'number') return;
    void chrome.runtime.sendMessage({
      type: 'PANEL_OPENED',
      tabId: queryTabId,
      mainTabId: queryTabId
    });
  }, [queryTabId]);

  const shouldHandleRuntimeTabTarget = useCallback(
    (targetTabId: unknown) => typeof targetTabId !== 'number' || targetTabId === runtimeTabId,
    [runtimeTabId]
  );

  const shouldHandlePopulateTabTarget = useCallback(
    (targetTabId: unknown) => {
      if (shouldHandleRuntimeTabTarget(targetTabId)) return true;
      // A non-running preserved transcript can still receive a prompt for the
      // live active tab; that path intentionally clears preservation and
      // switches to the active tab's session before exposing/sending input.
      return (
        !isAgentRunningRef.current && typeof targetTabId === 'number' && targetTabId === queryTabId
      );
    },
    [queryTabId, shouldHandleRuntimeTabTarget, isAgentRunningRef]
  );

  // shouldHandleTaskForCurrentContext
  const shouldHandleTaskForCurrentContext = useCallback(
    (message: any) => {
      const isWindowMode = queryMode === 'window';
      if (isWindowMode && querySessionId) {
        return message.windowSessionId === querySessionId;
      }
      if (isWindowMode || message.windowSessionId) return false;
      if (!shouldHandleRuntimeTabTarget(message.targetTabId)) {
        return false;
      }
      return true;
    },
    [queryMode, querySessionId, shouldHandleRuntimeTabTarget]
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
        if (!shouldHandlePopulateTabTarget(message.targetTabId)) {
          // Let the target panel own the runtime response; skipped panels can win the race.
          return;
        }

        const prompt = typeof message.prompt === 'string' ? message.prompt : '';
        const targetTabId =
          typeof message.targetTabId === 'number' ? message.targetTabId : undefined;
        const targetSessionIdPromise = clearPreservedTranscriptForTargetRef.current(targetTabId);
        const shouldAutoSend = message.autoSend !== false;

        const validAttachments: PromptAttachmentPayload[] = [];
        let hasAnnotatedAttachment = false;
        if (Array.isArray(message.attachments)) {
          for (const attachment of message.attachments) {
            if (!decodeBase64ToFile(attachment)) continue;
            validAttachments.push(attachment);
            if (attachment.isAnnotated) hasAnnotatedAttachment = true;
          }
        }

        const applyPopulatedInput = () => {
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
          setAttachmentCount(validAttachments.length);
          setPendingAttachments(validAttachments);
          setPopulatedInputTargetTabId(shouldAutoSend ? undefined : targetTabId);
          setPendingPrompt(null);
        };

        if (!shouldAutoSend) {
          void (async () => {
            try {
              const targetSessionId = await targetSessionIdPromise;
              if (targetSessionId) {
                const targetSessionReady = await waitForTargetSessionReady(
                  targetSessionId,
                  activeSessionIdRef,
                  hasLoadedSessionRef
                );
                if (!targetSessionReady) {
                  sendResponse({ success: false, error: 'Target session not ready' });
                  return;
                }
              }
              applyPopulatedInput();
              sendResponse({ success: true });
            } catch {
              sendResponse({ success: false, error: 'Failed to prepare target session' });
            }
          })();
          return true;
        }

        applyPopulatedInput();
        sendResponse({ success: true });

        // Capture the session ID at the time POPULATE_INPUT_TEXT arrives.
        // If the user switches sessions during the 500ms delay, we should
        // NOT send the prompt to the new session (Issue 2.5/3.8 from UX audit).
        const capturedSessionId = activeSessionIdRef.current;
        timeoutId = setTimeout(() => {
          void (async () => {
            if (!prompt.trim()) return;
            let targetSessionId: string | null;
            try {
              targetSessionId = await targetSessionIdPromise;
            } catch {
              return;
            }
            if (targetSessionId) {
              const targetSessionReady = await waitForTargetSessionReady(
                targetSessionId,
                activeSessionIdRef,
                hasLoadedSessionRef
              );
              if (!targetSessionReady) return;
            } else if (capturedSessionId !== activeSessionIdRef.current) {
              return;
            }
            if (hasBrowserControlPermissionAcceptedRef.current && !isAgentRunningRef.current) {
              setInput('');
              setPopulatedInputTargetTabId(undefined);
              void sendPromptRef.current?.(prompt, {
                attachments: validAttachments,
                isAnnotated: hasAnnotatedAttachment,
                targetTabId
              });
              setPendingPrompt(null);
              setPendingAttachments([]);
              setPreviewAttachmentImage(null);
              setAttachmentCount(0);
            } else {
              setPendingPrompt({
                prompt,
                attachments: validAttachments,
                isAnnotated: hasAnnotatedAttachment,
                targetTabId
              });
            }
          })();
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
          setPopulatedInputTargetTabId(undefined);
          void sendPromptRef.current?.(taskPrompt);
        }
        sendResponse({ success: true });
        return;
      }

      if (message.type === 'STOP_AGENT') {
        if (!shouldHandleRuntimeTabTarget(message.targetTabId)) {
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
  }, [
    loadSnapshotForSession,
    querySkipPermissions,
    queryTabId,
    shouldHandlePopulateTabTarget,
    shouldHandleRuntimeTabTarget,
    shouldHandleTaskForCurrentContext
  ]);

  return { shouldHandleTaskForCurrentContext };
}
