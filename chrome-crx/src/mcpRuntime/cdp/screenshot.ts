import { processScreenshotInContentScript } from './contentScriptScreenshot';
import { screenshotContextManager } from './screenshotContext';
import { tabGroupManager } from '../tabState';
import type {
  CdpCaptureScreenshotResult,
  ResizeParams,
  ScreenshotOptions,
  ScreenshotResult,
  SendCommand
} from './types';

export const DEFAULT_RESIZE_PARAMS: ResizeParams = {
  pxPerToken: 28,
  maxTargetPx: 1568,
  maxTargetTokens: 1568
};

export const MAX_BASE64_CHARS = 1398100;
export const INITIAL_JPEG_QUALITY = 0.75;
export const JPEG_QUALITY_STEP = 0.05;
export const MIN_JPEG_QUALITY = 0.1;

export async function screenshot(
  sendCommand: SendCommand,
  tabId: number,
  resizeParams?: ResizeParams,
  options?: ScreenshotOptions
): Promise<ScreenshotResult> {
  const resize = resizeParams ?? DEFAULT_RESIZE_PARAMS;

  if (!options?.skipIndicator) {
    await tabGroupManager.hideIndicatorForToolUse(tabId);
  }

  try {
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      })
    });

    if (!scriptResults || !scriptResults[0]?.result) {
      throw new Error('Failed to get viewport information');
    }

    const {
      width: viewportWidth,
      height: viewportHeight,
      devicePixelRatio
    } = scriptResults[0].result;

    console.info(
      `[Screenshot] viewport=${viewportWidth}x${viewportHeight} dpr=${devicePixelRatio}`
    );

    const captureResult = (await sendCommand(tabId, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality: 100 * INITIAL_JPEG_QUALITY,
      captureBeyondViewport: false,
      fromSurface: true
    })) as CdpCaptureScreenshotResult | undefined;

    if (!captureResult || !captureResult.data) {
      throw new Error('Failed to capture screenshot via CDP');
    }

    const rawBase64: string = captureResult.data;

    return await processScreenshot(
      tabId,
      rawBase64,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      resize
    );
  } finally {
    if (!options?.skipIndicator) {
      await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
    }
  }
}

export async function processScreenshot(
  tabId: number,
  base64Data: string,
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  resizeParams?: ResizeParams
): Promise<ScreenshotResult> {
  const result = await processScreenshotInContentScript({
    tabId,
    base64Data,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    maxBase64Chars: MAX_BASE64_CHARS,
    initialJpegQuality: INITIAL_JPEG_QUALITY,
    jpegQualityStep: JPEG_QUALITY_STEP,
    minJpegQuality: MIN_JPEG_QUALITY,
    resizeParams: resizeParams ?? DEFAULT_RESIZE_PARAMS
  });
  screenshotContextManager.setContext(tabId, result);
  const ctx = screenshotContextManager.getContext(tabId);
  console.info(
    `[Screenshot] result=${result.width}x${result.height} fmt=${result.format} ` +
      `context={vp:${ctx?.viewportWidth}x${ctx?.viewportHeight}, ss:${ctx?.screenshotWidth}x${ctx?.screenshotHeight}} ` +
      `scaleX=${ctx ? (ctx.viewportWidth / ctx.screenshotWidth).toFixed(4) : 'N/A'} ` +
      `scaleY=${ctx ? (ctx.viewportHeight / ctx.screenshotHeight).toFixed(4) : 'N/A'} ` +
      `b64len=${result.base64.length}`
  );
  return result;
}
