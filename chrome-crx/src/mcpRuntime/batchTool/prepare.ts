import { coerceToolInputTypes, validateToolInput } from '../pageToolsSupport/helpers';
import type { ToolContext, ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { BatchAction, BatchToolParams } from './types';
import { MAX_BATCH_ACTIONS, MIN_BATCH_ACTIONS, BATCH_ALLOWED_TOOLS } from './constants';
import { getToolRegistry, getBatchActionToolName } from './classify';
import { buildInvalidBatchResult, buildPartialResult } from './results';
import { validateBatchActionInput } from './validation';

export interface PreparedAction {
  action: BatchAction;
  toolName: string;
  tool: ToolDefinition;
  input: Record<string, unknown> & { tabId?: number };
}

export interface PrepareSuccess {
  ok: true;
  preparedActions: PreparedAction[];
  batchTabId: number | undefined;
  onError: string;
  resultMode: 'summary' | 'detailed';
  screenshotMode: 'last' | 'none';
}

export type PrepareResult = PrepareSuccess | { ok: false; error: ToolResult };

export async function prepareBatchActions(
  params: BatchToolParams,
  context: ToolContext
): Promise<PrepareResult> {
  if (!params.actions || !Array.isArray(params.actions) || params.actions.length === 0) {
    return {
      ok: false,
      error: buildInvalidBatchResult('actions array is required and must not be empty')
    };
  }
  if (params.actions.length < MIN_BATCH_ACTIONS) {
    return {
      ok: false,
      error: buildInvalidBatchResult(
        `browser_batch requires at least ${MIN_BATCH_ACTIONS} deterministic actions. Run single actions directly instead.`,
        params.actions.length
      )
    };
  }
  if (params.actions.length > MAX_BATCH_ACTIONS) {
    return {
      ok: false,
      error: buildInvalidBatchResult(
        `actions array has ${params.actions.length} items, exceeding the maximum of ${MAX_BATCH_ACTIONS}. Please split into smaller batches.`,
        params.actions.length
      )
    };
  }

  const { tools: allToolsList, map: toolRegistry } = await getToolRegistry();
  const onError = params.onError || 'stop';
  const resultMode = params.resultMode || 'summary';
  const screenshotMode = params.screenshot || 'last';
  const preparedActions: PreparedAction[] = [];
  let batchTabId = typeof params.tabId === 'number' ? params.tabId : context.tabId;
  if (typeof batchTabId === 'number') {
    batchTabId = await context.resolveTabId(batchTabId);
  }

  for (let i = 0; i < params.actions.length; i++) {
    const action = params.actions[i];
    if (!action || typeof action !== 'object') {
      const errMsg = `actions[${i}] must be an object`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              tool: '<invalid>',
              ok: false,
              error: errMsg,
              errorCode: 'invalid_action',
              stoppedReason: 'invalid_action'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        })
      };
    }
    const toolName = getBatchActionToolName(action);
    if (!toolName) {
      const errMsg = `actions[${i}] tool is required`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: '<missing>',
              ok: false,
              error: errMsg,
              errorCode: 'missing_tool',
              stoppedReason: 'invalid_action'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        })
      };
    }
    if (toolName === 'navigate') {
      const errMsg =
        'navigate should not run inside browser_batch. Call navigate by itself, then call read_page/find separately before batching deterministic actions.';
      // plain-text output (not buildOutput JSON) keeps failedActionIndex=null so
      // sidepanel shows browser_batch_failed, not stopped_at_step
      const partialResult = buildPartialResult({
        steps: [
          {
            index: i,
            id: action.id,
            tool: toolName,
            ok: false,
            error: errMsg,
            errorCode: 'unsafe_after_navigate',
            stoppedReason: 'unsafe_batch'
          }
        ],
        actionCount: params.actions.length,
        failedIndex: i,
        error: errMsg,
        stoppedReason: 'unsafe_batch',
        resultMode
      });
      return {
        ok: false,
        error: { ...partialResult, output: errMsg }
      };
    }
    if (!BATCH_ALLOWED_TOOLS.has(toolName)) {
      const stoppedReason = toolName === 'browser_batch' ? 'nested_batch' : 'disallowed_tool';
      const errMsg =
        toolName === 'browser_batch'
          ? `actions[${i}]: browser_batch cannot be nested`
          : `actions[${i}]: tool "${toolName}" is not allowed in browser_batch`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: stoppedReason,
              stoppedReason
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason,
          resultMode
        })
      };
    }
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      const errMsg = `actions[${i}] unknown tool: "${toolName}"`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: 'unknown_tool',
              stoppedReason: 'unknown_tool'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'unknown_tool',
          resultMode
        })
      };
    }
    if (!action.input || typeof action.input !== 'object' || Array.isArray(action.input)) {
      const errMsg = `actions[${i}] input must be an object`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: 'invalid_action_input',
              stoppedReason: 'invalid_action'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        })
      };
    }

    const input = { ...action.input };
    const coerced = coerceToolInputTypes(toolName, input, allToolsList);
    if (!coerced || typeof coerced !== 'object' || Array.isArray(coerced)) {
      const errMsg = `actions[${i}] input must be an object`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: 'invalid_action_input',
              stoppedReason: 'invalid_action'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        })
      };
    }
    const coercedInput = coerced as Record<string, unknown>;
    const childTabId = typeof coercedInput.tabId === 'number' ? coercedInput.tabId : undefined;
    if (batchTabId == null && childTabId != null) {
      batchTabId = await context.resolveTabId(childTabId);
    }
    if (batchTabId != null) {
      if (childTabId != null && childTabId !== batchTabId) {
        const errMsg = `actions[${i}]: browser_batch supports one tab only (batch tabId ${batchTabId}, action tabId ${childTabId})`;
        return {
          ok: false,
          error: buildPartialResult({
            steps: [
              {
                index: i,
                id: action.id,
                tool: toolName,
                ok: false,
                error: errMsg,
                errorCode: 'cross_tab',
                stoppedReason: 'cross_tab'
              }
            ],
            actionCount: params.actions.length,
            failedIndex: i,
            error: errMsg,
            stoppedReason: 'cross_tab',
            resultMode
          })
        };
      }
      coercedInput.tabId = batchTabId;
    }
    const batchActionInputError = validateBatchActionInput(toolName, coercedInput);
    if (batchActionInputError) {
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: batchActionInputError.error,
              errorCode: batchActionInputError.errorCode,
              stoppedReason: 'invalid_batch_input'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: batchActionInputError.error,
          stoppedReason: 'invalid_batch_input',
          resultMode
        })
      };
    }
    const validation = validateToolInput(toolName, coerced, allToolsList);
    if (!validation.valid) {
      const errMsg = `actions[${i}] invalid input for ${toolName}: ${validation.errors.join('; ')}`;
      return {
        ok: false,
        error: buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: 'validation_error',
              stoppedReason: 'validation_error'
            }
          ],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'validation_error',
          resultMode
        })
      };
    }
    preparedActions.push({ action, toolName, tool, input: coercedInput });
  }

  return {
    ok: true,
    preparedActions,
    batchTabId,
    onError,
    resultMode,
    screenshotMode
  };
}
