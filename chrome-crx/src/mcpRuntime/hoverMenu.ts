/**
 * Helpers for hover-triggered menus (dropdowns, filter panels, tooltips).
 */

export const DEFAULT_HOVER_SETTLE_MS = 250;
export const DEFAULT_HOVER_PATH_STEPS = 8;
export const HOVER_PATH_STEP_DELAY_MS = 20;

export function buildMousePath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps: number = DEFAULT_HOVER_PATH_STEPS
): Array<[number, number]> {
  const n = Math.max(1, Math.floor(steps));
  const path: Array<[number, number]> = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    path.push([fromX + (toX - fromX) * t, fromY + (toY - fromY) * t]);
  }
  return path;
}

export function hoverSettleMs(durationSeconds?: number): number {
  if (durationSeconds === undefined || durationSeconds <= 0) {
    return DEFAULT_HOVER_SETTLE_MS;
  }
  return Math.min(Math.round(durationSeconds * 1000), 2000);
}

export function formatHitTestMismatchError(opts: {
  ref: string;
  expectedBackendNodeId: number;
  actualBackendNodeId: number | undefined;
  x: number;
  y: number;
}): string {
  const actual = opts.actualBackendNodeId === undefined ? 'none' : String(opts.actualBackendNodeId);
  return (
    `Click target verification failed for ${opts.ref}: expected backendNodeId=${opts.expectedBackendNodeId} ` +
    `but hit-test at (${Math.round(opts.x)}, ${Math.round(opts.y)}) resolved to backendNodeId=${actual}. ` +
    'The element may be covered, off-screen, or a hover menu may have closed. ' +
    'Try: (1) computer hover_click with hover_ref on the menu trigger and ref on the item; ' +
    '(2) computer hover on the trigger, read_page for fresh refs, then click the menu item ref.'
  );
}
