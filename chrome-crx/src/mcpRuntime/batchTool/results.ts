import type { ToolResult } from '../pageToolsSupport/types';
import type { BatchStepResult } from './types';
import { BROWSER_BATCH_RETRY_GUIDANCE } from './constants';
import { summarizeStepInput, summarizeStepOutput } from './classify';

export function buildOutput(params: {
  steps: BatchStepResult[];
  actionCount: number;
  failedIndex?: number;
  stoppedReason?: string;
  remaining?: number;
  resultMode?: 'summary' | 'detailed';
}): string {
  const {
    steps,
    actionCount,
    failedIndex,
    stoppedReason,
    remaining: remainingOverride,
    resultMode
  } = params;
  const completed = steps.filter((step) => step.ok).length;
  const remaining =
    remainingOverride ??
    (failedIndex === undefined ? 0 : Math.max(0, actionCount - failedIndex - 1));
  const header =
    failedIndex === undefined
      ? `Batch completed: ${completed}/${actionCount} actions`
      : `Batch stopped at action ${failedIndex + 1}/${actionCount}: ${stoppedReason || 'failed'}`;
  const lines = steps.map((step) => {
    const marker = step.ok ? 'OK' : 'FAILED';
    const detail =
      step.error ||
      (step.output
        ? resultMode === 'summary'
          ? summarizeStepOutput(step.output)
          : step.output
        : summarizeStepInput(step.tool, {}));
    return `${step.index + 1}. [${marker}] ${step.tool}${step.id ? ` (${step.id})` : ''}${detail ? ` - ${detail}` : ''}`;
  });
  return JSON.stringify(
    {
      steps:
        resultMode === 'summary'
          ? steps.map((step) => ({
              index: step.index,
              ...(step.id ? { id: step.id } : {}),
              tool: step.tool,
              ok: step.ok,
              ...(step.output ? { output: summarizeStepOutput(step.output) } : {}),
              ...(step.error ? { error: step.error } : {}),
              ...(step.errorCode ? { errorCode: step.errorCode } : {}),
              ...(step.imageId ? { imageId: step.imageId } : {}),
              ...(step.stoppedReason ? { stoppedReason: step.stoppedReason } : {}),
              ...(step.permission ? { permission: step.permission } : {})
            }))
          : steps,
      completed,
      failedIndex: failedIndex ?? null,
      remaining,
      stoppedReason: stoppedReason ?? 'completed',
      ...(failedIndex !== undefined ? { retryGuidance: BROWSER_BATCH_RETRY_GUIDANCE } : {}),
      summary: [
        header,
        ...lines,
        ...(failedIndex !== undefined ? [BROWSER_BATCH_RETRY_GUIDANCE] : [])
      ].join('\n')
    },
    null,
    2
  );
}

export function buildPartialResult(params: {
  steps: BatchStepResult[];
  actionCount: number;
  failedIndex: number;
  error: string;
  stoppedReason: string;
  remaining?: number;
  lastImage?: { base64Image: string; imageFormat: string };
  lastTabContext?: ToolResult['tabContext'];
  resultMode?: 'summary' | 'detailed';
}): ToolResult {
  const {
    steps,
    actionCount,
    failedIndex,
    error,
    stoppedReason,
    remaining: remainingOverride,
    lastImage,
    lastTabContext,
    resultMode
  } = params;
  const completed = steps.filter((step) => step.ok).length;
  const remaining = remainingOverride ?? Math.max(0, actionCount - failedIndex - 1);
  const output = buildOutput({
    steps,
    actionCount,
    failedIndex,
    stoppedReason,
    remaining,
    resultMode
  });
  return {
    output,
    steps,
    completed,
    failedIndex,
    remaining,
    stoppedReason,
    errorMessage: error,
    is_error: true,
    ...(lastTabContext ? { tabContext: lastTabContext } : {}),
    ...(lastImage || {})
  };
}

export function buildInvalidBatchResult(error: string, actionCount = 0): ToolResult {
  return {
    output: buildOutput({
      steps: [
        {
          index: 0,
          tool: 'browser_batch',
          ok: false,
          error,
          errorCode: 'invalid_batch',
          stoppedReason: 'invalid_batch'
        }
      ],
      actionCount,
      failedIndex: 0,
      stoppedReason: 'invalid_batch',
      remaining: actionCount,
      resultMode: 'summary'
    }),
    steps: [
      {
        index: 0,
        tool: 'browser_batch',
        ok: false,
        error,
        errorCode: 'invalid_batch',
        stoppedReason: 'invalid_batch'
      }
    ],
    completed: 0,
    failedIndex: 0,
    remaining: actionCount,
    stoppedReason: 'invalid_batch',
    errorMessage: error,
    is_error: true
  };
}
