import { coerceToolInputTypes, validateToolInput } from './pageToolsSupport/helpers';
import type { ToolContext, ToolDefinition, ToolResult } from './pageToolsSupport/types';
import { cdpDebugger } from './cdp';
import { waitForTabLoading } from './shared';

interface BatchAction {
  name?: string;
  tool?: string;
  input: Record<string, unknown>;
  id?: string;
  waitAfter?: 'auto' | 'load' | 'none';
}

interface BatchToolParams {
  actions: BatchAction[];
  tabId?: number;
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

interface BatchItemResult {
  label: string;
  output?: string;
  base64Image?: string;
  imageFormat?: string;
}

const CHILD_ACTION_TIMEOUT_MS = 15000;
const SUMMARY_STEP_OUTPUT_MAX_CHARS = 160;
// A computer.wait whose duration would meet/exceed the per-step timeout can never
// complete inside a batch, so reject it up front with a clear message instead of
// letting it die with a generic timeout.
const MAX_BATCH_WAIT_SECONDS = CHILD_ACTION_TIMEOUT_MS / 1000;
// form_input mutates field state through injected setters + dispatched events;
// give the page a brief moment to settle before a following type/key/submit step.
const FORM_INPUT_SETTLE_MS = 350;
const BROWSER_BATCH_DESCRIPTION =
  "Execute a sequence of browser tool calls in ONE round trip. Each item is {name, input} where input is exactly what you'd pass to that tool standalone. Actions execute SEQUENTIALLY (not in parallel) and stop on the first error. Use this tool extensively to quickly execute work whenever you can predict two or more steps ahead, e.g. navigate, click a field, type, press Return, screenshot. Each tool's own permission check runs per item; if an action navigates to a domain without permission, the next item's check fails and the batch stops. When a step opens a new tab (tabs_create, navigate with newTab:true, or a search submit), later steps that omit tabId automatically run on that newly created tab; pass an explicit tabId to target a different tab. Screenshots and other images are returned interleaved with outputs; coordinates you write in THIS batch refer to the screenshot taken BEFORE this call. browser_batch cannot be nested.";

const DEBUGGER_REQUIRED_TOOLS = new Set(['computer', 'resize_window']);
// Tools whose successful execution does not mutate page state, so a later child's
// permission prompt can still be surfaced for the user to approve. Navigations and
// reads belong here; only state-changing interactions poison prompt propagation.
const SAFE_PERMISSION_PROMPT_TOOLS = new Set([
  'tabs_context',
  'tabs_context_mcp',
  'shortcuts_list',
  'navigate',
  'read_page',
  'find',
  'get_page_text',
  'read_console_messages',
  'read_network_requests'
]);
const SAFE_PERMISSION_PROMPT_COMPUTER_ACTIONS = new Set([
  'wait',
  'screenshot',
  'scroll',
  'scroll_to',
  'hover',
  'zoom'
]);

let cachedRegistry: { tools: ToolDefinition[]; map: Map<string, ToolDefinition> } | null = null;

async function getToolRegistry(context: ToolContext): Promise<{
  tools: ToolDefinition[];
  map: Map<string, ToolDefinition>;
}> {
  const contextTools = context.availableTools;
  if (Array.isArray(contextTools) && contextTools.length > 0) {
    const map = new Map<string, ToolDefinition>();
    for (const tool of contextTools) map.set(tool.name, tool);
    return { tools: contextTools, map };
  }

  if (!cachedRegistry) {
    const { getAllTools } = await import('./core/tools');
    const tools = getAllTools();
    const map = new Map<string, ToolDefinition>();
    for (const tool of tools) map.set(tool.name, tool);
    cachedRegistry = { tools, map };
  }
  return cachedRegistry;
}

function getBatchActionToolName(action: BatchAction): string | undefined {
  if (typeof action.name === 'string') return action.name;
  return typeof action.tool === 'string' ? action.tool : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPermissionRequired(result: ToolResult): boolean {
  return result.type === 'permission_required';
}

function canPropagatePermissionPrompt(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName === 'tabs_create') return false;
  if (toolName === 'navigate' && input.newTab === true) return false;
  if (SAFE_PERMISSION_PROMPT_TOOLS.has(toolName)) return true;
  if (toolName === 'computer') {
    return (
      typeof input.action === 'string' && SAFE_PERMISSION_PROMPT_COMPUTER_ACTIONS.has(input.action)
    );
  }
  return false;
}

// A computer.wait that cannot finish within the per-step timeout would otherwise
// fail with an opaque timeout; surface a clear validation message instead.
function getBatchWaitTooLongError(
  toolName: string,
  input: Record<string, unknown>
): string | undefined {
  if (toolName !== 'computer' || input.action !== 'wait') return undefined;
  const duration = input.duration;
  if (typeof duration === 'number' && duration >= MAX_BATCH_WAIT_SECONDS) {
    return `computer wait of ${duration}s is too long for the browser_batch per-step timeout (${MAX_BATCH_WAIT_SECONDS}s); run the wait as a standalone step.`;
  }
  return undefined;
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
  if (toolName === 'tabs_create' && typeof input.url === 'string') {
    return input.url.length > 48 ? `${input.url.slice(0, 48)}...` : input.url;
  }
  if (toolName === 'find' && typeof input.query === 'string') {
    return input.query.length > 48 ? `${input.query.slice(0, 48)}...` : input.query;
  }
  if (toolName === 'read_page' && typeof input.filter === 'string') return `filter=${input.filter}`;
  return toolName;
}

function getBatchItemLabel(toolName: string, input: Record<string, unknown>): string {
  const action = input.action;
  return typeof action === 'string' ? `${toolName}:${action}` : toolName;
}

function summarizeStepOutput(output: string): string {
  const compact = output.replace(/\s+/g, ' ').trim();
  if (compact.length <= SUMMARY_STEP_OUTPUT_MAX_CHARS) return compact;
  return `${compact.slice(0, SUMMARY_STEP_OUTPUT_MAX_CHARS - 3)}...`;
}

function buildOutput(params: {
  steps: BatchStepResult[];
  actionCount: number;
  failedIndex?: number;
  stoppedReason?: string;
  resultMode?: 'summary' | 'detailed';
}): string {
  const { steps, actionCount, failedIndex, stoppedReason, resultMode } = params;
  const completed = steps.filter((step) => step.ok).length;
  const remaining = failedIndex === undefined ? 0 : Math.max(0, actionCount - failedIndex - 1);
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
        : undefined);
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
      summary: [header, ...lines].join('\n')
    },
    null,
    2
  );
}

function buildPartialResult(params: {
  steps: BatchStepResult[];
  batchItems: BatchItemResult[];
  actionCount: number;
  failedIndex: number;
  error: string;
  stoppedReason: string;
  lastImage?: { base64Image: string; imageFormat: string };
  lastTabContext?: ToolResult['tabContext'];
  resultMode?: 'summary' | 'detailed';
}): ToolResult {
  const {
    steps,
    batchItems,
    actionCount,
    failedIndex,
    error,
    stoppedReason,
    lastImage,
    lastTabContext,
    resultMode
  } = params;
  const remaining = Math.max(0, actionCount - failedIndex - 1);
  return {
    error,
    output: buildOutput({
      steps,
      actionCount,
      failedIndex,
      stoppedReason,
      resultMode
    }),
    steps,
    batchItems,
    completed: steps.filter((step) => step.ok).length,
    failedIndex,
    remaining,
    stoppedReason,
    is_error: true,
    ...(lastTabContext ? { tabContext: lastTabContext } : {}),
    ...(lastImage || {})
  };
}

function buildInvalidBatchResult(error: string, actionCount = 0): ToolResult {
  const step: BatchStepResult = {
    index: 0,
    tool: 'browser_batch',
    ok: false,
    error,
    errorCode: 'invalid_batch',
    stoppedReason: 'invalid_batch'
  };
  return {
    error,
    output: buildOutput({
      steps: [step],
      actionCount,
      failedIndex: 0,
      stoppedReason: 'invalid_batch',
      resultMode: 'summary'
    }),
    steps: [step],
    batchItems: [],
    completed: 0,
    failedIndex: 0,
    remaining: actionCount,
    stoppedReason: 'invalid_batch',
    is_error: true
  };
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

  let tab: chrome.tabs.Tab | undefined;
  try {
    tab = await chrome.tabs.get(targetTabId);
  } catch {
    return;
  }
  if (isSystemUrl(tab.url)) return;

  const attachTimeoutMs = 10000;
  let wasAttached: boolean;
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
  if (!wasAttached) await new Promise((resolve) => setTimeout(resolve, 500));
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

function resolveStepTabId(
  input: Record<string, unknown>,
  result: ToolResult,
  context: ToolContext
): number | undefined {
  // executedOnTabId reflects the tab a step actually ran on, including any tab it
  // newly created (tabs_create, navigate{newTab}, search submit). Prefer it over the
  // input tab so the created tab loads correctly and propagates to later steps.
  if (typeof result.tabContext?.executedOnTabId === 'number') {
    return result.tabContext.executedOnTabId;
  }
  if (typeof input.tabId === 'number') return input.tabId;
  return typeof context.tabId === 'number' ? context.tabId : undefined;
}

function normalizeChildInput(params: {
  input: Record<string, unknown>;
  toolName: string;
  tools: ToolDefinition[];
  defaultTabId?: number;
}): Record<string, unknown> {
  const { input, toolName, tools, defaultTabId } = params;
  const withDefaults = { ...input };
  if (defaultTabId !== undefined && withDefaults.tabId === undefined) {
    withDefaults.tabId = defaultTabId;
  }
  const coerced = coerceToolInputTypes(toolName, withDefaults, tools);
  return isRecord(coerced) ? coerced : withDefaults;
}

export const batchTool: ToolDefinition<BatchToolParams> = {
  name: 'browser_batch',
  description: BROWSER_BATCH_DESCRIPTION,
  parameters: {
    actions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Tool name (e.g. computer, navigate, find, tabs_create). browser_batch cannot be nested.'
          },
          input: {
            type: 'object',
            description: "That tool's input — same shape you'd pass when calling it directly."
          }
        },
        required: ['name', 'input']
      },
      description:
        'List of tool calls to execute sequentially. Example: [{"name":"computer","input":{"action":"left_click","ref":"ref_1","tabId":123}},{"name":"computer","input":{"action":"type","text":"hello","tabId":123}},{"name":"navigate","input":{"url":"https://example.com","tabId":123}}]'
    },
    tabId: {
      type: 'number',
      description:
        'Optional default tab ID applied to child actions that omit input.tabId. Child actions may still target another tab explicitly.'
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
        'Return the last child screenshot image, or none. Default: last. Screenshots are results, not inputs for later actions in the same batch.'
    }
  },
  execute: async (params: BatchToolParams, context: ToolContext): Promise<ToolResult> => {
    if (!params.actions || !Array.isArray(params.actions) || params.actions.length === 0) {
      return buildInvalidBatchResult('actions must be a non-empty array');
    }

    const { tools, map: toolRegistry } = await getToolRegistry(context);
    const childContext: ToolContext = {
      ...context,
      availableTools: tools
    };
    const resultMode = params.resultMode || 'summary';
    const screenshotMode = params.screenshot || 'last';
    const defaultTabId = params.tabId ?? context.tabId;
    const preparedActions: Array<{
      action: BatchAction;
      toolName: string;
      tool: ToolDefinition;
    }> = [];

    for (let i = 0; i < params.actions.length; i++) {
      const action = params.actions[i];
      if (!isRecord(action)) {
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
          batchItems: [],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        });
      }

      const toolName = getBatchActionToolName(action);
      if (!toolName) {
        const errMsg = `actions[${i}].name must be a string`;
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
          batchItems: [],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        });
      }
      if (toolName === 'browser_batch') {
        const errMsg = `actions[${i}]: browser_batch cannot be nested`;
        return buildPartialResult({
          steps: [
            {
              index: i,
              id: action.id,
              tool: toolName,
              ok: false,
              error: errMsg,
              errorCode: 'nested_batch',
              stoppedReason: 'nested_batch'
            }
          ],
          batchItems: [],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'nested_batch',
          resultMode
        });
      }

      const tool = toolRegistry.get(toolName);
      if (!tool) {
        const errMsg = `unknown tool "${toolName}"`;
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
          batchItems: [],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'unknown_tool',
          resultMode
        });
      }

      if (!isRecord(action.input)) {
        const errMsg = `actions[${i}].input must be an object`;
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
          batchItems: [],
          actionCount: params.actions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'invalid_action',
          resultMode
        });
      }

      preparedActions.push({ action, toolName, tool });
    }

    const steps: BatchStepResult[] = [];
    const batchItems: BatchItemResult[] = [];
    let lastImage: { base64Image: string; imageFormat: string } | undefined;
    let lastTabContext: ToolResult['tabContext'] | undefined;
    let canPropagatePermission = true;
    // Tracks the tab the previous step ran on so steps that create/open a new tab
    // (tabs_create, navigate{newTab}, search-submit) propagate that tab id to later
    // actions that omit tabId — callers cannot know a newly created tab id ahead of time.
    let currentDefaultTabId = defaultTabId;

    for (let i = 0; i < preparedActions.length; i++) {
      const { action, toolName, tool } = preparedActions[i];
      const input = normalizeChildInput({
        input: action.input,
        toolName,
        tools,
        defaultTabId: currentDefaultTabId
      });
      const validation = validateToolInput(toolName, input, tools);
      if (!validation.valid) {
        const errMsg = `actions[${i}] invalid input for ${toolName}: ${validation.errors.join('; ')}`;
        steps.push({
          index: i,
          id: action.id,
          tool: toolName,
          ok: false,
          error: errMsg,
          errorCode: 'validation_error',
          stoppedReason: 'validation_error'
        });
        return buildPartialResult({
          steps,
          batchItems,
          actionCount: preparedActions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'validation_error',
          lastImage,
          lastTabContext,
          resultMode
        });
      }
      const waitTooLong = getBatchWaitTooLongError(toolName, input);
      if (waitTooLong) {
        const errMsg = `actions[${i}] ${waitTooLong}`;
        steps.push({
          index: i,
          id: action.id,
          tool: toolName,
          ok: false,
          error: errMsg,
          errorCode: 'validation_error',
          stoppedReason: 'validation_error'
        });
        return buildPartialResult({
          steps,
          batchItems,
          actionCount: preparedActions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'validation_error',
          lastImage,
          lastTabContext,
          resultMode
        });
      }
      const label = getBatchItemLabel(toolName, input);
      let result: ToolResult;

      try {
        await ensureDebuggerAttachedForBatchStep(toolName, input, childContext);
        result = await runChildActionWithTimeout(tool, input, childContext, toolName);
      } catch (err) {
        const childError = err instanceof Error ? err.message : 'Unknown error';
        const errMsg = `actions[${i}] (${label}) failed: ${childError}`;
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
          batchItems,
          actionCount: preparedActions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'exception',
          lastImage,
          lastTabContext,
          resultMode
        });
      }

      if (isPermissionRequired(result)) {
        const domain = typeof result.url === 'string' ? result.url : undefined;
        if (canPropagatePermission && domain) return result;

        const errMsg = `${domain ? `permission_required: ${domain}` : 'permission_required'} - call ${toolName} standalone (not in browser_batch) so the user is prompted`;
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
            ...(domain ? { url: domain } : {})
          }
        });
        return buildPartialResult({
          steps,
          batchItems,
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
        const errMsg = `actions[${i}] (${label}) failed: ${result.error}`;
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
        return buildPartialResult({
          steps,
          batchItems,
          actionCount: preparedActions.length,
          failedIndex: i,
          error: errMsg,
          stoppedReason: 'tool_error',
          lastImage,
          lastTabContext,
          resultMode
        });
      }

      const output = result.output || summarizeStepInput(toolName, input);
      const batchItem: BatchItemResult = {
        label,
        output,
        ...(result.base64Image ? { base64Image: result.base64Image } : {}),
        ...(result.imageFormat ? { imageFormat: result.imageFormat } : {})
      };
      batchItems.push(batchItem);
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
      canPropagatePermission =
        canPropagatePermission && canPropagatePermissionPrompt(toolName, input);

      const stepTabId = resolveStepTabId(input, result, childContext);
      // Only make the default sticky when this step actually opened/switched to a
      // NEW tab (executedOnTabId differs from the tab it targeted). A step that
      // explicitly reads/acts on another tab must not retarget later default steps.
      const targetedTabId = typeof input.tabId === 'number' ? input.tabId : currentDefaultTabId;
      const executedOnTabId = result.tabContext?.executedOnTabId;
      if (typeof executedOnTabId === 'number' && executedOnTabId !== targetedTabId) {
        currentDefaultTabId = executedOnTabId;
      }

      if (i < preparedActions.length - 1 && action.waitAfter !== 'none') {
        if (stepTabId !== undefined) await waitForTabLoading(stepTabId);
        // form_input mutates the field via injected setters; let it settle before a
        // following type/key/submit so the new value is in place first.
        if (toolName === 'form_input') {
          await new Promise((resolve) => setTimeout(resolve, FORM_INPUT_SETTLE_MS));
        }
      }
    }

    return {
      output: buildOutput({
        steps,
        actionCount: preparedActions.length,
        stoppedReason: 'completed',
        resultMode
      }),
      steps,
      batchItems,
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
    description: BROWSER_BATCH_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description:
                  'Tool name (e.g. computer, navigate, find, tabs_create). browser_batch cannot be nested.'
              },
              input: {
                type: 'object',
                description: "That tool's input — same shape you'd pass when calling it directly."
              }
            },
            required: ['name', 'input']
          },
          description:
            'List of tool calls to execute sequentially. Example: [{"name":"computer","input":{"action":"left_click","ref":"ref_1","tabId":123}},{"name":"computer","input":{"action":"type","text":"hello","tabId":123}},{"name":"navigate","input":{"url":"https://example.com","tabId":123}}]'
        },
        tabId: {
          type: 'number',
          description:
            'Optional default tab ID applied to child actions that omit input.tabId. Child actions may still target another tab explicitly.'
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
