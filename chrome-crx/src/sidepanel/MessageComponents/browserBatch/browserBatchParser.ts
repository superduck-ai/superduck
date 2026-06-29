import { isRecord, isTextContentBlock } from '../../../messageTypes';
import type { ApiToolResultBlock } from '../../../messageTypes';
import { getTextFromBlockContent } from '../../sidepanelUtils';
import type { ToolInputRecord } from '../../types';

export function getStringField(
  input: ToolInputRecord | undefined,
  field: string
): string | undefined {
  return input && typeof input[field] === 'string' ? input[field] : undefined;
}

export type BrowserBatchActionStatus = 'complete' | 'failed' | 'pending';

export interface BrowserBatchParsedResult {
  completedCount: number | null;
  stepStatuses: Map<number, BrowserBatchActionStatus>;
  stepErrors: Map<number, string>;
  stepErrorCodes: Map<number, string>;
  stepStoppedReasons: Map<number, string>;
  summary?: string;
}

export function getBrowserBatchResultText(toolResult?: ApiToolResultBlock): string {
  const content = toolResult?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const jsonBlock = content.find(
      (block) => isTextContentBlock(block) && block.text.trim().startsWith('{')
    );
    if (isTextContentBlock(jsonBlock)) return jsonBlock.text;
  }
  return getTextFromBlockContent(content, '\n');
}

export function parseBrowserBatchResult(resultText: string): BrowserBatchParsedResult {
  try {
    const parsed = JSON.parse(resultText) as {
      completed?: unknown;
      steps?: unknown;
      summary?: unknown;
    };
    const stepStatuses = new Map<number, BrowserBatchActionStatus>();
    const stepErrors = new Map<number, string>();
    const stepErrorCodes = new Map<number, string>();
    const stepStoppedReasons = new Map<number, string>();

    if (Array.isArray(parsed.steps)) {
      for (const step of parsed.steps) {
        if (!isRecord(step) || typeof step.index !== 'number') continue;
        stepStatuses.set(step.index, step.ok === true ? 'complete' : 'failed');
        if (typeof step.error === 'string') {
          stepErrors.set(step.index, step.error);
        }
        if (typeof step.errorCode === 'string') {
          stepErrorCodes.set(step.index, step.errorCode);
        }
        if (typeof step.stoppedReason === 'string') {
          stepStoppedReasons.set(step.index, step.stoppedReason);
        }
      }
    }

    return {
      completedCount:
        typeof parsed.completed === 'number' && Number.isFinite(parsed.completed)
          ? parsed.completed
          : null,
      stepStatuses,
      stepErrors,
      stepErrorCodes,
      stepStoppedReasons,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined
    };
  } catch {
    return {
      completedCount: null,
      stepStatuses: new Map(),
      stepErrors: new Map(),
      stepErrorCodes: new Map(),
      stepStoppedReasons: new Map()
    };
  }
}

export function isBrowserBatchError(
  toolResult: ApiToolResultBlock | undefined,
  resultText: string,
  failedActionIndex: number | null
): boolean {
  return (
    toolResult?.is_error === true ||
    failedActionIndex !== null ||
    /^actions array /.test(resultText)
  );
}

export function getBrowserBatchActionStatus({
  index,
  toolResult,
  failedActionIndex,
  completedCount,
  stepStatuses,
  hasBatchError
}: {
  index: number;
  toolResult?: ApiToolResultBlock;
  failedActionIndex: number | null;
  completedCount: number | null;
  stepStatuses: Map<number, BrowserBatchActionStatus>;
  hasBatchError: boolean;
}): BrowserBatchActionStatus {
  if (!toolResult) return 'pending';
  const stepStatus = stepStatuses.get(index);
  if (stepStatus) return stepStatus;
  if (completedCount !== null) {
    if (index < completedCount) return 'complete';
    if (failedActionIndex !== null && index === failedActionIndex) return 'failed';
    return 'pending';
  }
  if (failedActionIndex !== null) {
    if (index < failedActionIndex) return 'complete';
    if (index === failedActionIndex) return 'failed';
    return 'pending';
  }
  if (hasBatchError) return 'pending';
  return 'complete';
}
