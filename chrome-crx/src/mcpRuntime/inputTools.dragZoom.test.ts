import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => {
  const dispatchMouseEvent = vi.fn();
  const hidePointerBlockingOverlaysForToolUse = vi.fn();
  const restorePointerBlockingOverlaysAfterToolUse = vi.fn();
  const hideIndicatorForToolUse = vi.fn();
  const restoreIndicatorAfterToolUse = vi.fn();
  const animateCursorOnTab = vi.fn();
  const checkDomainSecurity = vi.fn();
  const getContext = vi.fn();
  const mapCoordinateToViewport = vi.fn();

  return {
    dispatchMouseEvent,
    hidePointerBlockingOverlaysForToolUse,
    restorePointerBlockingOverlaysAfterToolUse,
    hideIndicatorForToolUse,
    restoreIndicatorAfterToolUse,
    animateCursorOnTab,
    checkDomainSecurity,
    getContext,
    mapCoordinateToViewport
  };
});

vi.mock('./cdp', () => ({
  cdpDebugger: {
    dispatchMouseEvent: fixtures.dispatchMouseEvent,
    hidePointerBlockingOverlaysForToolUse: fixtures.hidePointerBlockingOverlaysForToolUse,
    restorePointerBlockingOverlaysAfterToolUse: fixtures.restorePointerBlockingOverlaysAfterToolUse
  },
  checkDomainSecurity: fixtures.checkDomainSecurity,
  screenshotContextManager: {
    getContext: fixtures.getContext
  },
  mapCoordinateToViewport: fixtures.mapCoordinateToViewport
}));

vi.mock('./tabState', () => ({
  tabGroupManager: {
    hideIndicatorForToolUse: fixtures.hideIndicatorForToolUse,
    restoreIndicatorAfterToolUse: fixtures.restoreIndicatorAfterToolUse
  }
}));

vi.mock('./inputTools/computerActions/helpers', () => ({
  animateCursorOnTab: fixtures.animateCursorOnTab
}));

const { executeDrag } = await import('./inputTools/computerActions/dragZoomActions');

describe('executeDrag', () => {
  beforeEach(() => {
    for (const fn of Object.values(fixtures)) fn.mockReset();

    fixtures.dispatchMouseEvent.mockResolvedValue(undefined);
    fixtures.hidePointerBlockingOverlaysForToolUse.mockResolvedValue(undefined);
    fixtures.restorePointerBlockingOverlaysAfterToolUse.mockResolvedValue(undefined);
    fixtures.hideIndicatorForToolUse.mockResolvedValue(undefined);
    fixtures.restoreIndicatorAfterToolUse.mockResolvedValue(undefined);
    fixtures.animateCursorOnTab.mockResolvedValue(undefined);
    fixtures.checkDomainSecurity.mockResolvedValue(null);
    fixtures.getContext.mockReturnValue(null);
    fixtures.mapCoordinateToViewport.mockImplementation((x: number, y: number) => [x, y]);
  });

  it('does not hide or restore indicators when skipIndicator is set', async () => {
    const result = await executeDrag(
      10,
      {
        action: 'left_click_drag',
        start_coordinate: [1, 2],
        coordinate: [3, 4]
      },
      'https://example.com/',
      { skipIndicator: true }
    );

    expect(result.error).toBeUndefined();
    expect(fixtures.animateCursorOnTab).toHaveBeenCalledWith(10, 1, 2, 'drag_start', true);
    expect(fixtures.dispatchMouseEvent).toHaveBeenCalledTimes(4);
    expect(fixtures.hideIndicatorForToolUse).not.toHaveBeenCalled();
    expect(fixtures.hidePointerBlockingOverlaysForToolUse).not.toHaveBeenCalled();
    expect(fixtures.restorePointerBlockingOverlaysAfterToolUse).not.toHaveBeenCalled();
    expect(fixtures.restoreIndicatorAfterToolUse).not.toHaveBeenCalled();
  });
});
