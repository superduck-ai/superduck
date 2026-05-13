import type { ScreenshotResult } from './cdpTypes';

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

          const compressToFit = (sourceCanvas: HTMLCanvasElement): string => {
            let quality = initialQuality;
            let result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
            while (result.length > maxChars && quality > minQuality) {
              quality -= qualityStep;
              result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
            }
            return result;
          };

          const compressed = compressToFit(canvas);
          resolve({
            base64: compressed,
            width: imgWidth,
            height: imgHeight,
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
