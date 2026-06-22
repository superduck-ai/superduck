import { describe, expect, it } from 'vitest';

import enUS from '../../i18n/en-US.json';
import zhCN from '../../i18n/zh-CN.json';
import { getLocalizedBrowserBatchError } from './browserBatchDisplay';

const BROWSER_BATCH_I18N_KEYS = [
  'run_browser_batch',
  'run_browser_action_count',
  'running_browser_action_count',
  'ran_browser_action_count',
  'browser_batch_stopped_at_step',
  'browser_batch_stopped_at_step_of_count',
  'browser_batch_failed',
  'browser_batch_screenshot',
  'browser_batch_screenshot_label',
  'browser_batch_final_screenshot_after_actions',
  'browser_batch_stopped_screenshot',
  'browser_batch_stopped_screenshot_after_actions',
  'open_browser_batch_screenshot',
  'browser_batch_error_invalid_sequence',
  'browser_batch_error_permission_required',
  'browser_batch_error_disallowed_tool',
  'browser_batch_error_stale_ref',
  'browser_batch_error_system_page',
  'browser_batch_error_tool_error',
  'browser_batch_error_generic',
  'failed'
] as const;

const LOCALES = {
  'en-US': enUS,
  'zh-CN': zhCN
} as const;

describe('browser batch i18n keys', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`contains all browser batch keys in ${locale}`, () => {
      for (const key of BROWSER_BATCH_I18N_KEYS) {
        expect(messages[key]).toBeTruthy();
      }
    });
  }
});

function createIntl(messages: Record<string, string>) {
  return {
    formatMessage: ({ id, defaultMessage }: { id: string; defaultMessage?: string }) =>
      messages[id] ?? defaultMessage ?? id
  } as Parameters<typeof getLocalizedBrowserBatchError>[3];
}

describe('browser batch localized error text', () => {
  const zhIntl = createIntl(zhCN);

  it.each([
    'invalid_batch',
    'invalid_action',
    'missing_tool',
    'unknown_tool',
    'invalid_action_input',
    'invalid_batch_input',
    'validation_error'
  ])('localizes %s without showing raw internal English', (errorCode) => {
    const text = getLocalizedBrowserBatchError(
      'actions[1] invalid input for computer: missing action',
      errorCode,
      undefined,
      zhIntl
    );

    expect(text).toBe(zhCN.browser_batch_error_invalid_sequence);
    expect(text).not.toMatch(/actions\[|invalid input|browser_batch|Batch stopped/i);
  });

  it('uses a localized generic message for unknown raw errors', () => {
    const text = getLocalizedBrowserBatchError(
      'Tool execution failed: Browser batch failed with unexpected internal error',
      undefined,
      undefined,
      zhIntl
    );

    expect(text).toBe(zhCN.browser_batch_error_generic);
    expect(text).not.toMatch(/Tool execution failed|Browser batch|internal error/i);
  });

  it('prefers structured stoppedReason over raw error inference', () => {
    const text = getLocalizedBrowserBatchError(
      'No element found with reference: ref_1',
      undefined,
      'system_page',
      zhIntl
    );

    expect(text).toBe(zhCN.browser_batch_error_system_page);
  });
});
