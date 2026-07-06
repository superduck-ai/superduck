import { useCallback } from 'react';
import type { SendPromptOptions } from '../types';
import { getStorageValue, setStorageValue } from '../../extensionServices';
import { getSessionTabKey } from '../sidepanelGuards';

export interface UseEffectiveSendPromptProps {
  isPurlMode: boolean;
  lightningResult: any;
  preservedTranscriptTabId: number | undefined;
  queryTabId: number | undefined;
  /** 当前对话 id —— 锚点绑定的关键:对话锁定一个 group 后,整轮只操作该 group。 */
  activeSessionId: string | undefined;
  sendPrompt: (prompt: string, options?: SendPromptOptions) => Promise<void>;
  lockedTabIdRef: React.MutableRefObject<number | undefined>;
  agentStartedTabIdRef: React.MutableRefObject<number | undefined>;
  tabChangedDuringAgentRef: React.MutableRefObject<boolean>;
  isAgentRunningRef: React.MutableRefObject<boolean>;
}

/**
 * 解析本轮 agent 的锚点 tab(决定工具操作归属哪个 group)。
 *
 * 治本策略:优先用「当前对话(activeSessionId)绑定的 tab」并校验仍在本窗
 * (多窗口并行时阻止锚点跨窗口漂移);否则回退到焦点 tab。这样无论浏览器
 * 焦点 tab 漂到哪个 group,对话 B 的 agent 永远只操作它绑定的 group。
 *
 * 这是「B group 的点击跑到 A group」串组 bug 的根因修复 —— 之前 anchor
 * 无脑跟焦点 tab(queryTabId)走,切对话没切焦点 tab 就会整轮打错 group。
 */
async function resolveAnchorTabId(
  activeSessionId: string | undefined,
  fallbackTabId: number | undefined
): Promise<number | undefined> {
  if (!activeSessionId || typeof fallbackTabId !== 'number') return fallbackTabId;
  // 窗口在单次 sendPrompt 内不变,只查一次;与 storage 读并行。
  const [bound, currentWinId] = await Promise.all([
    getStorageValue(getSessionTabKey(activeSessionId)).catch(() => undefined),
    chrome.windows
      .getCurrent()
      .then((w) => w.id)
      .catch(() => undefined)
  ]);
  if (typeof bound === 'number' && typeof currentWinId === 'number') {
    try {
      const tab = await chrome.tabs.get(bound);
      if (tab.windowId === currentWinId) return bound;
    } catch {
      // 绑定 tab 已关闭,降级到 fallback
    }
  }
  return fallbackTabId;
}

/**
 * useEffectiveSendPrompt — 发送提示
 * 在 lightning 模式下路由到 lightningResult.sendMessage;
 * 锚点 tab 绑定到对话(group 隔离),不再跟随浏览器焦点 tab。
 */
export function useEffectiveSendPrompt({
  isPurlMode,
  lightningResult,
  preservedTranscriptTabId,
  queryTabId,
  activeSessionId,
  sendPrompt,
  lockedTabIdRef,
  agentStartedTabIdRef,
  tabChangedDuringAgentRef,
  isAgentRunningRef
}: UseEffectiveSendPromptProps) {
  return useCallback(
    async (text: string, options?: SendPromptOptions) => {
      const candidateTabId = options?.targetTabId ?? preservedTranscriptTabId ?? queryTabId;
      // 锚点 = 对话绑定 tab 优先,否则焦点 tab(均校验本窗)。
      // 切对话没切焦点 tab 时,agent 仍操作对话绑定的 group,不再串组。
      const targetTabId = await resolveAnchorTabId(activeSessionId, candidateTabId);
      // Lock tab ID synchronously BEFORE starting the agent, so that tool calls
      // always target the tab the user was on when they sent the message.
      // Using useEffect for this creates a race condition where the first tool
      // call could fire before the effect runs.
      if (typeof targetTabId === 'number') {
        lockedTabIdRef.current = targetTabId;
        agentStartedTabIdRef.current = targetTabId;
        tabChangedDuringAgentRef.current = false;
        // 写入/刷新 对话→锚点 绑定,后续该对话永远用这个 group。
        if (activeSessionId) {
          void setStorageValue(getSessionTabKey(activeSessionId), targetTabId);
        }
      }
      try {
        if (isPurlMode && lightningResult) {
          return await lightningResult.sendMessage(text, options?.attachments, null, false);
        }
        return await sendPrompt(text, { ...options, targetTabId });
      } finally {
        // If neither the normal agent nor the lightning mode actually
        // transitioned into a "running" state (e.g. sendPrompt hit an
        // early-return for /compact, /share, empty input, or missing
        // client; or lightningResult.sendMessage returned before
        // setting lnIsLoading), the unlock effect would never fire and
        // `lockedTabIdRef` would stay set forever. Clear it ourselves
        // in that case so future calls are not bound to a stale tab.
        const stillRunning = isPurlMode
          ? Boolean(lightningResult?.isLoading)
          : isAgentRunningRef.current;
        if (!stillRunning) {
          lockedTabIdRef.current = undefined;
        }
      }
    },
    [
      isPurlMode,
      lightningResult,
      preservedTranscriptTabId,
      queryTabId,
      activeSessionId,
      sendPrompt,
      lockedTabIdRef,
      agentStartedTabIdRef,
      tabChangedDuringAgentRef,
      isAgentRunningRef
    ]
  );
}
