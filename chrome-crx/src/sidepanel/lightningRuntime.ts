import type React from 'react';
import { formatTabsOutput, tabGroupManager } from '../mcpRuntime';

export async function executeWithPermission(
  action: () => Promise<any>,
  onPermissionRequest?: (result: any) => Promise<boolean>
): Promise<{ denied: boolean; result?: any }> {
  const result = await action();
  if (
    result &&
    typeof result === 'object' &&
    'type' in result &&
    result.type === 'permission_required'
  ) {
    if (onPermissionRequest) {
      if (await onPermissionRequest(result)) {
        const retryResult = await action();
        if (
          retryResult &&
          typeof retryResult === 'object' &&
          'type' in retryResult &&
          retryResult.type === 'permission_required'
        ) {
          return { denied: true };
        }
        return { denied: false, result: retryResult };
      }
      return { denied: true };
    }
    return { denied: true };
  }
  return { denied: false, result };
}

export async function getUpdatedTabContext(
  tabGroupId: number,
  activeTabId: number,
  lastContextRef: React.MutableRefObject<string | null>
): Promise<string | null> {
  try {
    const tabs = await tabGroupManager.getValidTabsWithMetadata(tabGroupId);
    if (tabs.length <= 1) {
      if (lastContextRef.current !== null) lastContextRef.current = null;
      return null;
    }

    const contextKey =
      tabs
        .map((tab: any) => tab.id)
        .sort((left: number, right: number) => left - right)
        .join(',') + `:${activeTabId}`;
    if (contextKey === lastContextRef.current) return null;

    lastContextRef.current = contextKey;
    return formatTabsOutput(tabs, undefined, activeTabId);
  } catch {
    return null;
  }
}

export function resolveEffortLevel(effort: string, model: string, modelsConfig: any): string {
  if (effort === 'none') return 'none';
  const modelOption = (modelsConfig.options ?? []).find(
    (option: any) => typeof option !== 'string' && option.model === model
  );
  const effortOptions = modelOption?.effort_options;
  if (effortOptions && effortOptions.length > 0 && effortOptions.includes(effort)) return effort;
  return 'none';
}

export const LIGHTNING_DEFAULT_CONFIG = {
  effort: 'medium',
  pageSettleMs: 100,
  imageFormat: 'jpeg' as const,
  imageQuality: 85,
  maxImageDimension: 1568,
  screenshotHistory: 1
};

export type LightningConfig = typeof LIGHTNING_DEFAULT_CONFIG;

interface IterationTiming {
  mode: string;
  durationMs: number;
  phases?: {
    ttfbMs?: number;
    streamingMs?: number;
    commandExecutionMs?: number;
    pageSettleMs?: number;
    screenshotMs?: number;
  };
}

const iterationTimings: IterationTiming[] = [];

export function pushTiming(entry: IterationTiming): void {
  iterationTimings.push(entry);
}

export function clearTimings(): void {
  iterationTimings.length = 0;
}

export function getTimingSummary() {
  const timings = [...iterationTimings];
  const totalDurationMs = timings.reduce((sum, timing) => sum + timing.durationMs, 0);
  const byMode: Record<string, any> = {};

  for (const timing of timings) {
    if (!byMode[timing.mode]) {
      byMode[timing.mode] = { count: 0, totalMs: 0, avgMs: 0, ips: 0 };
    }
    byMode[timing.mode].count++;
    byMode[timing.mode].totalMs += timing.durationMs;
  }

  for (const mode of Object.keys(byMode)) {
    const entry = byMode[mode];
    entry.avgMs = Math.round(entry.totalMs / entry.count);
    entry.ips = Math.round((1000 / entry.avgMs) * 100) / 100;

    const withPhases = timings.filter((timing) => timing.mode === mode && timing.phases);
    if (withPhases.length > 0) {
      const sums = {
        ttfbMs: 0,
        streamingMs: 0,
        commandExecutionMs: 0,
        pageSettleMs: 0,
        screenshotMs: 0
      };
      for (const timing of withPhases) {
        sums.ttfbMs += timing.phases?.ttfbMs ?? 0;
        sums.streamingMs += timing.phases?.streamingMs ?? 0;
        sums.commandExecutionMs += timing.phases?.commandExecutionMs ?? 0;
        sums.pageSettleMs += timing.phases?.pageSettleMs ?? 0;
        sums.screenshotMs += timing.phases?.screenshotMs ?? 0;
      }

      entry.avgPhases = {
        ttfbMs: Math.round(sums.ttfbMs / withPhases.length),
        streamingMs: Math.round(sums.streamingMs / withPhases.length),
        commandExecutionMs: Math.round(sums.commandExecutionMs / withPhases.length),
        pageSettleMs: Math.round(sums.pageSettleMs / withPhases.length),
        screenshotMs: Math.round(sums.screenshotMs / withPhases.length)
      };
    }
  }

  return {
    timings,
    summary: {
      totalIterations: timings.length,
      totalDurationMs,
      avgDurationMs: timings.length > 0 ? Math.round(totalDurationMs / timings.length) : 0,
      iterationsPerSecond:
        timings.length > 0
          ? Math.round((1000 / (totalDurationMs / timings.length)) * 100) / 100
          : 0,
      byMode
    }
  };
}

export const WITHIN_LIMIT_RESULT = { type: 'within_limit' } as const;
export const EMPTY_MESSAGE_HISTORY: any[] = [];
export const NOOP_RETRY = async () => {};
