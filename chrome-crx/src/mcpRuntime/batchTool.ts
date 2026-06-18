import { coerceToolInputTypes, validateToolInput } from './pageToolsSupport/helpers';
import type { ToolContext, ToolDefinition, ToolResult } from './pageToolsSupport/types';
import { cdpDebugger } from './cdp';
import { waitForTabLoading } from './shared';

interface BatchAction {
  tool: string;
  input: Record<string, unknown>;
  id?: string;
  waitAfter?: 'auto' | 'load' | 'none';
}

interface BatchToolParams {
  actions: BatchAction[];
  tabId?: number;
  onError?: 'stop' | 'continue';
  resultMode?: 'summary' | 'detailed';
  screenshot?: 'last' | 'none';
}

interface BatchStepResult {
  index: number;
  id?: string;
  tool: string;
  ok: boolean;
  output?: string;
  error?: string;
  errorCode?: string;
  tabContext?: ToolResult['tabContext'];
  imageId?: string;
  stoppedReason?: string;
  permission?: {
    tool?: string;
    url?: string;
  };
}

interface BatchValidationError {
  error: string;
  errorCode: string;
}

const BATCH_ALLOWED_TOOLS = new Set([
  'computer',
  'form_input',
  'read_page',
  'find',
  'get_page_text',
  'read_console_messages',
  'read_network_requests',
  'resize_window'
]);

const READ_ONLY_TOOLS = new Set([
  'read_page',
  'find',
  'get_page_text',
  'read_console_messages',
  'read_network_requests'
]);

const DEBUGGER_REQUIRED_TOOLS = new Set(['computer', 'resize_window']);
const PAGE_OBSERVATION_TOOLS = new Set(['read_page', 'find', 'get_page_text']);
const MUTATING_COMPUTER_ACTIONS = new Set([
  'left_click',
  'right_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'left_click_drag',
  'scroll',
  'scroll_to'
]);

// Cap batch size to prevent runaway agent loops from consuming excessive
// resources. The tool description encourages 2+ predictable steps; 20 is
// a generous upper bound for legitimate use cases.
const MAX_BATCH_ACTIONS = 20;
const MIN_BATCH_ACTIONS = 2;
const CHILD_ACTION_TIMEOUT_MS = 15000;
const FORM_INPUT_SETTLE_MS = 100;
const SUMMARY_STEP_OUTPUT_MAX_CHARS = 160;
const REF_ID_PATTERN = /^ref_\d+$/;
const BROWSER_BATCH_RETRY_GUIDANCE =
  'Do not retry this same browser_batch unchanged. First observe the current page with read_page/find, refresh refs, or run only the failed action separately before starting a new deterministic batch.';
const BROWSER_BATCH_DESCRIPTION =
  'Execute 2-20 browser tool calls in one round trip. After read_page/find has returned fresh refs, browser_batch is the preferred tool for a short run of deterministic browser actions that do not require inspecting intermediate results. Think in two phases: discover, then act. For new pages, system pages, about:blank, or unknown state, call navigate/read_page/find separately first; once refs are fresh, batch the next safe action sequence. Batch the safe prefix: if the first 2+ actions are predictable but the whole workflow is not, batch those actions and stop before uncertainty. High-value patterns: form_input(ref, value) -> computer.key(Enter); computer.left_click(ref) -> computer.type(text) -> computer.key(Enter); multi-field form_input fills followed by a known submit click/key; click(ref) -> screenshot/read_page when that observation is only final confirmation; scroll/scroll_to -> screenshot/read_page. For search boxes, command palettes, chat inputs, and native form fields, prefer form_input(ref, text) -> computer.key(Enter) when a fresh input ref exists; use left_click/type/key for custom controls. Keep Enter/Return as the last action in the batch. Do not use browser_batch for single actions, navigation, observation-first discovery, read_page/find -> click/type/form_input, Enter/Return -> anything else, nested batches, or actions whose input depends on a result produced earlier in the same batch. If a batch fails, observe or run the failed action separately before batching the next deterministic actions.';

let cachedRegistry: { tools: ToolDefinition[]; map: Map<string, ToolDefinition> } | null = null;

async function getToolRegistry(): Promise<{
  tools: ToolDefinition[];
  map: Map<string, ToolDefinition>;
}> {
  if (!cachedRegistry) {
    const { getAllTools } = await import('./core/tools');
    const tools = getAllTools();
    const map = new Map<string, ToolDefinition>();
    for (const t of tools) map.set(t.name, t);
    cachedRegistry = { tools, map };
  }
  return cachedRegistry;
}

function summarizeStepInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'computer') {
    const action = typeof input.action === 'string' ? input.action : 'action';
    if (typeof input.ref === 'string') return `${action} ${input.ref}`;
    if (typeof input.text === 'string') {
      const preview = input.text.length > 30 ? `${input.text.slice(0, 30)}...` : input.text;
      return `${action} "${preview}"`;
    }
    return action;
  }
  if (toolName === 'navigate' && typeof input.url === 'string') {
    return input.url.length > 48 ? `${input.url.slice(0, 48)}...` : input.url;
  }
  if (toolName === 'find' && typeof input.query === 'string') {
    return input.query.length > 48 ? `${input.query.slice(0, 48)}...` : input.query;
  }
  if (toolName === 'read_page' && typeof input.filter === 'string') return `filter=${input.filter}`;
  return toolName;
}

function getBatchActionToolName(action: BatchAction): string | undefined {
  if (typeof action.tool === 'string') return action.tool;
  const alias = (action as { name?: unknown }).name;
  return typeof alias === 'string' ? alias : undefined;
}

function isReadOnlyAction(toolName: string, input: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true;
  if (toolName !== 'computer') return false;
  const computerAction = input.action;
  return computerAction === 'screenshot' || computerAction === 'wait' || computerAction === 'zoom';
}

function isPageObservationAction(toolName: string): boolean {
  return PAGE_OBSERVATION_TOOLS.has(toolName);
}

function isMutationOrInteractionAction(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === 'navigate' || toolName === 'form_input' || toolName === 'resize_window')
    return true;
  if (toolName !== 'computer') return false;
  const action = typeof input.action === 'string' ? input.action : '';
  if (!action) return true;
  return !isReadOnlyAction(toolName, input);
}

function isSubmitBoundaryAction(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== 'computer' || input.action !== 'key' || typeof input.text !== 'string') {
    return false;
  }
  return getKeyTokens(input.text).some(isSubmitBoundaryKey);
}

function hasKeyAfterSubmitBoundary(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== 'computer' || input.action !== 'key' || typeof input.text !== 'string') {
    return false;
  }
  const tokens = getKeyTokens(input.text);
  const submitIndex = tokens.findIndex(isSubmitBoundaryKey);
  return submitIndex >= 0 && submitIndex < tokens.length - 1;
}

function getKeyTokens(text: string): string[] {
  return text.split(/[\s+]+/).filter(Boolean);
}

function isSubmitBoundaryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === 'enter' || normalized === 'return';
}

function summarizeStepOutput(output: string): string {
  const compact = output.replace(/\s+/g, ' ').trim();
  if (compact.length <= SUMMARY_STEP_OUTPUT_MAX_CHARS) return compact;
  return `${compact.slice(0, SUMMARY_STEP_OUTPUT_MAX_CHARS - 3)}...`;
}

function validateBatchActionInput(
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

function validateBatchSafety(
  preparedActions: Array<{
    action: BatchAction;
    toolName: string;
    tool: ToolDefinition;
    input: Record<string, unknown>;
  }>
): ({ index: number } & BatchValidationError) | null {
  for (let i = 0; i < preparedActions.length; i++) {
    const { toolName, input } = preparedActions[i];

    if (toolName === 'navigate') {
      return {
        index: i,
        errorCode: 'unsafe_after_navigate',
        error:
          'navigate should not run inside browser_batch. Navigation only waits for browser loading, not SPA hydration, semantic readiness, or stable refs. Call navigate by itself, then call read_page/find separately, then start a new deterministic batch with fresh refs.'
      };
    }

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

async function validateBatchPageReady(
  batchTabId: number | undefined,
  preparedActions: Array<{ action: BatchAction; toolName: string }>
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

async function preflightBatchPermission(
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

function enhanceChildFailureMessage(toolName: string, error: string): string {
  if (/No element found with reference/i.test(error)) {
    return `${error} The ref is stale or was not registered on the current page. Run read_page/find again to get fresh refs. For fragile search boxes, use computer left_click with the fresh ref, then computer type/key.`;
  }
  if (toolName === 'form_input' && /Failed to execute form input/i.test(error)) {
    return `${error}. Run read_page/find again to refresh the ref, or focus the field with computer left_click(ref) and use computer type/key.`;
  }
  return error;
}

function shouldWaitAfter(
  toolName: string,
  action: BatchAction,
  input: Record<string, unknown>
): boolean {
  if (action.waitAfter === 'none') return false;
  if (action.waitAfter === 'load') return true;
  if (toolName === 'navigate') return true;
  if (toolName !== 'computer') return false;
  const computerAction = typeof input.action === 'string' ? input.action : '';
  return MUTATING_COMPUTER_ACTIONS.has(computerAction);
}

function shouldSettleAfter(
  toolName: string,
  action: BatchAction,
  nextAction:
    | {
        toolName: string;
        input: Record<string, unknown>;
      }
    | undefined
): boolean {
  if (action.waitAfter === 'none') return false;
  if (toolName !== 'form_input' || !nextAction || nextAction.toolName !== 'computer') return false;
  const nextComputerAction =
    typeof nextAction.input.action === 'string' ? nextAction.input.action : '';
  return nextComputerAction === 'key' || nextComputerAction === 'type';
}

function isSystemUrl(url: string | undefined): boolean {
  return (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.startsWith('about:') ||
    url.startsWith('data:') ||
    url.startsWith('javascript:')
  );
}

async function ensureDebuggerAttachedForBatchStep(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<void> {
  if (!DEBUGGER_REQUIRED_TOOLS.has(toolName)) return;
  const targetTabId =
    typeof input.tabId === 'number'
      ? input.tabId
      : typeof context.tabId === 'number'
        ? context.tabId
        : undefined;
  if (targetTabId === undefined) return;
  const tab = await chrome.tabs.get(targetTabId);
  if (isSystemUrl(tab.url)) return;
  const attachTimeoutMs = 10000;
  try {
    let wasAttached = false;
    try {
      wasAttached = await withTimeout(
        cdpDebugger.isDebuggerAttached(targetTabId),
        attachTimeoutMs,
        'Timed out checking debugger attachment'
      );
    } catch {
      wasAttached = false;
    }
    await withTimeout(
      cdpDebugger.attachDebugger(targetTabId),
      attachTimeoutMs,
      'Timed out attaching debugger'
    );
    if (!wasAttached) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    throw err;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

async function runChildActionWithTimeout(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  context: ToolContext,
  toolName: string
): Promise<ToolResult> {
  return await withTimeout(
    tool.execute(input, context),
    CHILD_ACTION_TIMEOUT_MS,
    `${toolName} timed out after ${CHILD_ACTION_TIMEOUT_MS}ms`
  );
}

function buildOutput(params: {
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

function buildPartialResult(params: {
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

function buildInvalidBatchResult(error: string, actionCount = 0): ToolResult {
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

export const batchTool: ToolDefinition<BatchToolParams> = {
  name: 'browser_batch',
  description: BROWSER_BATCH_DESCRIPTION,
  parameters: {
    actions: {
      type: 'array',
      minItems: MIN_BATCH_ACTIONS,
      maxItems: MAX_BATCH_ACTIONS,
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Optional caller label used in the per-step result.'
          },
          tool: {
            type: 'string',
            enum: Array.from(BATCH_ALLOWED_TOOLS),
            description:
              'Allowed browser tool name. Observation tools may end a batch but their results cannot be used by later actions in the same batch. Control-flow, shortcut, superduck_* and JavaScript tools are intentionally excluded.'
          },
          input: { type: 'object', description: 'Input parameters for the selected tool' },
          waitAfter: {
            type: 'string',
            enum: ['auto', 'load', 'none'],
            description: 'Optional per-action wait override. Default: auto.'
          }
        },
        required: ['tool', 'input']
      },
      description: 'Array of actions to execute sequentially'
    },
    tabId: {
      type: 'number',
      description:
        'Default tab ID. Applied to every action; P1 requires all actions in a batch to target the same tab.'
    },
    onError: {
      type: 'string',
      enum: ['stop', 'continue'],
      description: 'Failure policy. Default stop. Continue is only honored for read-only actions.'
    },
    resultMode: {
      type: 'string',
      enum: ['summary', 'detailed'],
      description: 'summary returns concise step lines; detailed appends per-step JSON.'
    },
    screenshot: {
      type: 'string',
      enum: ['last', 'none'],
      description:
        'Return the last child screenshot image, or none. Default: last. Returned images are batch results and are not available as planning input for later actions in the same batch.'
    }
  },
  execute: async (params: BatchToolParams, context: ToolContext): Promise<ToolResult> => {
    if (!params.actions || !Array.isArray(params.actions) || params.actions.length === 0) {
      return buildInvalidBatchResult('actions array is required and must not be empty');
    }
    if (params.actions.length < MIN_BATCH_ACTIONS) {
      return buildInvalidBatchResult(
        `browser_batch requires at least ${MIN_BATCH_ACTIONS} deterministic actions. Run single actions directly instead.`,
        params.actions.length
      );
    }
    if (params.actions.length > MAX_BATCH_ACTIONS) {
      return buildInvalidBatchResult(
        `actions array has ${params.actions.length} items, exceeding the maximum of ${MAX_BATCH_ACTIONS}. Please split into smaller batches.`,
        params.actions.length
      );
    }

    const { tools: allToolsList, map: toolRegistry } = await getToolRegistry();
    const onError = params.onError || 'stop';
    const resultMode = params.resultMode || 'summary';
    const screenshotMode = params.screenshot || 'last';
    const preparedActions: Array<{
      action: BatchAction;
      toolName: string;
      tool: ToolDefinition;
      input: Record<string, unknown>;
    }> = [];
    let batchTabId = params.tabId ?? context.tabId;

    for (let i = 0; i < params.actions.length; i++) {
      const action = params.actions[i];
      if (!action || typeof action !== 'object') {
        const errMsg = `actions[${i}] must be an object`;
        return buildPartialResult({
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
        });
      }
      const toolName = getBatchActionToolName(action);
      if (!toolName) {
        const errMsg = `actions[${i}] tool is required`;
        return buildPartialResult({
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
        });
      }
      if (toolName === 'navigate') {
        const errMsg =
          'navigate should not run inside browser_batch. Call navigate by itself, then call read_page/find separately before batching deterministic actions.';
        return buildPartialResult({
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
      }
      if (!BATCH_ALLOWED_TOOLS.has(toolName)) {
        const stoppedReason = toolName === 'browser_batch' ? 'nested_batch' : 'disallowed_tool';
        const errMsg =
          toolName === 'browser_batch'
            ? `actions[${i}]: browser_batch cannot be nested`
            : `actions[${i}]: tool "${toolName}" is not allowed in browser_batch`;
        return buildPartialResult({
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
        });
      }
      const tool = toolRegistry.get(toolName);
      if (!tool) {
        const errMsg = `actions[${i}] unknown tool: "${toolName}"`;
        return buildPartialResult({
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
        });
      }
      if (!action.input || typeof action.input !== 'object' || Array.isArray(action.input)) {
        const errMsg = `actions[${i}] input must be an object`;
        return buildPartialResult({
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
        });
      }

      const input = { ...action.input };
      const coerced = coerceToolInputTypes(toolName, input, allToolsList);
      if (!coerced || typeof coerced !== 'object' || Array.isArray(coerced)) {
        const errMsg = `actions[${i}] input must be an object`;
        return buildPartialResult({
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
        });
      }
      const coercedInput = coerced as Record<string, unknown>;
      const childTabId = typeof coercedInput.tabId === 'number' ? coercedInput.tabId : undefined;
      if (batchTabId == null && childTabId != null) {
        batchTabId = childTabId;
      }
      if (batchTabId != null) {
        if (childTabId != null && childTabId !== batchTabId) {
          const errMsg = `actions[${i}]: browser_batch supports one tab only (batch tabId ${batchTabId}, action tabId ${childTabId})`;
          return buildPartialResult({
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
          });
        }
        coercedInput.tabId = batchTabId;
      }
      const batchActionInputError = validateBatchActionInput(toolName, coercedInput);
      if (batchActionInputError) {
        return buildPartialResult({
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
        });
      }
      const validation = validateToolInput(toolName, coerced, allToolsList);
      if (!validation.valid) {
        const errMsg = `actions[${i}] invalid input for ${toolName}: ${validation.errors.join('; ')}`;
        return buildPartialResult({
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
        });
      }
      preparedActions.push({ action, toolName, tool, input: coercedInput });
    }

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
      let result: ToolResult;
      try {
        await ensureDebuggerAttachedForBatchStep(toolName, input, context);
        result = await runChildActionWithTimeout(tool, input, context, toolName);
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
        const tabId = (input.tabId as number) ?? context.tabId;
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
  },
  toProviderSchema: async () => ({
    name: 'browser_batch',
    description: `${BROWSER_BATCH_DESCRIPTION} Use ${MIN_BATCH_ACTIONS}-${MAX_BATCH_ACTIONS} actions per batch.`,
    input_schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Optional caller label used in the per-step result'
              },
              tool: {
                type: 'string',
                enum: Array.from(BATCH_ALLOWED_TOOLS),
                description:
                  'Allowed browser tool name. Use one of computer, form_input, read_page, find, get_page_text, read_console_messages, read_network_requests, resize_window. Navigation must run as a separate navigate tool call. Observation tools may end a batch but their results cannot be used by later actions in that same batch.'
              },
              input: {
                type: 'object',
                description: 'Input parameters for the tool, same as calling it directly'
              },
              waitAfter: {
                type: 'string',
                enum: ['auto', 'load', 'none'],
                description: 'Optional per-action wait override. Default auto.'
              }
            },
            required: ['tool', 'input']
          },
          description: `Array of {tool, input} actions to execute sequentially (${MIN_BATCH_ACTIONS}-${MAX_BATCH_ACTIONS} actions)`,
          minItems: MIN_BATCH_ACTIONS,
          maxItems: MAX_BATCH_ACTIONS
        },
        tabId: {
          type: 'number',
          description:
            'Default tab ID applied to every action. All actions in one batch must target this same tab.'
        },
        onError: {
          type: 'string',
          enum: ['stop', 'continue'],
          description:
            'Failure policy. Default stop. Continue is only honored for read-only actions.'
        },
        resultMode: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'summary returns concise step lines; detailed appends per-step JSON.'
        },
        screenshot: {
          type: 'string',
          enum: ['last', 'none'],
          description:
            'Return the last child screenshot image, or none. Default last. Returned images are batch results and are not available as planning input for later actions in the same batch.'
        }
      },
      required: ['actions']
    }
  })
};
