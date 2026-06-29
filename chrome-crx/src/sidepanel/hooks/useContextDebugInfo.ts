import { useMemo } from 'react';
import type { ApiUsage } from '../../messageTypes';
import {
  CONTEXT_WINDOW,
  MAX_TOKENS,
  calculateContextUsageMetrics
} from '../conversation/messageLimits';

export interface ContextDebugInfo {
  hasUsage: boolean;
  contextWindow: number;
  maxTokens: number;
  tokenBudget: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalUsed: number;
  remaining: number;
  percentUsed: number;
}

export interface UseContextDebugInfoProps {
  debugMode: boolean;
  apiMessages: any[];
  serverModelInfo: any;
}

/**
 * useContextDebugInfo — 上下文窗口调试信息
 * 计算并返回上下文窗口使用情况
 */
export function useContextDebugInfo({
  debugMode,
  apiMessages,
  serverModelInfo
}: UseContextDebugInfoProps) {
  return useMemo(() => {
    if (!debugMode) return null;
    const ctxWindow = serverModelInfo?.contextLength ?? CONTEXT_WINDOW;
    let lastUsage: ApiUsage | null = null;
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      const msg = apiMessages[i];
      if (msg?.role === 'assistant' && msg?.usage) {
        lastUsage = msg.usage;
        break;
      }
    }
    const metrics = calculateContextUsageMetrics(lastUsage, ctxWindow);
    return {
      hasUsage: lastUsage !== null,
      contextWindow: ctxWindow,
      maxTokens: MAX_TOKENS,
      tokenBudget: metrics.tokenBudget,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      cacheTokens: metrics.cacheTokens,
      totalUsed: metrics.totalUsed,
      remaining: metrics.remaining,
      percentUsed: metrics.percentUsed
    };
  }, [debugMode, apiMessages, serverModelInfo]);
}
