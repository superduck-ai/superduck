import { describe, it, expect } from 'vitest';
import type { ApiToolResultBlock } from '../../../messageTypes';
import {
  getStringField,
  getBrowserBatchResultText,
  parseBrowserBatchResult,
  isBrowserBatchError,
  getBrowserBatchActionStatus
} from './browserBatchParser';

describe('getStringField', () => {
  it('returns string value when present', () => {
    expect(getStringField({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('returns undefined for missing field', () => {
    expect(getStringField({ foo: 'bar' }, 'baz')).toBeUndefined();
  });

  it('returns undefined when input is undefined', () => {
    expect(getStringField(undefined, 'foo')).toBeUndefined();
  });

  it('returns undefined for non-string field', () => {
    expect(getStringField({ foo: 123 }, 'foo')).toBeUndefined();
  });
});

describe('getBrowserBatchResultText', () => {
  it('returns empty string when toolResult is undefined', () => {
    expect(getBrowserBatchResultText(undefined)).toBe('');
  });

  it('returns string content directly', () => {
    const result = { content: 'plain text' } as unknown as ApiToolResultBlock;
    expect(getBrowserBatchResultText(result)).toBe('plain text');
  });

  it('extracts json text block from array content', () => {
    const result = {
      content: [
        { type: 'text', text: '{"completed":2}' },
        { type: 'text', text: 'other' }
      ]
    } as unknown as ApiToolResultBlock;
    expect(getBrowserBatchResultText(result)).toBe('{"completed":2}');
  });

  it('falls back to joined text when no json block', () => {
    const result = {
      content: [
        { type: 'text', text: 'line1' },
        { type: 'text', text: 'line2' }
      ]
    } as unknown as ApiToolResultBlock;
    expect(getBrowserBatchResultText(result)).toBe('line1\nline2');
  });
});

describe('parseBrowserBatchResult', () => {
  it('returns empty maps for invalid JSON', () => {
    const r = parseBrowserBatchResult('not json');
    expect(r.completedCount).toBeNull();
    expect(r.stepStatuses.size).toBe(0);
    expect(r.stepErrors.size).toBe(0);
  });

  it('parses completed count', () => {
    const r = parseBrowserBatchResult('{"completed":3}');
    expect(r.completedCount).toBe(3);
  });

  it('returns null completedCount for non-number', () => {
    const r = parseBrowserBatchResult('{"completed":"three"}');
    expect(r.completedCount).toBeNull();
  });

  it('parses steps with status, error, errorCode, stoppedReason', () => {
    const r = parseBrowserBatchResult(
      JSON.stringify({
        completed: 1,
        steps: [
          { index: 0, ok: true },
          { index: 1, ok: false, error: 'boom', errorCode: 'E1', stoppedReason: 'crash' }
        ],
        summary: 'partial'
      })
    );
    expect(r.completedCount).toBe(1);
    expect(r.stepStatuses.get(0)).toBe('complete');
    expect(r.stepStatuses.get(1)).toBe('failed');
    expect(r.stepErrors.get(1)).toBe('boom');
    expect(r.stepErrorCodes.get(1)).toBe('E1');
    expect(r.stepStoppedReasons.get(1)).toBe('crash');
    expect(r.summary).toBe('partial');
  });

  it('skips steps without numeric index', () => {
    const r = parseBrowserBatchResult(
      JSON.stringify({ steps: [{ ok: true }, { index: 'x', ok: true }] })
    );
    expect(r.stepStatuses.size).toBe(0);
  });
});

describe('isBrowserBatchError', () => {
  it('returns true when toolResult.is_error', () => {
    expect(isBrowserBatchError({ is_error: true } as ApiToolResultBlock, '', null)).toBe(true);
  });

  it('returns true when failedActionIndex is not null', () => {
    expect(isBrowserBatchError(undefined, '', 2)).toBe(true);
  });

  it('returns true when resultText matches actions array prefix', () => {
    expect(isBrowserBatchError(undefined, 'actions array is empty', null)).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isBrowserBatchError(undefined, 'all good', null)).toBe(false);
  });
});

describe('getBrowserBatchActionStatus', () => {
  const base = {
    failedActionIndex: null,
    completedCount: null,
    stepStatuses: new Map<number, 'complete' | 'failed' | 'pending'>(),
    hasBatchError: false
  };

  it('returns pending when no toolResult', () => {
    expect(getBrowserBatchActionStatus({ ...base, index: 0, toolResult: undefined })).toBe(
      'pending'
    );
  });

  it('returns stepStatus when present', () => {
    const stepStatuses = new Map([[1, 'failed' as const]]);
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 1,
        toolResult: {} as ApiToolResultBlock,
        stepStatuses
      })
    ).toBe('failed');
  });

  it('uses completedCount to derive status', () => {
    const r = { content: '' } as unknown as ApiToolResultBlock;
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 0,
        toolResult: r,
        completedCount: 2
      })
    ).toBe('complete');
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 1,
        toolResult: r,
        completedCount: 1,
        failedActionIndex: 1
      })
    ).toBe('failed');
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 2,
        toolResult: r,
        completedCount: 1
      })
    ).toBe('pending');
  });

  it('uses failedActionIndex when completedCount is null', () => {
    const r = { content: '' } as unknown as ApiToolResultBlock;
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 0,
        toolResult: r,
        failedActionIndex: 1
      })
    ).toBe('complete');
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 1,
        toolResult: r,
        failedActionIndex: 1
      })
    ).toBe('failed');
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 2,
        toolResult: r,
        failedActionIndex: 1
      })
    ).toBe('pending');
  });

  it('returns pending when hasBatchError and no other signal', () => {
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 0,
        toolResult: {} as ApiToolResultBlock,
        hasBatchError: true
      })
    ).toBe('pending');
  });

  it('returns complete when no error signals', () => {
    expect(
      getBrowserBatchActionStatus({
        ...base,
        index: 0,
        toolResult: {} as ApiToolResultBlock
      })
    ).toBe('complete');
  });
});
