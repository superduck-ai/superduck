import { useCallback, useEffect, useRef } from 'react';
import { getStorageValue, setStorageValue } from '../../extensionServices';
import { ensureToolResultPairs } from '../../utils/conversationProtocol';
import {
  getConversationStorageKey,
  getHistoryStorageKey,
  hasPersistableSessionContent
} from '../session/history';
import { isPermissionMode, type PermissionMode } from '../sidepanelUtils';
import { isSessionSnapshot, isStringRecord } from '../sidepanelGuards';
import { SESSION_CONVERSATION_MAP_KEY, SESSION_REMOTE_MAP_KEY } from '../sidepanelGuards';
import type { SessionSnapshot } from '../types';
import { useSessionStore } from '../stores/sessionStore';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useAgentStore } from '../stores/agentStore';
import {
  removeEmptySessionArtifacts,
  upsertSessionIndex,
  withValidApiMessages
} from './sessionPersistence/sessionIndexPersistence';
import { restoreRemoteSession } from './sessionPersistence/restoreRemoteSession';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseSessionPersistenceProps {
  activeSessionId: string;
  // Refs still need to be passed (can't be stored in Zustand)
  selectedModelRef: React.MutableRefObject<string>;
  permissionModeRef: React.MutableRefObject<PermissionMode>;
  sessionCreatedAtRef: React.MutableRefObject<number>;
  hasLoadedSessionRef: React.MutableRefObject<boolean>;
  activeConversationUuidRef: React.MutableRefObject<string | null>;
  activeRemoteSessionIdRef: React.MutableRefObject<string | null>;
  apiKey: string;
  apiBaseUrl: string;
  shouldDisableSkipPermissions: boolean;
}

export function useSessionPersistence({
  activeSessionId,
  selectedModelRef,
  permissionModeRef,
  sessionCreatedAtRef,
  hasLoadedSessionRef,
  activeConversationUuidRef,
  activeRemoteSessionIdRef,
  apiKey,
  apiBaseUrl,
  shouldDisableSkipPermissions
}: UseSessionPersistenceProps) {
  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const activeConversationUuid = useSessionStore((s) => s.activeConversationUuid);
  const setActiveConversationUuid = useSessionStore((s) => s.setActiveConversationUuid);
  const activeRemoteSessionId = useSessionStore((s) => s.activeRemoteSessionId);
  const setActiveRemoteSessionId = useSessionStore((s) => s.setActiveRemoteSessionId);
  const messages = useChatStore((s) => s.messages);
  const setMessages = useChatStore((s) => s.setMessages);
  const apiMessages = useChatStore((s) => s.apiMessages);
  const setApiMessages = useChatStore((s) => s.setApiMessages);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const setSelectedModel = useModelStore((s) => s.setSelectedModel);
  const permissionMode = usePermissionStore((s) => s.permissionMode);
  const setPermissionMode = usePermissionStore((s) => s.setPermissionMode);
  const setRuntimeError = useAgentStore((s) => s.setRuntimeError);
  const setLastStopReason = useAgentStore((s) => s.setLastStopReason);
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

  // ─── Session-loading effect ─────────────────────────────────────────────────

  useEffect(() => {
    // Skip if sessionId hasn't been resolved yet (prevents loading with empty key)
    if (!activeSessionId) return;

    hasLoadedSessionRef.current = false;
    let active = true;
    (async () => {
      setMessages([]);
      setApiMessages([]);
      setRuntimeError(null);
      setLastStopReason(null);
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
        const restoredSnapshot = await restoreRemoteSession({
          apiKey,
          apiBaseUrl,
          selectedModel: selectedModelRef.current,
          permissionMode: permissionModeRef.current,
          remoteSessionId: resolvedRemoteSessionId,
          conversationUuid: currentConversationUuid
        });
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
  }, [activeSessionId, apiBaseUrl, apiKey, loadSnapshotForSession]);

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
    flushSession
  };
}
