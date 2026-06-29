import { useEffect } from 'react';
import { setStorageValue, getStorageValue } from '../../extensionServices';
import { getTabSessionKey, LAST_ACTIVE_SESSION_KEY } from '../sidepanelGuards';
import { useSessionStore } from '../stores/sessionStore';
import { useTabStore } from '../stores/tabStore';

export interface UseSessionActionsProps {
  activeSessionId: string;
  dynamicTabId: number | undefined;
  effectiveIsAgentRunning: boolean;
  querySessionId: string | undefined;
  sessionTabId: number | undefined;
  wasAgentRunningRef: React.MutableRefObject<boolean>;
  agentStartedTabIdRef: React.MutableRefObject<number | undefined>;
  tabChangedDuringAgentRef: React.MutableRefObject<boolean>;
  sessionResolvedForTabRef: React.MutableRefObject<number | undefined>;
}

/**
 * useSessionActions — 会话 ID 解析和 tab-session 映射
 * 封装 session resolver effect，负责恢复每个 tab 的上次会话
 */
export function useSessionActions({
  activeSessionId,
  dynamicTabId,
  effectiveIsAgentRunning,
  querySessionId,
  sessionTabId,
  wasAgentRunningRef,
  agentStartedTabIdRef,
  tabChangedDuringAgentRef,
  sessionResolvedForTabRef
}: UseSessionActionsProps) {
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const setPreservedTranscriptTabId = useTabStore((s) => s.setPreservedTranscriptTabId);
  const setPreservedTranscriptActiveTabId = useTabStore((s) => s.setPreservedTranscriptActiveTabId);

  useEffect(() => {
    // If a tab activation happened while the agent was running, keep the
    // just-finished transcript visible instead of immediately switching to
    // the newly-active tab's session, which is often empty.
    const didAgentJustStop = wasAgentRunningRef.current && !effectiveIsAgentRunning;
    const startedTabId = agentStartedTabIdRef.current;
    const postRunTabMismatch =
      didAgentJustStop &&
      typeof startedTabId === 'number' &&
      typeof dynamicTabId === 'number' &&
      dynamicTabId !== startedTabId;

    if (
      activeSessionId &&
      !effectiveIsAgentRunning &&
      (tabChangedDuringAgentRef.current || postRunTabMismatch)
    ) {
      tabChangedDuringAgentRef.current = false;
      agentStartedTabIdRef.current = undefined;
      if (typeof startedTabId === 'number') {
        setPreservedTranscriptTabId(startedTabId);
        setPreservedTranscriptActiveTabId(
          typeof dynamicTabId === 'number' ? dynamicTabId : startedTabId
        );
      }
      return;
    }

    if (didAgentJustStop) {
      tabChangedDuringAgentRef.current = false;
      agentStartedTabIdRef.current = undefined;
    }

    // Skip if the current session was already resolved for this tab.
    // This is the hot path: nothing changed, nothing to re-read.
    if (activeSessionId && sessionResolvedForTabRef.current === sessionTabId) {
      return;
    }

    // Defer session switching while an agent is executing. Switching
    // sessions mid-execution would wipe the visible state (messages,
    // apiMessages) and cause the agent's output to be written to the
    // wrong session. Once the agent finishes, this effect re-runs
    // (effectiveIsAgentRunning is in the deps) and resolves the session
    // for the current tab.
    if (effectiveIsAgentRunning) {
      return;
    }

    // Wait for sessionTabId to be known (a real number) before reading
    // any tab-specific mapping. If we have a URL sessionId, the user
    // is explicitly opening a specific conversation, so we proceed
    // without a tab context.
    if (typeof sessionTabId !== 'number' && !querySessionId) return;

    let active = true;
    (async () => {
      const tabId = sessionTabId;
      const persistTabMapping = async (sessionId: string): Promise<void> => {
        // Only persist the tab→session mapping when we actually have a tab
        // to bind to. Writing under the *current* tab's key (not the
        // previous one the user was on) avoids remapping a tab's prior
        // conversation when the user simply switches tabs while the
        // sidepanel is still open.
        if (typeof tabId === 'number') {
          await setStorageValue(getTabSessionKey(tabId), sessionId);
        }
      };

      // If the active session was opened from a URL (query.sessionId)
      // it overrides any per-tab mapping. The session is bound to the
      // URL, not to the tab — so record it as resolved for the current
      // tab but don't touch the tab→session storage.
      if (querySessionId) {
        sessionResolvedForTabRef.current = tabId;
        return;
      }

      if (typeof tabId !== 'number') {
        // No tab context — try the global fallback before generating fresh
        const fallbackSessionId = await getStorageValue(LAST_ACTIVE_SESSION_KEY);
        if (!active) return;
        if (typeof fallbackSessionId === 'string' && fallbackSessionId) {
          setActiveSessionId(fallbackSessionId);
        } else {
          setActiveSessionId(crypto.randomUUID());
        }
        sessionResolvedForTabRef.current = tabId;
        return;
      }

      // Try to restore the last session for this tab
      const lastSessionId = await getStorageValue(getTabSessionKey(tabId));
      if (!active) return;

      if (typeof lastSessionId === 'string' && lastSessionId) {
        // The previously-resolved session (activeSessionId) belonged to
        // a different tab. Switch over to whatever the new tab was
        // last bound to, even if the storage write hasn't fully
        // settled. The load effect will hydrate the new conversation
        // from its own snapshot.
        if (lastSessionId !== activeSessionId) {
          setActiveSessionId(lastSessionId);
        }
        // Re-write the mapping so a fresh write happens for the current
        // resolution cycle (cheap, idempotent).
        void persistTabMapping(lastSessionId);
      } else if (sessionResolvedForTabRef.current !== tabId) {
        // Tab has never been bound before — always start a fresh
        // conversation for it. Do NOT fall back to
        // LAST_ACTIVE_SESSION_KEY: that would load another tab's
        // conversation, which is confusing when the user switches to
        // a new tab and expects a clean slate. The user can still
        // reach prior conversations via the session history panel.
        const newId = crypto.randomUUID();
        setActiveSessionId(newId);
        void persistTabMapping(newId);
      }
      sessionResolvedForTabRef.current = tabId;
    })();

    return () => {
      active = false;
    };
  }, [activeSessionId, dynamicTabId, effectiveIsAgentRunning, querySessionId, sessionTabId]);

  useEffect(() => {
    wasAgentRunningRef.current = effectiveIsAgentRunning;
  }, [effectiveIsAgentRunning]);
}
