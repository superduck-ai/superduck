export const BATCH_ALLOWED_TOOLS = new Set([
  'computer',
  'form_input',
  'read_page',
  'find',
  'get_page_text',
  'read_console_messages',
  'read_network_requests',
  'resize_window'
]);

export const READ_ONLY_TOOLS = new Set([
  'read_page',
  'find',
  'get_page_text',
  'read_console_messages',
  'read_network_requests'
]);

export const DEBUGGER_REQUIRED_TOOLS = new Set(['computer', 'resize_window']);
export const PAGE_OBSERVATION_TOOLS = new Set(['read_page', 'find', 'get_page_text']);
export const MUTATING_COMPUTER_ACTIONS = new Set([
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

export const MAX_BATCH_ACTIONS = 20;
export const MIN_BATCH_ACTIONS = 2;
export const CHILD_ACTION_TIMEOUT_MS = 15000;
export const FORM_INPUT_SETTLE_MS = 100;
export const SUMMARY_STEP_OUTPUT_MAX_CHARS = 160;
export const REF_ID_PATTERN = /^ref_\d+$/;
export const BROWSER_BATCH_RETRY_GUIDANCE =
  'Do not retry this same browser_batch unchanged. First observe the current page with read_page/find, refresh refs, or run only the failed action separately before starting a new deterministic batch.';
export const BROWSER_BATCH_DESCRIPTION =
  'Execute 2-20 browser tool calls in one round trip. After read_page/find has returned fresh refs, browser_batch is the preferred tool for a short run of deterministic browser actions that do not require inspecting intermediate results. Think in two phases: discover, then act. For new pages, system pages, about:blank, or unknown state, call navigate/read_page/find separately first; once refs are fresh, batch the next safe action sequence. Batch the safe prefix: if the first 2+ actions are predictable but the whole workflow is not, batch those actions and stop before uncertainty. High-value patterns: form_input(ref, value) -> computer.key(Enter); computer.left_click(ref) -> computer.type(text) -> computer.key(Enter); multi-field form_input fills followed by a known submit click/key; click(ref) -> screenshot/read_page when that observation is only final confirmation; scroll/scroll_to -> screenshot/read_page. For search boxes, command palettes, chat inputs, and native form fields, prefer form_input(ref, text) -> computer.key(Enter) when a fresh input ref exists; use left_click/type/key for custom controls. Keep Enter/Return as the last action in the batch. Do not use browser_batch for single actions, navigation, observation-first discovery, read_page/find -> click/type/form_input, Enter/Return -> anything else, nested batches, or actions whose input depends on a result produced earlier in the same batch. If a batch fails, observe or run the failed action separately before batching the next deterministic actions.';
