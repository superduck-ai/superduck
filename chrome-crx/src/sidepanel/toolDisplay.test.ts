import { describe, expect, it } from 'vitest';
import {
  getBrowserBatchActions,
  getBrowserBatchFailureIndex,
  getToolDisplayInfo
} from './toolDisplay';

describe('browser batch display helpers', () => {
  it('extracts valid browser batch actions', () => {
    expect(
      getBrowserBatchActions({
        actions: [
          { tool: 'read_page', input: { filter: 'interactive' } },
          { name: 'navigate', input: { url: 'https://example.com' } },
          { tool: 'computer', input: { action: 'left_click', ref: 'ref_3' } },
          { tool: 123, input: { action: 'wait' } },
          null
        ]
      })
    ).toEqual([
      { toolName: 'read_page', input: { filter: 'interactive' } },
      { toolName: 'navigate', input: { url: 'https://example.com' } },
      { toolName: 'computer', input: { action: 'left_click', ref: 'ref_3' } }
    ]);
  });

  it('parses failed action indexes from browser batch result text', () => {
    expect(
      getBrowserBatchFailureIndex(
        '[read_page] ok\n\nactions[1] (computer) failed: missing ref (1 completed, 2 remaining)'
      )
    ).toBe(1);
    expect(
      getBrowserBatchFailureIndex(
        JSON.stringify({
          completed: 1,
          failedIndex: 2,
          remaining: 0,
          summary: 'Batch stopped at action 3/3: tool_error'
        })
      )
    ).toBe(2);
    expect(getBrowserBatchFailureIndex('Batch stopped at action 4/10: tool_error')).toBe(3);
  });

  it('ignores invalid browser batch failure indexes', () => {
    expect(getBrowserBatchFailureIndex(JSON.stringify({ failedIndex: -1 }))).toBeNull();
    expect(getBrowserBatchFailureIndex(JSON.stringify({ failedIndex: 1.5 }))).toBeNull();
    expect(getBrowserBatchFailureIndex('Batch stopped at action 0/10: tool_error')).toBeNull();
  });

  it('formats browser batch display names with action counts', () => {
    expect(
      getToolDisplayInfo('browser_batch', {
        actions: [
          { tool: 'read_page', input: {} },
          { tool: 'screenshot', input: {} }
        ]
      }).text
    ).toBe('Run 2 browser actions');
  });

  it('uses the provided formatter for browser batch display names', () => {
    expect(
      getToolDisplayInfo(
        'browser_batch',
        {
          actions: [
            { tool: 'read_page', input: {} },
            { tool: 'computer', input: { action: 'screenshot' } }
          ]
        },
        undefined,
        (_descriptor, values) => `执行 ${values?.count} 个浏览器操作`
      ).text
    ).toBe('执行 2 个浏览器操作');
  });
});
