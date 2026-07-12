import type React from 'react';
import type { ModelsConfigFeatureValue, ModelOptionConfig } from '../../extensionServices';
import { isRecord } from '../../messageTypes';
import { formatTabsOutput, tabGroupManager } from '../../mcpRuntime';
import { DEFAULT_BROWSER_SESSION_ID } from '../../mcpRuntime/sessionScope';

const DEFAULT_BROWSER_SESSION_CONTEXT = {
  browserSessionScope: { sessionId: DEFAULT_BROWSER_SESSION_ID },
  tabAccess: 'read' as const
};

interface PermissionRequiredResult extends Record<string, unknown> {
  type: 'permission_required';
}

function isPermissionRequiredResult(value: unknown): value is PermissionRequiredResult {
  return isRecord(value) && value.type === 'permission_required';
}

function isModelOptionConfig(option: string | ModelOptionConfig): option is ModelOptionConfig {
  return typeof option !== 'string';
}

export async function executeWithPermission<TResult>(
  action: () => Promise<TResult>,
  onPermissionRequest?: (result: PermissionRequiredResult) => Promise<boolean>
): Promise<{ denied: boolean; result?: TResult }> {
  const result = await action();
  if (isPermissionRequiredResult(result)) {
    if (onPermissionRequest) {
      if (await onPermissionRequest(result)) {
        const retryResult = await action();
        if (isPermissionRequiredResult(retryResult)) {
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
    const tabs = await tabGroupManager.getValidTabsWithMetadataForContext(
      tabGroupId,
      DEFAULT_BROWSER_SESSION_CONTEXT
    );
    if (tabs.length <= 1) {
      if (lastContextRef.current !== null) lastContextRef.current = null;
      return null;
    }

    const contextKey =
      tabs
        .map((tab) => tab.id)
        .sort((left: number, right: number) => left - right)
        .join(',') + `:${activeTabId}`;
    if (contextKey === lastContextRef.current) return null;

    lastContextRef.current = contextKey;
    return formatTabsOutput(tabs, undefined, activeTabId);
  } catch {
    return null;
  }
}

export function resolveEffortLevel(
  effort: string,
  model: string,
  modelsConfig: ModelsConfigFeatureValue | undefined
): string {
  if (effort === 'none') return 'none';
  const modelOption = (modelsConfig?.options ?? []).find(
    (option): option is ModelOptionConfig => isModelOptionConfig(option) && option.model === model
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
