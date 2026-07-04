import type { ToolContext, ToolResult } from '../pageToolsSupport/types';
import { waitForTabLoading } from '../tabState';
import type { BatchToolParams, BatchStepResult } from './types';
import { FORM_INPUT_SETTLE_MS } from './constants';
import {
  summarizeStepInput,
  isReadOnlyAction,
  isMutationOrInteractionAction,
  isSubmitBoundaryAction
} from './classify';
import { buildOutput, buildPartialResult } from './results';
import {
  enhanceChildFailureMessage,
  shouldWaitAfter,
  shouldSettleAfter,
  ensureDebuggerAttachedForBatchStep,
  runChildActionWithTimeout
} from './execution';
import {
  validateBatchSafety,
  validateBatchPageReady,
  preflightBatchPermission
} from './validation';
import { prepareBatchActions } from './prepare';

export async function executeBatch(
  params: BatchToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const prepared = await prepareBatchActions(params, context);
  if (!prepared.ok) return prepared.error;

  const { preparedActions, batchTabId, onError, resultMode, screenshotMode } = prepared;

  const safetyError = validateBatchSafety(preparedActions);
  if (safetyError) {
    return buildPartialResult({
      steps: [
        {
          index: safetyError.index,
          id: preparedActions[safetyError.index]?.action.id,
          tool: preparedActions[safetyError.index]?.toolName || 'browser_batch',
          ok: false,
          error: safetyError.error,
          errorCode: safetyError.errorCode,
          stoppedReason: 'unsafe_batch'
        }
      ],
      actionCount: preparedActions.length,
      failedIndex: safetyError.index,
      error: safetyError.error,
      stoppedReason: 'unsafe_batch',
      resultMode
    });
  }

  const pageReadyError = await validateBatchPageReady(batchTabId, preparedActions);
  if (pageReadyError) {
    const stoppedReason =
      pageReadyError.errorCode === 'tab_unavailable' ? 'tab_unavailable' : 'system_page';
    return buildPartialResult({
      steps: [
        {
          index: pageReadyError.index,
          id: preparedActions[pageReadyError.index]?.action.id,
          tool: preparedActions[pageReadyError.index]?.toolName || 'browser_batch',
          ok: false,
          error: pageReadyError.error,
          errorCode: pageReadyError.errorCode,
          stoppedReason
        }
      ],
      actionCount: preparedActions.length,
      failedIndex: pageReadyError.index,
      error: pageReadyError.error,
      stoppedReason,
      resultMode
    });
  }

  const permissionPreflight = await preflightBatchPermission(batchTabId, context);
  if (permissionPreflight?.type === 'permission_required') {
    return permissionPreflight;
  }
  if (permissionPreflight?.error) {
    return buildPartialResult({
      steps: [
        {
          index: 0,
          id: preparedActions[0]?.action.id,
          tool: preparedActions[0]?.toolName || 'browser_batch',
          ok: false,
          error: permissionPreflight.error,
          errorCode: 'permission_required',
          stoppedReason: 'permission_required'
        }
      ],
      actionCount: preparedActions.length,
      failedIndex: 0,
      error: permissionPreflight.error,
      stoppedReason: 'permission_required',
      resultMode
    });
  }

  const steps: BatchStepResult[] = [];
  let lastImage: { base64Image: string; imageFormat: string } | undefined;
  let lastTabContext: ToolResult['tabContext'] | undefined;

  for (let i = 0; i < preparedActions.length; i++) {
    const { action, toolName, tool, input } = preparedActions[i];
    const childTabAccess = isReadOnlyAction(toolName, input) ? 'read' : 'write';
    const childContext: ToolContext = {
      ...context,
      tabAccess: childTabAccess,
      resolveTabId: async (requestedTabId, options) =>
        await context.resolveTabId(requestedTabId, {
          tabAccess: options?.tabAccess ?? childTabAccess
        })
    };
    let result: ToolResult;
    try {
      await ensureDebuggerAttachedForBatchStep(toolName, input, childContext);
      result = await runChildActionWithTimeout(tool, input, childContext, toolName);
    } catch (err) {
      const childError = enhanceChildFailureMessage(
        toolName,
        err instanceof Error ? err.message : 'Unknown error'
      );
      const errMsg = `actions[${i}] (${toolName}) failed: ${childError}`;
      steps.push({
        index: i,
        id: action.id,
        tool: toolName,
        ok: false,
        error: errMsg,
        errorCode: 'exception',
        stoppedReason: 'exception'
      });
      return buildPartialResult({
        steps,
        actionCount: preparedActions.length,
        failedIndex: i,
        error: errMsg,
        stoppedReason: 'exception',
        lastImage,
        lastTabContext,
        resultMode
      });
    }

    if (result.type === 'permission_required') {
      if (steps.length === 0) return result;
      if (result.tabContext) lastTabContext = result.tabContext;
      const errMsg = `actions[${i}] (${toolName}) needs permission. Stopping without replaying the batch; run this action separately to request approval, then continue with the remaining actions.`;
      steps.push({
        index: i,
        id: action.id,
        tool: toolName,
        ok: false,
        error: errMsg,
        errorCode: 'permission_required',
        stoppedReason: 'permission_required',
        permission: {
          ...(typeof result.tool === 'string' ? { tool: result.tool } : {}),
          ...(typeof result.url === 'string' ? { url: result.url } : {})
        }
      });
      return buildPartialResult({
        steps,
        actionCount: preparedActions.length,
        failedIndex: i,
        error: errMsg,
        stoppedReason: 'permission_required',
        lastImage,
        lastTabContext,
        resultMode
      });
    }

    if (result.error) {
      if (result.base64Image && screenshotMode === 'last') {
        lastImage = {
          base64Image: result.base64Image,
          imageFormat: result.imageFormat || 'jpeg'
        };
      }
      if (result.tabContext) lastTabContext = result.tabContext;
      const childError = enhanceChildFailureMessage(toolName, result.error);
      const errMsg = `actions[${i}] (${toolName}) failed: ${childError}`;
      steps.push({
        index: i,
        id: action.id,
        tool: toolName,
        ok: false,
        error: errMsg,
        errorCode: 'tool_error',
        stoppedReason: 'tool_error',
        tabContext: result.tabContext
      });
      if (
        onError === 'continue' &&
        isReadOnlyAction(toolName, input) &&
        !preparedActions
          .slice(i + 1)
          .some((remainingAction) =>
            isMutationOrInteractionAction(remainingAction.toolName, remainingAction.input)
          )
      ) {
        continue;
      }
      return buildPartialResult({
        steps,
        actionCount: preparedActions.length,
        failedIndex: i,
        error: errMsg,
        stoppedReason: 'tool_error',
        lastImage,
        lastTabContext,
        resultMode
      });
    }

    const output =
      result.output ||
      (toolName === 'computer'
        ? summarizeStepInput(toolName, input)
        : summarizeStepInput(toolName, input));
    steps.push({
      index: i,
      id: action.id,
      tool: toolName,
      ok: true,
      output,
      tabContext: result.tabContext,
      imageId: typeof result.imageId === 'string' ? result.imageId : undefined
    });
    if (result.base64Image) {
      lastImage =
        screenshotMode === 'last'
          ? { base64Image: result.base64Image, imageFormat: result.imageFormat || 'jpeg' }
          : undefined;
    }
    if (result.tabContext) lastTabContext = result.tabContext;

    const hasNextAction = i < preparedActions.length - 1;
    const shouldWaitForLoad =
      shouldWaitAfter(toolName, action, input) &&
      (hasNextAction || action.waitAfter === 'load' || isSubmitBoundaryAction(toolName, input));
    if (shouldWaitForLoad) {
      const tabId = input.tabId ?? batchTabId;
      if (tabId != null) {
        await waitForTabLoading(tabId);
      }
    }
    if (hasNextAction && shouldSettleAfter(toolName, action, preparedActions[i + 1])) {
      await new Promise((resolve) => setTimeout(resolve, FORM_INPUT_SETTLE_MS));
    }
  }

  const failedStep = steps.find((step) => !step.ok);
  if (failedStep) {
    const errMsg =
      failedStep.error ||
      `actions[${failedStep.index}] (${failedStep.tool}) failed during browser_batch`;
    return buildPartialResult({
      steps,
      actionCount: preparedActions.length,
      failedIndex: failedStep.index,
      error: errMsg,
      stoppedReason: failedStep.stoppedReason || 'tool_error',
      remaining: 0,
      lastImage,
      lastTabContext,
      resultMode
    });
  }

  return {
    output: buildOutput({
      steps,
      actionCount: preparedActions.length,
      stoppedReason: 'completed',
      resultMode
    }),
    steps,
    completed: steps.filter((step) => step.ok).length,
    failedIndex: null,
    remaining: 0,
    stoppedReason: 'completed',
    ...(lastTabContext ? { tabContext: lastTabContext } : {}),
    ...(lastImage || {})
  };
}
