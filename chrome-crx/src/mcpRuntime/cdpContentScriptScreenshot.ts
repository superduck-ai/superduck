import type { ResizeParams, ScreenshotResult } from './cdpTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isScreenshotResult(value: unknown): value is ScreenshotResult {
  return (
    isRecord(value) &&
    typeof value.base64 === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.format === 'string' &&
    typeof value.viewportWidth === 'number' &&
    typeof value.viewportHeight === 'number'
  );
}

export async function processScreenshotInContentScript(options: {
  tabId: number;
  base64Data: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  resizeParams: ResizeParams;
  maxBase64Chars: number;
  initialJpegQuality: number;
  jpegQualityStep: number;
  minJpegQuality: number;
}): Promise<ScreenshotResult> {
  const {
    tabId,
    base64Data,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    resizeParams,
    maxBase64Chars,
    initialJpegQuality,
    jpegQualityStep,
    minJpegQuality
  } = options;

  const scriptResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: (
      imgBase64: string,
      vpWidth: number,
      vpHeight: number,
      dpr: number,
      resize: ResizeParams,
      maxChars: number,
      initialQuality: number,
      qualityStep: number,
      minQuality: number
    ) => {
      const dataUrl = `data:image/png;base64,${imgBase64}`;
      return new Promise<ScreenshotResult>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let imgWidth = img.width;
          let imgHeight = img.height;

          if (dpr > 1) {
            imgWidth = Math.round(img.width / dpr);
            imgHeight = Math.round(img.height / dpr);
          }

          const canvas = document.createElement('canvas');
          canvas.width = imgWidth;
          canvas.height = imgHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return void reject(new Error('Failed to get canvas context'));
          }

          if (dpr > 1) {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgWidth, imgHeight);
          } else {
            ctx.drawImage(img, 0, 0);
          }

          const aspectRatio = imgWidth / imgHeight;
          const pxPerToken = resize.pxPerToken || 28;
          const maxTargetTokens = resize.maxTargetTokens || 1568;
          const currentTokens = Math.ceil((imgWidth / pxPerToken) * (imgHeight / pxPerToken));

          let targetWidth = imgWidth;
          let targetHeight = imgHeight;

          if (currentTokens > maxTargetTokens) {
            const scaleFactor = Math.sqrt(maxTargetTokens / currentTokens);
            targetWidth = Math.round(imgWidth * scaleFactor);
            targetHeight = Math.round(targetWidth / aspectRatio);
          }

          const compressToFit = (sourceCanvas: HTMLCanvasElement): string => {
            let quality = initialQuality;
            let result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
            while (result.length > maxChars && quality > minQuality) {
              quality -= qualityStep;
              result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
            }
            return result;
          };

          if (targetWidth >= imgWidth && targetHeight >= imgHeight) {
            const compressed = compressToFit(canvas);
            return void resolve({
              base64: compressed,
              width: imgWidth,
              height: imgHeight,
              format: 'jpeg',
              viewportWidth: vpWidth,
              viewportHeight: vpHeight
            });
          }

          const targetCanvas = document.createElement('canvas');
          targetCanvas.width = targetWidth;
          targetCanvas.height = targetHeight;
          const targetCtx = targetCanvas.getContext('2d');
          if (!targetCtx) {
            return void reject(new Error('Failed to get target canvas context'));
          }

          targetCtx.drawImage(canvas, 0, 0, imgWidth, imgHeight, 0, 0, targetWidth, targetHeight);

          const compressed = compressToFit(targetCanvas);
          resolve({
            base64: compressed,
            width: targetWidth,
            height: targetHeight,
            format: 'jpeg',
            viewportWidth: vpWidth,
            viewportHeight: vpHeight
          });
        };
        img.onerror = () => {
          reject(new Error('Failed to load screenshot image'));
        };
        img.src = dataUrl;
      });
    },
    args: [
      base64Data,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      resizeParams,
      maxBase64Chars,
      initialJpegQuality,
      jpegQualityStep,
      minJpegQuality
    ]
  });

  if (!scriptResults || !scriptResults[0]?.result) {
    throw new Error('Failed to process screenshot in content script');
  }

  const screenshotResult = scriptResults[0].result;
  if (!isScreenshotResult(screenshotResult)) {
    throw new Error('Unexpected screenshot result from content script');
  }

  return screenshotResult;
}
