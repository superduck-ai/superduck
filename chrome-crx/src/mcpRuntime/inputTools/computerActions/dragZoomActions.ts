import { screenshotContextManager } from '../../cdp';
import { tabGroupManager } from '../../tabState';
import { cdpDebugger, checkDomainSecurity, mapCoordinateToViewport } from '../../cdp';
import type { CdpCaptureScreenshotResult } from '../../cdp';
import type { ToolResult } from '../../pageTools';
import { type ComputerToolParams, type ClickOptions } from '../types';
import { animateCursorOnTab } from './helpers';

export async function executeDrag(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string,
  options?: ClickOptions
): Promise<ToolResult> {
  if (!params.start_coordinate || params.start_coordinate.length !== 2) {
    throw new Error('start_coordinate parameter is required for left_click_drag action');
  }
  if (!params.coordinate || params.coordinate.length !== 2) {
    throw new Error('coordinate parameter (end position) is required for left_click_drag action');
  }

  let [startX, startY] = params.start_coordinate;
  let [endX, endY] = params.coordinate;

  const context = screenshotContextManager.getContext(tabId);
  [startX, startY] = mapCoordinateToViewport(startX, startY, context, params.coordinate_space);
  [endX, endY] = mapCoordinateToViewport(endX, endY, context, params.coordinate_space);

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'drag action');
    if (securityCheck) return securityCheck;

    await animateCursorOnTab(tabId, startX, startY, 'drag_start', options?.skipIndicator);
    await tabGroupManager.hideIndicatorForToolUse(tabId);
    await cdpDebugger.hidePointerBlockingOverlaysForToolUse(tabId);
    try {
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x: startX,
        y: startY,
        button: 'none',
        buttons: 0,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 1,
        modifiers: 0
      });
      await cdpDebugger.dispatchMouseEvent(tabId, {
        type: 'mouseReleased',
        x: endX,
        y: endY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        modifiers: 0
      });
    } finally {
      await cdpDebugger.restorePointerBlockingOverlaysAfterToolUse(tabId);
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }

    return { output: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})` };
  } catch (error) {
    return {
      error: `Error performing drag: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function executeZoom(tabId: number, params: ComputerToolParams): Promise<ToolResult> {
  if (!params.region || params.region.length !== 4) {
    throw new Error('Region parameter is required for zoom action and must be [x0, y0, x1, y1]');
  }

  let [x0, y0, x1, y1] = params.region;
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) {
    throw new Error(
      'Invalid region coordinates: x0 and y0 must be non-negative, and x1 > x0, y1 > y0'
    );
  }

  try {
    const context = screenshotContextManager.getContext(tabId);
    [x0, y0] = mapCoordinateToViewport(x0, y0, context, params.coordinate_space);
    [x1, y1] = mapCoordinateToViewport(x1, y1, context, params.coordinate_space);

    const viewportResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio
      })
    });

    if (!viewportResult || !viewportResult[0]?.result) {
      throw new Error('Failed to get viewport dimensions');
    }

    const {
      width: vpWidth,
      height: vpHeight,
      scrollX,
      scrollY,
      devicePixelRatio: dpr
    } = viewportResult[0].result;
    if (x1 > vpWidth || y1 > vpHeight) {
      throw new Error(
        `Region exceeds viewport boundaries (${vpWidth}x${vpHeight}). Please choose a region within the visible viewport.`
      );
    }

    const regionWidth = x1 - x0;
    const regionHeight = y1 - y0;
    const scaleFactor = dpr || 1;

    await tabGroupManager.hideIndicatorForToolUse(tabId);

    try {
      const captureResult = await cdpDebugger.sendCommand<CdpCaptureScreenshotResult>(
        tabId,
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
          clip: {
            x: scrollX + x0,
            y: scrollY + y0,
            width: regionWidth,
            height: regionHeight,
            scale: 1 / scaleFactor
          }
        }
      );

      if (!captureResult || !captureResult.data) {
        throw new Error('Failed to capture zoomed screenshot via CDP');
      }

      return {
        output: `Successfully captured zoomed screenshot of region (${x0},${y0}) to (${x1},${y1}) - ${regionWidth}x${regionHeight} pixels`,
        base64Image: captureResult.data,
        imageFormat: 'png'
      };
    } finally {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }
  } catch (error) {
    return {
      error: `Error capturing zoomed screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
