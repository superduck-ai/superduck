import { useCallback, useEffect, useRef } from 'react';
import { getStorageValue, removeStorageValues, setStorageValue } from '../../extensionServices';
import { type ApiConversationMessage } from '../../messageTypes';
import { ensureToolResultPairs } from '../../utils/conversationProtocol';
import {
  extractTextFromContent,
  getConversationStorageKey,
  getHistoryStorageKey,
  hasPersistableSessionContent,
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

export async function removeSessionIndexEntry(sessionId: string) {
  const raw = await getStorageValue(SESSION_INDEX_KEY, []);
  const current = Array.isArray(raw) ? (raw as SessionIndexEntry[]) : [];
  const next = current.filter((item) => item.sessionId !== sessionId);
  if (next.length !== current.length) {
    await setStorageValue(SESSION_INDEX_KEY, next);
  }
}

async function removeEmptySessionArtifacts(sessionId: string, snapshot: SessionSnapshot) {
  const keysToRemove = [getHistoryStorageKey(sessionId)];
  let ownsConversationSnapshot = false;

  if (snapshot.conversationUuid) {
    const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
    const currentMap = isStringRecord(rawMap) ? rawMap : {};
    ownsConversationSnapshot = currentMap[snapshot.conversationUuid] === sessionId;
    if (ownsConversationSnapshot) {
      keysToRemove.push(getConversationStorageKey(snapshot.conversationUuid));
    }
  }

  await removeStorageValues(keysToRemove);
  await removeSessionIndexEntry(sessionId);

  if (snapshot.conversationUuid && ownsConversationSnapshot) {
    const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
    const currentMap = isStringRecord(rawMap) ? rawMap : {};
    if (currentMap[snapshot.conversationUuid] === sessionId) {
      const nextMap = { ...currentMap };
      delete nextMap[snapshot.conversationUuid];
      await setStorageValue(SESSION_CONVERSATION_MAP_KEY, nextMap);
    }
  }
}

function withValidApiMessages(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    ...snapshot,
    apiMessages: ensureToolResultPairs(snapshot.apiMessages)
  };
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

  // Holds the latest persistSnapshot function so flushSession() can
  // trigger an immediate save (bypassing the 2s debounce) before the
  // gate is lowered in clearConversation / handleLoadHistorySession.
  const persistSnapshotRef = useRef<(() => void) | null>(null);
  const flushSession = useCallback(() => {
    persistSnapshotRef.current?.();
  }, []);

  // ─── Render-phase snapshot ref ──────────────────────────────────────────────
  // Updated synchronously during render so that useEffect cleanups and
  // beforeunload handlers always read the latest state, not stale closure
  // values from the render that registered the effect. This fixes three
  // classes of race conditions:
  //   1. clearConversation overwriting old session with empty messages
  //   2. beforeunload saving stale messages when panel closes quickly
  //   3. Cleanup saves during rapid state changes (streaming) always see
  //      the correct snapshot for the current render.
  const snapshotRef = useRef<SessionSnapshot>({
    uiMessages: messages,
    apiMessages: ensureToolResultPairs(apiMessages),
    selectedModel,
    permissionMode,
    createdAt: sessionCreatedAtRef.current,
    conversationUuid: activeConversationUuid || undefined,
    remoteSessionId: activeRemoteSessionId || undefined
  });
  snapshotRef.current = {
    uiMessages: messages,
    apiMessages: ensureToolResultPairs(apiMessages),
    selectedModel,
    permissionMode,
    createdAt: sessionCreatedAtRef.current,
    conversationUuid: activeConversationUuid || undefined,
    remoteSessionId: activeRemoteSessionId || undefined
  };

  // ─── Load snapshot from local storage ───────────────────────────────────────

  const loadSnapshotForSession = useCallback(
    async (
      sessionId: string,
      conversationUuid?: string | null
    ): Promise<SessionSnapshot | undefined> => {
      const sessionSnapshot = await getStorageValue(getHistoryStorageKey(sessionId));
      if (isSessionSnapshot(sessionSnapshot) && hasPersistableSessionContent(sessionSnapshot)) {
        return withValidApiMessages(sessionSnapshot);
      }
      if (!conversationUuid) return undefined;
      const conversationSnapshot = await getStorageValue(
        getConversationStorageKey(conversationUuid)
      );
      if (
        isSessionSnapshot(conversationSnapshot) &&
        hasPersistableSessionContent(conversationSnapshot)
      ) {
        return withValidApiMessages(conversationSnapshot);
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
          apiMessages: ensureToolResultPairs(apiMessages),
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
    // Skip if sessionId hasn't been resolved yet (prevents loading with empty key)
    if (!activeSessionId) return;

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
  // Reads the snapshot from snapshotRef (updated during render) instead of
  // closure values, so the cleanup always sees the latest state for the
  // current render. The hasLoadedSessionRef gate in the cleanup prevents
  // saving during session transitions (clearConversation, loadHistory).
  //
  // IMPORTANT: This effect MUST remain declared AFTER the session-loading
  // effect above. React runs effects in declaration order, so the load
  // effect sets hasLoadedSessionRef = false before this effect's cleanup
  // checks it. The session resolver (in SidepanelApp) relies on this
  // ordering — it calls setActiveSessionId without its own gate.

  useEffect(() => {
    if (!activeSessionId || !hasLoadedSessionRef.current) return;

    const persistSnapshot = () => {
      const snap = snapshotRef.current;
      void (async () => {
        try {
          if (!hasPersistableSessionContent(snap)) {
            await removeEmptySessionArtifacts(activeSessionId, snap);
            return;
          }

          const preview = [...snap.uiMessages]
            .reverse()
            .find((message) => message.role === 'user' && message.text.trim())?.text;
          await setStorageValue(historyStorageKey, snap);
          if (snap.conversationUuid) {
            const conversationKey = getConversationStorageKey(snap.conversationUuid);
            await setStorageValue(conversationKey, snap);
            const rawMap = await getStorageValue(SESSION_CONVERSATION_MAP_KEY, {});
            const currentMap = isStringRecord(rawMap) ? rawMap : {};
            if (currentMap[snap.conversationUuid] !== activeSessionId) {
              await setStorageValue(SESSION_CONVERSATION_MAP_KEY, {
                ...currentMap,
                [snap.conversationUuid]: activeSessionId
              });
            }
            if (snap.remoteSessionId) {
              const rawRemoteMap = await getStorageValue(SESSION_REMOTE_MAP_KEY, {});
              const currentRemoteMap = isStringRecord(rawRemoteMap) ? rawRemoteMap : {};
              if (currentRemoteMap[snap.conversationUuid] !== snap.remoteSessionId) {
                await setStorageValue(SESSION_REMOTE_MAP_KEY, {
                  ...currentRemoteMap,
                  [snap.conversationUuid]: snap.remoteSessionId
                });
              }
            }
          }
          await upsertSessionIndex({
            sessionId: activeSessionId,
            conversationUuid: snap.conversationUuid || undefined,
            remoteSessionId: snap.remoteSessionId || undefined,
            createdAt: snap.createdAt || sessionCreatedAtRef.current,
            updatedAt: Date.now(),
            model: snap.selectedModel || undefined,
            preview: preview ? preview.slice(0, 240) : undefined
          });
        } catch (error) {
          console.error('[sidepanel] failed to persist session snapshot', error);
        }
      })();
    };
    persistSnapshotRef.current = persistSnapshot;

    // Debounce storage writes to avoid thrashing during streaming
    const timer = setTimeout(persistSnapshot, 2000);

    // On cleanup (component unmount or deps change), save immediately.
    // The hasLoadedSessionRef gate prevents saving during session transitions
    // (clearConversation / handleLoadHistorySession set it to false before
    // changing activeSessionId), so old session data is never overwritten
    // with empty messages from the new session.
    return () => {
      clearTimeout(timer);
      if (hasLoadedSessionRef.current) {
        persistSnapshot();
      }
    };
    // Full dependency array is intentional: the effect must re-run whenever
    // persisted state changes so that (a) the bail-out check at the top
    // re-evaluates hasLoadedSessionRef after the load effect sets it to true,
    // and (b) the 2s debounce timer resets on each change. During streaming
    // the cleanup fires on every state change and saves via snapshotRef —
    // this trades debounce efficiency for data correctness, which is the
    // right tradeoff since chrome.storage.local.set is fast (~1-5ms).
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

  // ─── Before-unload persistence ──────────────────────────────────────────────
  // When Chrome destroys the sidepanel iframe (e.g. tab switch), React cleanup
  // functions may not run reliably. The beforeunload/pagehide events fire on
  // the iframe's window before destruction, giving us a last chance to persist.
  //
  // The handler reads from snapshotRef (updated during render) instead of
  // closure values, so it always sees the latest state regardless of when
  // it was registered. This avoids the stale-closure problem where the
  // handler would save messages from the render it was created in, not the
  // most recent render.

  useEffect(() => {
    if (!activeSessionId) return;
    // NOTE: Do NOT gate on hasLoadedSessionRef here. The load effect
    // (declared above) sets hasLoadedSessionRef = false before this
    // effect runs, and the later flip to true does not change
    // activeSessionId/historyStorageKey, so this effect would never
    // re-run to register the handler. The handler itself checks the
    // gate internally, which is sufficient.

    const handleBeforeUnload = () => {
      if (!hasLoadedSessionRef.current) return;
      const snap = snapshotRef.current;
      if (!hasPersistableSessionContent(snap)) {
        void removeEmptySessionArtifacts(activeSessionId, snap);
        return;
      }

      const preview = [...snap.uiMessages]
        .reverse()
        .find((m) => m.role === 'user' && m.text.trim())?.text;
      // chrome.storage.local.set is the only synchronous-ish API available
      // in extension context during beforeunload. Fire and forget — the
      // browser will typically complete the microtask before destruction.
      void setStorageValue(historyStorageKey, snap);
      void upsertSessionIndex({
        sessionId: activeSessionId,
        conversationUuid: snap.conversationUuid || undefined,
        remoteSessionId: snap.remoteSessionId || undefined,
        createdAt: snap.createdAt || sessionCreatedAtRef.current,
        updatedAt: Date.now(),
        model: snap.selectedModel || undefined,
        preview: preview ? preview.slice(0, 240) : undefined
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
    // The handler reads all mutable state from snapshotRef, so it only needs
    // to re-register when the storage target changes (session switch).
  }, [activeSessionId, historyStorageKey]);

  return {
    loadSnapshotForSession,
    restoreSnapshotFromRemoteSession,
    upsertSessionIndex,
    flushSession,
    historyStorageKey
  };
}
