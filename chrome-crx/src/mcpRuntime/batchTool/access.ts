import { isRecord } from '../../messageTypes';
import { MAX_BATCH_ACTIONS, MIN_BATCH_ACTIONS, READ_ONLY_TOOLS } from './constants';
import type { BatchAction } from './types';

export function getBatchActionToolName(
  action: BatchAction | Record<string, unknown>
): string | undefined {
  if (typeof action.tool === 'string') return action.tool;
  const alias = (action as { name?: unknown }).name;
  return typeof alias === 'string' ? alias : undefined;
}

export function isReadOnlyAction(toolName: string, input: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true;
  if (toolName !== 'computer') return false;
  const computerAction = input.action;
  return computerAction === 'screenshot' || computerAction === 'wait' || computerAction === 'zoom';
}

export function isReadOnlyBrowserBatchArgs(args: unknown): boolean {
  if (!isRecord(args) || !Array.isArray(args.actions)) return false;
  const actions = args.actions;
  if (actions.length < MIN_BATCH_ACTIONS || actions.length > MAX_BATCH_ACTIONS) return false;

  return actions.every((action) => {
    if (!isRecord(action) || !isRecord(action.input)) return false;
    const toolName = getBatchActionToolName(action);
    return typeof toolName === 'string' && isReadOnlyAction(toolName, action.input);
  });
}
