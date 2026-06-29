import type { ClickOptions, PermissionManagerLike } from '../types';
import { executeScreenshot } from './screenshotActions';

export async function animateCursorOnTab(
  tabId: number,
  x: number,
  y: number,
  action: string,
  skipIndicator?: boolean
): Promise<void> {
  if (skipIndicator) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ANIMATE_CURSOR_TO', x, y, action });
  } catch {
    // Content script may not be loaded
  }
}

export async function getScrollPosition(tabId: number): Promise<{ x: number; y: number }> {
  const scriptResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    })
  });
  if (!scriptResults || !scriptResults[0]?.result) {
    throw new Error('Failed to get scroll position');
  }
  return scriptResults[0].result;
}

export async function getElementCheckedState(tabId: number, ref: string): Promise<boolean | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (elementRef: string) => {
        const el = window.__superduckElementMap?.[elementRef]?.deref();
        if (!el) return null;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))
          return el.checked;
        const ariaChecked = el.getAttribute('aria-checked');
        if (ariaChecked !== null) return ariaChecked === 'true';
        const label = el.closest('label') as HTMLLabelElement | null;
        if (label?.control && label.control instanceof HTMLInputElement)
          return label.control.checked;
        const nested = el.querySelector(
          'input[type="checkbox"], input[type="radio"]'
        ) as HTMLInputElement | null;
        if (nested) return nested.checked;
        return null;
      },
      args: [ref]
    });
    for (const sr of results) {
      if (sr.result !== undefined && sr.result !== null) return sr.result as boolean;
    }
    return null;
  } catch {
    return null;
  }
}

export async function jsClickFallback(tabId: number, ref: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (elementRef: string) => {
        const el = window.__superduckElementMap?.[elementRef]?.deref();
        if (!el) return;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          el.click();
          return;
        }
        const label = el.closest('label') as HTMLLabelElement | null;
        if (label?.control) {
          (label.control as HTMLElement).click();
          return;
        }
        const nested = el.querySelector(
          'input[type="checkbox"], input[type="radio"]'
        ) as HTMLElement | null;
        if (nested) {
          nested.click();
          return;
        }
        (el as HTMLElement).click();
      },
      args: [ref]
    });
  } catch {
    // 降级失败不影响流程
  }
}

export async function tryTakePostScrollScreenshot(
  tabId: number,
  permissionManager: PermissionManagerLike,
  options?: ClickOptions
): Promise<{ base64Image: string; imageFormat: string } | undefined> {
  try {
    const tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo?.url) return undefined;

    const permResult = await permissionManager.checkPermission(tabInfo.url, undefined);
    if (!permResult.allowed) return undefined;

    try {
      const screenshot = await executeScreenshot(tabId, options);
      return { base64Image: screenshot.base64Image!, imageFormat: screenshot.imageFormat || 'png' };
    } catch (_err) {
      return undefined;
    }
  } catch (_err) {
    return undefined;
  }
}
