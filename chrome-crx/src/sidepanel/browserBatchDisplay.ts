export interface BrowserBatchIntl {
  formatMessage(
    descriptor: { id: string; defaultMessage: string },
    values?: Record<string, unknown>
  ): string;
}

export function inferBrowserBatchErrorCode(error: string): string | undefined {
  if (/cannot be nested/i.test(error)) return 'nested_batch';
  if (/invalid input/i.test(error)) return 'validation_error';
  if (/No element found with reference/i.test(error)) return 'stale_ref';
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
    case 'permission_required':
      return intl.formatMessage({
        id: 'browser_batch_error_permission_required',
        defaultMessage:
          'This browser action needs your approval. After approval, SuperDuck can continue the remaining steps.'
      });
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
