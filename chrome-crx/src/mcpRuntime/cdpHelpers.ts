import { calculateOptimalDimensions } from './shared';
import { verifyDomainUnchanged } from './tabState';

export async function checkDomainSecurity(
  tabId: number,
  url: string | undefined,
  actionName: string
): Promise<{ error: string } | null> {
  if (!url) return null;
  return verifyDomainUnchanged(tabId, url, actionName);
}

export function calculateTargetDimensions(
  width: number,
  height: number,
  params: { pxPerToken: number; maxTargetPx: number; maxTargetTokens: number }
): [number, number] {
  return calculateOptimalDimensions(width, height, params);
}

export function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function screenshotToViewportCoords(
  screenshotX: number,
  screenshotY: number,
  context: {
    viewportWidth: number;
    viewportHeight: number;
    screenshotWidth: number;
    screenshotHeight: number;
  }
): [number, number] {
  const scaleX = context.viewportWidth / context.screenshotWidth;
  const scaleY = context.viewportHeight / context.screenshotHeight;
  return [Math.round(screenshotX * scaleX), Math.round(screenshotY * scaleY)];
}

export async function scrollViaContentScript(
  tabId: number,
  pointX: number,
  pointY: number,
  deltaX: number,
  deltaY: number
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollDeltaX: number, scrollDeltaY: number, x: number, y: number) => {
      const elementAtPoint = document.elementFromPoint(x, y);
      if (
        elementAtPoint &&
        elementAtPoint !== document.body &&
        elementAtPoint !== document.documentElement
      ) {
        const isScrollable = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          const overflowX = style.overflowX;
          return (
            (overflowY === 'auto' ||
              overflowY === 'scroll' ||
              overflowX === 'auto' ||
              overflowX === 'scroll') &&
            (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
          );
        };

        let current: Element | null = elementAtPoint;
        while (current && !isScrollable(current)) {
          current = current.parentElement;
        }

        if (current && isScrollable(current)) {
          return void current.scrollBy({
            left: scrollDeltaX,
            top: scrollDeltaY,
            behavior: 'instant'
          });
        }
      }
      window.scrollBy({ left: scrollDeltaX, top: scrollDeltaY, behavior: 'instant' });
    },
    args: [deltaX, deltaY, pointX, pointY]
  });
}
