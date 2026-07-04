import { describe, expect, it } from 'vitest';
import { isReadOnlyBrowserBatchArgs } from './access';

describe('browser_batch tab access classification', () => {
  it('classifies observation-only actions as read-only', () => {
    expect(
      isReadOnlyBrowserBatchArgs({
        actions: [
          { tool: 'read_page', input: { max_chars: 1000 } },
          { tool: 'computer', input: { action: 'screenshot' } },
          { tool: 'computer', input: { action: 'wait', duration: 0.2 } }
        ]
      })
    ).toBe(true);
  });

  it('supports the name alias used by batch action parsing', () => {
    expect(
      isReadOnlyBrowserBatchArgs({
        actions: [
          { name: 'find', input: { query: 'Submit' } },
          { name: 'get_page_text', input: { max_chars: 500 } }
        ]
      })
    ).toBe(true);
  });

  it('treats interaction actions as write access', () => {
    expect(
      isReadOnlyBrowserBatchArgs({
        actions: [
          { tool: 'read_page', input: {} },
          { tool: 'computer', input: { action: 'left_click', ref: 'ref_1' } }
        ]
      })
    ).toBe(false);
  });

  it('treats malformed or invalid batches as write access', () => {
    expect(isReadOnlyBrowserBatchArgs({ actions: [] })).toBe(false);
    expect(isReadOnlyBrowserBatchArgs({ actions: [{ tool: 'read_page', input: {} }] })).toBe(false);
    expect(isReadOnlyBrowserBatchArgs({ actions: [{ tool: 'read_page' }, null] })).toBe(false);
    expect(isReadOnlyBrowserBatchArgs({ actions: 'read_page' })).toBe(false);
  });
});
