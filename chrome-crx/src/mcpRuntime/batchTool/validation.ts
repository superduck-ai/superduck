import type { ToolContext, ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { BatchAction, BatchValidationError } from './types';
import { CHILD_ACTION_TIMEOUT_MS, REF_ID_PATTERN } from './constants';
import {
  isPageObservationAction,
  isMutationOrInteractionAction,
  isSubmitBoundaryAction,
  hasKeyAfterSubmitBoundary
} from './classify';
import { isSystemUrl } from './execution';

export function validateBatchActionInput(
  toolName: string,
  input: Record<string, unknown>
): BatchValidationError | null {
  if (
    toolName === 'form_input' &&
    typeof input.ref !== 'string' &&
    typeof input.ref_id === 'string'
  ) {
    return {
      error:
        'form_input uses "ref", not "ref_id". ref_id is only for read_page subtree reads. Run read_page/find first, then pass the returned ref_N as form_input.ref in a new browser_batch.',
      errorCode: 'invalid_form_ref_id'
    };
  }

  const ref = input.ref;
  if (ref !== undefined) {
    if (typeof ref !== 'string' || !REF_ID_PATTERN.test(ref)) {
      return {
        error:
          'browser_batch requires concrete refs like "ref_1". It cannot use placeholders or outputs from earlier actions in the same batch; run read_page/find first, then start a new batch with the returned ref_N.',
        errorCode: 'invalid_placeholder_ref'
      };
    }
  }

  if (toolName === 'computer' && input.action === 'wait' && typeof input.duration === 'number') {
    const timeoutSeconds = CHILD_ACTION_TIMEOUT_MS / 1000;
    if (input.duration >= timeoutSeconds) {
      return {
        error: `computer.wait duration ${input.duration}s is too long for browser_batch child timeout (${timeoutSeconds}s). Use a shorter wait inside browser_batch, or run the wait separately.`,
        errorCode: 'wait_too_long'
      };
    }
  }

  return null;
}

export function validateBatchSafety(
  preparedActions: Array<{
    action: BatchAction;
    toolName: string;
    tool: ToolDefinition;
    input: Record<string, unknown>;
  }>
): ({ index: number } & BatchValidationError) | null {
  for (let i = 0; i < preparedActions.length; i++) {
    const { toolName, input } = preparedActions[i];

    if (i === 0 && isPageObservationAction(toolName)) {
      return {
        index: i,
        errorCode: 'unsafe_observation_first',
        error:
          'browser_batch should not start with read_page/find/get_page_text. Run the observation as a separate tool call first, then start a new deterministic batch with fresh refs.'
      };
    }

    if (hasKeyAfterSubmitBoundary(toolName, input)) {
      return {
        index: i,
        errorCode: 'unsafe_after_submit',
        error:
          'key tokens after Enter/Return should not run inside the same computer.key action because Enter/Return may submit a form, navigate, or change SPA state. End the key action at Enter/Return, then observe the page with read_page/find before continuing.'
      };
    }

    if (i < preparedActions.length - 1 && isSubmitBoundaryAction(toolName, input)) {
      return {
        index: i + 1,
        errorCode: 'unsafe_after_submit',
        error:
          'actions after Enter/Return should not run inside the same browser_batch because the key may submit a form, navigate, or change SPA state. End the batch at Enter/Return, then observe the page with read_page/find before continuing.'
      };
    }

    if (!isPageObservationAction(toolName)) continue;

    for (let j = i + 1; j < preparedActions.length; j++) {
      const later = preparedActions[j];
      if (!isMutationOrInteractionAction(later.toolName, later.input)) continue;
      return {
        index: j,
        errorCode: 'unsafe_observation_then_mutation',
        error:
          `${toolName} returns observation results that cannot be consumed by later actions inside the same browser_batch. ` +
          'Run the observation first, then start a new batch with fresh refs for click/form_input/type/key actions.'
      };
    }
  }

  return null;
}

export async function validateBatchPageReady(
  batchTabId: number | undefined,
  _preparedActions: Array<{ action: BatchAction; toolName: string }>
): Promise<({ index: number } & BatchValidationError) | null> {
  if (batchTabId === undefined) return null;
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(batchTabId);
  } catch (err) {
    return {
      index: 0,
      errorCode: 'tab_unavailable',
      error: `browser_batch cannot run because tab ${batchTabId} is no longer available: ${err instanceof Error ? err.message : 'Unknown tab lookup error'}. Refresh the current browser context before batching more actions.`
    };
  }
  if (!isSystemUrl(tab.url)) return null;
  return {
    index: 0,
    errorCode: 'system_page',
    error:
      'browser_batch cannot run on browser system pages, extension pages, about:blank, data: URLs, or pages without a normal web URL. Navigate first as a separate tool call, then observe the loaded page before batching deterministic actions.'
  };
}

export async function preflightBatchPermission(
  batchTabId: number | undefined,
  context: ToolContext
): Promise<ToolResult | null> {
  if (batchTabId === undefined || !context.permissionManager) return null;
  const permissionManager = context.permissionManager as {
    checkPermission?: (
      url: string,
      toolUseId?: string
    ) => Promise<{ allowed: boolean; needsPrompt?: boolean }>;
    getTurnApprovedDomains?: () => string[];
    setTurnApprovedDomains?: (domains: string[]) => void;
  };
  if (typeof permissionManager.checkPermission !== 'function') return null;

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(batchTabId);
  } catch {
    return null;
  }
  if (!tab.url || isSystemUrl(tab.url)) return null;

  const permission = await permissionManager.checkPermission(tab.url, context.toolUseId);
  if (!permission.allowed) {
    return permission.needsPrompt
      ? {
          type: 'permission_required',
          tool: 'browser_batch',
          url: tab.url,
          toolUseId: context.toolUseId
        }
      : { error: 'Permission denied by user' };
  }

  if (
    typeof permissionManager.getTurnApprovedDomains === 'function' &&
    typeof permissionManager.setTurnApprovedDomains === 'function'
  ) {
    const host = new URL(tab.url).host;
    permissionManager.setTurnApprovedDomains([
      ...new Set([...permissionManager.getTurnApprovedDomains(), host])
    ]);
  }
  return null;
}
