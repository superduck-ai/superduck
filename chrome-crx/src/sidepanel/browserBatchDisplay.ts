export interface BrowserBatchIntl {
  formatMessage(
    descriptor: { id: string; defaultMessage: string },
    values?: Record<string, unknown>
  ): string;
}

export function inferBrowserBatchErrorCode(error: string): string | undefined {
  if (/actions after navigate/i.test(error)) return 'unsafe_after_navigate';
  if (/cannot be consumed by later actions/i.test(error)) return 'unsafe_observation_then_mutation';
  if (/requires concrete refs/i.test(error)) return 'invalid_placeholder_ref';
  if (/form_input uses "ref", not "ref_id"/i.test(error)) return 'invalid_form_ref_id';
  if (/too long for browser_batch child timeout/i.test(error)) return 'wait_too_long';
  if (/needs permission/i.test(error)) return 'permission_required';
  if (/one tab only/i.test(error)) return 'cross_tab';
  if (/cannot be nested/i.test(error)) return 'nested_batch';
  if (/not allowed in browser_batch/i.test(error)) return 'disallowed_tool';
  if (/invalid input/i.test(error)) return 'validation_error';
  if (/No element found with reference/i.test(error)) return 'stale_ref';
  if (/tab \d+ is no longer available/i.test(error)) return 'tab_unavailable';
  if (/cannot run on .* pages/i.test(error)) return 'system_page';
  return undefined;
}

export function getLocalizedBrowserBatchError(
  error: string,
  errorCode: string | undefined,
  stoppedReason: string | undefined,
  intl: BrowserBatchIntl
): string {
  const code = errorCode || stoppedReason || inferBrowserBatchErrorCode(error);
  switch (code) {
    case 'unsafe_after_navigate':
      return intl.formatMessage({
        id: 'browser_batch_error_unsafe_after_navigate',
        defaultMessage:
          'The page changed after navigation, so the sequence stopped. SuperDuck needs to read the new page before continuing.'
      });
    case 'unsafe_observation_then_mutation':
      return intl.formatMessage({
        id: 'browser_batch_error_unsafe_observation_then_mutation',
        defaultMessage:
          'Page reading or element search results cannot be used for clicks or typing in the same sequence. SuperDuck will use the new element refs in the next step.'
      });
    case 'unsafe_observation_first':
      return intl.formatMessage({
        id: 'browser_batch_error_unsafe_observation_first',
        defaultMessage:
          'This sequence starts by reading the page. SuperDuck needs to run page reading separately, then use the returned refs in a new action sequence.'
      });
    case 'unsafe_after_submit':
      return intl.formatMessage({
        id: 'browser_batch_error_unsafe_after_submit',
        defaultMessage:
          'Enter or Return may submit the page or change its state. SuperDuck will stop there, read the page again, then continue.'
      });
    case 'invalid_placeholder_ref':
      return intl.formatMessage({
        id: 'browser_batch_error_invalid_placeholder_ref',
        defaultMessage:
          'This step does not have a usable page element reference yet. SuperDuck needs to read the page first.'
      });
    case 'invalid_form_ref_id':
      return intl.formatMessage({
        id: 'browser_batch_error_invalid_form_ref_id',
        defaultMessage:
          'Form filling needs an element reference returned by the page. SuperDuck will read the page again before filling it.'
      });
    case 'invalid_batch':
    case 'invalid_action':
    case 'missing_tool':
    case 'unknown_tool':
    case 'invalid_action_input':
    case 'invalid_batch_input':
    case 'validation_error':
      return intl.formatMessage({
        id: 'browser_batch_error_invalid_sequence',
        defaultMessage:
          'This browser action sequence has incomplete or invalid action parameters. SuperDuck will check the page and try the next safe step.'
      });
    case 'wait_too_long':
      return intl.formatMessage({
        id: 'browser_batch_error_wait_too_long',
        defaultMessage:
          'The wait is too long for one browser action sequence. SuperDuck will run the wait separately.'
      });
    case 'permission_required':
      return intl.formatMessage({
        id: 'browser_batch_error_permission_required',
        defaultMessage:
          'This browser action needs your approval. After approval, SuperDuck can continue the remaining steps.'
      });
    case 'cross_tab':
      return intl.formatMessage({
        id: 'browser_batch_error_cross_tab',
        defaultMessage:
          'One browser action sequence can only run in a single tab. SuperDuck will split this into separate steps.'
      });
    case 'disallowed_tool':
    case 'nested_batch':
      return intl.formatMessage({
        id: 'browser_batch_error_disallowed_tool',
        defaultMessage:
          'This action cannot run inside a browser action sequence. SuperDuck will run it as a separate step.'
      });
    case 'stale_ref':
      return intl.formatMessage({
        id: 'browser_batch_error_stale_ref',
        defaultMessage:
          'The page element changed or disappeared. SuperDuck needs to read the current page again and use a fresh element reference.'
      });
    case 'system_page':
      return intl.formatMessage({
        id: 'browser_batch_error_system_page',
        defaultMessage:
          'This page needs a separate navigation step first. SuperDuck will open the webpage, then read it before using an action sequence.'
      });
    case 'tab_unavailable':
      return intl.formatMessage({
        id: 'browser_batch_error_tab_unavailable',
        defaultMessage:
          'The browser tab changed or closed before the action sequence started. SuperDuck needs to check the current page before continuing.'
      });
    case 'tool_error':
    case 'exception':
      return intl.formatMessage({
        id: 'browser_batch_error_tool_error',
        defaultMessage:
          'The page action did not succeed. SuperDuck will check the current page before continuing.'
      });
    default:
      return intl.formatMessage({
        id: 'browser_batch_error_generic',
        defaultMessage:
          'The browser action sequence stopped. SuperDuck will check the current page before continuing.'
      });
  }
}
