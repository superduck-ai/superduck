import { useCallback, useEffect } from 'react';
import { getStorageValue, setStorageValue } from '../../extensionServices';
import { isRecord, type ApiConversationMessage } from '../../messageTypes';
import {
  extractTextFromContent,
  getConversationStorageKey,
  getHistoryStorageKey,
  pickEventMessage
} from '../sessionHistory';
import { createId, isPermissionMode, type PermissionMode } from '../sidepanelUtils';
import { isSessionSnapshot, isStringRecord } from '../sidepanelGuards';
import {
  SESSION_CONVERSATION_MAP_KEY,
  SESSION_REMOTE_MAP_KEY,
  SESSION_INDEX_KEY
} from '../sidepanelGuards';
import type { ChatMessage, SessionIndexEntry, SessionSnapshot } from '../types';

// ─── Helper functions ─────────────────────────────────────────────────────────

export async function upsertSessionIndex(entry: SessionIndexEntry) {
  const raw = await getStorageValue(SESSION_INDEX_KEY, []);
  const current = Array.isArray(raw) ? (raw as SessionIndexEntry[]) : [];
  const existing = current.find((item) => item.sessionId === entry.sessionId);
  const next = existing
    ? current.map((item) =>
        item.sessionId === entry.sessionId
          ? {
              ...entry,
              conversationUuid: entry.conversationUuid || item.conversationUuid,
              remoteSessionId: entry.remoteSessionId || item.remoteSessionId
            }
          : item
      )
    : [entry, ...current];
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  await setStorageValue(SESSION_INDEX_KEY, next.slice(0, 200));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSessionPersistenceProps {
  activeSessionId: string;
  activeConversationUuid: string | null;
  activeRemoteSessionId: string | null;
  messages: ChatMessage[];
  apiMessages: ApiConversationMessage[];
  selectedModel: string;
  selectedModelRef: React.MutableRefObject<string>;
  permissionMode: PermissionMode;
  permissionModeRef: React.MutableRefObject<PermissionMode>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setApiMessages: React.Dispatch<React.SetStateAction<ApiConversationMessage[]>>;
  setMessageHistory: React.Dispatch<React.SetStateAction<ApiConversationMessage[]>>;
  setRuntimeError: React.Dispatch<React.SetStateAction<string | null>>;
  setLastStopReason: React.Dispatch<
    React.SetStateAction<{ reason: string; messageId?: string } | null>
  >;
  setTokensSaved: React.Dispatch<React.SetStateAction<number | null>>;
  setSelectedModel: (model: string) => void;
  setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
  setActiveConversationUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveRemoteSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  hasLoadedSessionRef: React.MutableRefObject<boolean>;
  activeConversationUuidRef: React.MutableRefObject<string | null>;
  activeRemoteSessionIdRef: React.MutableRefObject<string | null>;
  apiKey: string;
  apiBaseUrl: string;
  shouldDisableSkipPermissions: boolean;
}

export function useSessionPersistence({
  activeSessionId,
  activeConversationUuid,
  activeRemoteSessionId,
  messages,
  apiMessages,
  selectedModel,
  selectedModelRef,
  permissionMode,
  permissionModeRef,
  sessionCreatedAtRef,
  setMessages,
  setApiMessages,
  setMessageHistory,
  setRuntimeError,
  setLastStopReason,
  setTokensSaved,
  setSelectedModel,
  setPermissionMode,
  setActiveConversationUuid,
  setActiveRemoteSessionId,
  hasLoadedSessionRef,
  activeConversationUuidRef,
  activeRemoteSessionIdRef,
  apiKey,
  apiBaseUrl,
  shouldDisableSkipPermissions
}: UseSessionPersistenceProps) {
  const historyStorageKey = getHistoryStorageKey(activeSessionId);

  // ─── Load snapshot from local storage ───────────────────────────────────────

  const loadSnapshotForSession = useCallback(
    async (
      sessionId: string,
      conversationUuid?: string | null
    ): Promise<SessionSnapshot | undefined> => {
      const sessionSnapshot = await getStorageValue(getHistoryStorageKey(sessionId));
      if (isSessionSnapshot(sessionSnapshot)) {
        return sessionSnapshot;
      }
      if (!conversationUuid) return undefined;
      const conversationSnapshot = await getStorageValue(
        getConversationStorageKey(conversationUuid)
      );
      if (isSessionSnapshot(conversationSnapshot)) {
        return conversationSnapshot;
      }
      return undefined;
    },
    []
  );

  // ─── Restore snapshot from remote session ───────────────────────────────────

  const restoreSnapshotFromRemoteSession = useCallback(
    async (
      remoteSessionId: string,
      conversationUuid?: string | null
    ): Promise<SessionSnapshot | undefined> => {
      if (!apiKey) return undefined;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'ccr-byoc-2025-07-29'
        };
        if (apiKey) {
          headers['x-api-key'] = apiKey;
        }

        const [eventsResponse, sessionResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(remoteSessionId)}/events`, {
            method: 'GET',
            headers
          }),
          fetch(`${apiBaseUrl}/v1/sessions/${encodeURIComponent(remoteSessionId)}`, {
            method: 'GET',
            headers
          })
        ]);

        if (!eventsResponse.ok) {
          return undefined;
        }

        const eventsPayload = await eventsResponse.json();
        const events = Array.isArray(eventsPayload?.data)
          ? eventsPayload.data
          : Array.isArray(eventsPayload)
            ? eventsPayload
            : [];

        const apiMessages: ApiConversationMessage[] = [];
        const uiMessages: ChatMessage[] = [];
        for (const event of events) {
          const message = pickEventMessage(event);
          if (!message) continue;
          apiMessages.push(message);

          const text =
            typeof message.content === 'string'
              ? message.content.trim()
              : extractTextFromContent(message.content);
          if (!text) continue;
          uiMessages.push({
            id: createId(),
            role: message.role,
            text
          });
        }

        if (apiMessages.length === 0) {
          return undefined;
        }

        let restoredModel = selectedModelRef.current;
        if (sessionResponse.ok) {
          const sessionPayload = await sessionResponse.json();
          const sessionModel = sessionPayload?.session_context?.model;
          if (typeof sessionModel === 'string' && sessionModel) {
            restoredModel = sessionModel;
          }
        }

        return {
          uiMessages,
          apiMessages,
          selectedModel: restoredModel,
          permissionMode: permissionModeRef.current,
          createdAt: Date.now(),
          conversationUuid: conversationUuid || undefined,
          remoteSessionId
        };
      } catch (error) {
        console.error('[sidepanel] failed to restore remote session', error);
        return undefined;
      }
    },
    [apiBaseUrl, apiKey, selectedModelRef, permissionModeRef]
  );

  // ─── Session-loading effect ─────────────────────────────────────────────────

  useEffect(() => {
    hasLoadedSessionRef.current = false;
    let active = true;
    (async () => {
      setMessages([]);
      setApiMessages([]);
      setMessageHistory([]);
      setRuntimeError(null);
      setLastStopReason(null);
      setTokensSaved(null);
      const currentConversationUuid = activeConversationUuidRef.current;
      let resolvedRemoteSessionId = activeRemoteSessionIdRef.current;

      if (!resolvedRemoteSessionId && currentConversationUuid) {
        const rawRemoteMap = await getStorageValue(SESSION_REMOTE_MAP_KEY, {});
        const remoteMap = isStringRecord(rawRemoteMap) ? rawRemoteMap : {};
        const mappedRemoteSessionId = remoteMap[currentConversationUuid];
        if (typeof mappedRemoteSessionId === 'string' && mappedRemoteSessionId) {
          resolvedRemoteSessionId = mappedRemoteSessionId;
          if (active) {
            setActiveRemoteSessionId(mappedRemoteSessionId);
          }
        }
      }

      let snapshot = await loadSnapshotForSession(activeSessionId, currentConversationUuid);
      if (!snapshot && resolvedRemoteSessionId) {
        const restoredSnapshot = await restoreSnapshotFromRemoteSession(
          resolvedRemoteSessionId,
          currentConversationUuid
        );
        if (restoredSnapshot) {
          snapshot = restoredSnapshot;
          await setStorageValue(getHistoryStorageKey(activeSessionId), restoredSnapshot);
          if (currentConversationUuid) {
            await setStorageValue(
              getConversationStorageKey(currentConversationUuid),
              restoredSnapshot
            );
            const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
            const currentMap = isStringRecord(rawMap) ? rawMap : {};
            if (currentMap[currentConversationUuid] !== activeSessionId) {
              await setStorageValue(SESSION_CONVERSATION_MAP_KEY, {
                ...currentMap,
                [currentConversationUuid]: activeSessionId
              });
            }
          }
          const remotePreview = [...restoredSnapshot.uiMessages]
            .reverse()
            .find((message) => message.role === 'user' && message.text.trim())?.text;
          await upsertSessionIndex({
            sessionId: activeSessionId,
            conversationUuid: currentConversationUuid || undefined,
            remoteSessionId: resolvedRemoteSessionId,
            createdAt: restoredSnapshot.createdAt || Date.now(),
            updatedAt: Date.now(),
            model: restoredSnapshot.selectedModel || undefined,
            preview: remotePreview ? remotePreview.slice(0, 240) : undefined
          });
        }
      }

      if (!active) {
        return;
      }
      if (snapshot?.uiMessages) {
        setMessages(snapshot.uiMessages);
      }
      if (snapshot?.apiMessages) {
        setApiMessages(snapshot.apiMessages);
      }
      if (snapshot?.selectedModel) {
        // Only restore model from snapshot if user hasn't manually selected one
        if (!selectedModelRef.current) {
          setSelectedModel(snapshot.selectedModel);
        }
      }
      if (snapshot?.permissionMode && isPermissionMode(snapshot.permissionMode)) {
        if (
          shouldDisableSkipPermissions &&
          snapshot.permissionMode === 'skip_all_permission_checks'
        ) {
          setPermissionMode('follow_a_plan');
        } else {
          setPermissionMode(snapshot.permissionMode);
        }
      }
      if (snapshot?.createdAt && typeof snapshot.createdAt === 'number') {
        sessionCreatedAtRef.current = snapshot.createdAt;
      } else {
        sessionCreatedAtRef.current = Date.now();
      }
      if (typeof snapshot?.remoteSessionId === 'string' && snapshot.remoteSessionId) {
        if (snapshot.remoteSessionId !== activeRemoteSessionIdRef.current) {
          setActiveRemoteSessionId(snapshot.remoteSessionId);
        }
      } else if (resolvedRemoteSessionId) {
        if (resolvedRemoteSessionId !== activeRemoteSessionIdRef.current) {
          setActiveRemoteSessionId(resolvedRemoteSessionId);
        }
      }
      if (!currentConversationUuid && typeof snapshot?.conversationUuid === 'string') {
        setActiveConversationUuid(snapshot.conversationUuid);
      }
      hasLoadedSessionRef.current = true;
    })();
    return () => {
      active = false;
    };
  }, [activeSessionId, loadSnapshotForSession, restoreSnapshotFromRemoteSession]);

  // ─── Session persistence effect (debounced) ─────────────────────────────────

  useEffect(() => {
    if (!hasLoadedSessionRef.current) return;

    const persistSnapshot = () => {
      const preview = [...messages]
        .reverse()
        .find((message) => message.role === 'user' && message.text.trim())?.text;
      const snapshot: SessionSnapshot = {
        uiMessages: messages,
        apiMessages,
        selectedModel,
        permissionMode,
        createdAt: sessionCreatedAtRef.current,
        conversationUuid: activeConversationUuid || undefined,
        remoteSessionId: activeRemoteSessionId || undefined
      };
      void (async () => {
        await setStorageValue(historyStorageKey, snapshot);
        if (activeConversationUuid) {
          const conversationKey = getConversationStorageKey(activeConversationUuid);
          await setStorageValue(conversationKey, snapshot);
          const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
          const currentMap = isStringRecord(rawMap) ? rawMap : {};
          if (currentMap[activeConversationUuid] !== activeSessionId) {
            await setStorageValue(SESSION_CONVERSATION_MAP_KEY, {
              ...currentMap,
              [activeConversationUuid]: activeSessionId
            });
          }
          if (activeRemoteSessionId) {
            const rawRemoteMap = await getStorageValue(SESSION_REMOTE_MAP_KEY, {});
            const currentRemoteMap = isStringRecord(rawRemoteMap) ? rawRemoteMap : {};
            if (currentRemoteMap[activeConversationUuid] !== activeRemoteSessionId) {
              await setStorageValue(SESSION_REMOTE_MAP_KEY, {
                ...currentRemoteMap,
                [activeConversationUuid]: activeRemoteSessionId
              });
            }
          }
        }
        await upsertSessionIndex({
          sessionId: activeSessionId,
          conversationUuid: activeConversationUuid || undefined,
          remoteSessionId: activeRemoteSessionId || undefined,
          createdAt: sessionCreatedAtRef.current,
          updatedAt: Date.now(),
          model: selectedModel || undefined,
          preview: preview ? preview.slice(0, 240) : undefined
        });
      })();
    };

    // Debounce storage writes to avoid thrashing during streaming
    const timer = setTimeout(persistSnapshot, 2000);
    return () => clearTimeout(timer);
  }, [
    activeConversationUuid,
    activeRemoteSessionId,
    activeSessionId,
    apiMessages,
    historyStorageKey,
    messages,
    permissionMode,
    selectedModel
  ]);

  return {
    loadSnapshotForSession,
    restoreSnapshotFromRemoteSession,
    upsertSessionIndex,
    historyStorageKey
  };
}
