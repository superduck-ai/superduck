import { verifyDomainUnchanged } from '../tabState';

export async function checkDomainSecurity(
  tabId: number,
  url: string | undefined,
  actionName: string
): Promise<{ error: string } | null> {
  if (!url) return null;
  return verifyDomainUnchanged(tabId, url, actionName);
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

/**
 * Map a screenshot-space (x, y) to CSS viewport pixels when the caller is
 * working in screenshot coordinates. Returns the input unchanged when there is
 * no screenshot context or the caller already specified viewport coordinates
 * (coordinate_space === 'viewport'). Centralizes the conditional that every
 * click/hover/scroll/drag/zoom action otherwise duplicates verbatim.
 */
export function mapCoordinateToViewport(
  x: number,
  y: number,
  context:
    | {
        viewportWidth: number;
        viewportHeight: number;
        screenshotWidth: number;
        screenshotHeight: number;
      }
    | null
    | undefined,
  coordinateSpace?: 'screenshot' | 'viewport'
): [number, number] {
  return context && coordinateSpace !== 'viewport'
    ? screenshotToViewportCoords(x, y, context)
    : [x, y];
}

export function extractDomain(url?: string): string {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
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
