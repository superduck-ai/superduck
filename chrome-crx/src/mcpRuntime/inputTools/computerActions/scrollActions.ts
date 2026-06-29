import { screenshotContextManager } from '../../cdp';
import { tabGroupManager } from '../../tabState';
import { cdpDebugger, screenshotToViewportCoords, scrollViaContentScript } from '../../cdp';
import type { ToolResult } from '../../pageTools';
import { type ComputerToolParams, type ClickOptions, type PermissionManagerLike } from '../types';
import { scrollToElementByRef } from '../frameUtils';
import { checkDomainSecurity } from '../../cdp';
import { animateCursorOnTab, getScrollPosition, tryTakePostScrollScreenshot } from './helpers';

export async function executeScroll(
  tabId: number,
  params: ComputerToolParams,
  permissionManager: PermissionManagerLike,
  options?: ClickOptions
): Promise<ToolResult> {
  if (!params.coordinate || params.coordinate.length !== 2) {
    throw new Error('Coordinate parameter is required for scroll action');
  }

  let [x, y] = params.coordinate;
  const context = screenshotContextManager.getContext(tabId);
  if (context) {
    const [mappedX, mappedY] = screenshotToViewportCoords(x, y, context);
    console.info(
      `[Scroll] screenshot coords=(${x}, ${y}) → viewport coords=(${mappedX}, ${mappedY}) ` +
        `scale=${(context.viewportWidth / context.screenshotWidth).toFixed(4)}`
    );
    x = mappedX;
    y = mappedY;
  }

  const direction = params.scroll_direction || 'down';
  const amount = params.scroll_amount || 3;

  const manageIndicator = !options?.skipIndicator;
  await animateCursorOnTab(tabId, x, y, 'scroll', options?.skipIndicator);
  if (manageIndicator) {
    await tabGroupManager.hideIndicatorForToolUse(tabId);
  }

  try {
    let deltaX = 0;
    let deltaY = 0;
    const pixelsPerTick = 100;

    switch (direction) {
      case 'up':
        deltaY = -amount * pixelsPerTick;
        break;
      case 'down':
        deltaY = amount * pixelsPerTick;
        break;
      case 'left':
        deltaX = -amount * pixelsPerTick;
        break;
      case 'right':
        deltaX = amount * pixelsPerTick;
        break;
      default:
        throw new Error(`Invalid scroll direction: ${direction}`);
    }

    if (options?.skipIndicator) {
      await cdpDebugger.scrollWheel(tabId, x, y, deltaX, deltaY);
    } else {
      const scrollBefore = await getScrollPosition(tabId);
      const tabInfo = await chrome.tabs.get(tabId);

      if (tabInfo.active ?? false) {
        try {
          const scrollPromise = cdpDebugger.scrollWheel(tabId, x, y, deltaX, deltaY);
          const timeoutPromise = new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error('Scroll timeout')), 5000);
          });
          await Promise.race([scrollPromise, timeoutPromise]);
          await new Promise<void>((resolve) => setTimeout(resolve, 200));

          const scrollAfter = await getScrollPosition(tabId);
          if (
            !(
              Math.abs(scrollAfter.x - scrollBefore.x) > 5 ||
              Math.abs(scrollAfter.y - scrollBefore.y) > 5
            )
          ) {
            throw new Error('CDP scroll ineffective');
          }
        } catch (_err) {
          await scrollViaContentScript(tabId, x, y, deltaX, deltaY);
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
        }
      } else {
        await scrollViaContentScript(tabId, x, y, deltaX, deltaY);
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }
    }

    if (!options?.skipIndicator) {
      const postScrollScreenshot = await tryTakePostScrollScreenshot(
        tabId,
        permissionManager,
        options
      );
      return {
        output: `Scrolled ${direction} by ${amount} ticks at (${x}, ${y})`,
        ...(postScrollScreenshot && {
          base64Image: postScrollScreenshot.base64Image,
          imageFormat: postScrollScreenshot.imageFormat
        })
      };
    }

    return { output: `Scrolled ${direction} by ${amount} ticks at (${x}, ${y})` };
  } catch (error) {
    return {
      error: `Error scrolling: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  } finally {
    if (manageIndicator) {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }
  }
}

export async function executeScrollTo(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.ref) throw new Error('ref parameter is required for scroll_to action');

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'scroll_to action');
    if (securityCheck) return securityCheck;

    const result = await scrollToElementByRef(tabId, params.ref);
    if (result.success) {
      return { output: `Scrolled to element with reference: ${params.ref}` };
    }
    return { error: result.error };
  } catch (error) {
    return {
      error: `Failed to scroll to element: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
