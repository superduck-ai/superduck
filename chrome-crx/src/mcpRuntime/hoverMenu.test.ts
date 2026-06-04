import { describe, it, expect } from 'vitest';
import {
  buildMousePath,
  formatHitTestMismatchError,
  hoverSettleMs,
  DEFAULT_HOVER_PATH_STEPS
} from './hoverMenu';

describe('buildMousePath', () => {
  it('returns a single step when steps is 1', () => {
    const path = buildMousePath(0, 0, 100, 50, 1);
    expect(path).toEqual([[100, 50]]);
  });

  it('interpolates from start to end', () => {
    const path = buildMousePath(0, 0, 100, 0, 4);
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual([25, 0]);
    expect(path[3]).toEqual([100, 0]);
  });

  it('defaults to DEFAULT_HOVER_PATH_STEPS points', () => {
    expect(buildMousePath(0, 0, 10, 10)).toHaveLength(DEFAULT_HOVER_PATH_STEPS);
  });
});

describe('hoverSettleMs', () => {
  it('uses default when duration omitted', () => {
    expect(hoverSettleMs()).toBe(250);
  });

  it('converts duration seconds to ms capped at 2000', () => {
    expect(hoverSettleMs(0.5)).toBe(500);
    expect(hoverSettleMs(5)).toBe(2000);
  });
});

describe('formatHitTestMismatchError', () => {
  it('includes ref, ids, and remediation hints', () => {
    const msg = formatHitTestMismatchError({
      ref: 'ref_3',
      expectedBackendNodeId: 10,
      actualBackendNodeId: 99,
      x: 120.4,
      y: 80.6
    });
    expect(msg).toContain('ref_3');
    expect(msg).toContain('backendNodeId=10');
    expect(msg).toContain('backendNodeId=99');
    expect(msg).toContain('hover_click');
    expect(msg).toContain('(120, 81)');
  });
});
