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
  resizeParams: { pxPerToken: number; maxTargetPx: number; maxTargetTokens: number };
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
    minJpegQuality,
    resizeParams
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
      minQuality: number,
      pxPerToken: number,
      maxTargetPx: number,
      maxTargetTokens: number
    ) => {
      const dataUrl = `data:image/jpeg;base64,${imgBase64}`;
      return new Promise<ScreenshotResult>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let cssWidth = img.width;
          let cssHeight = img.height;

          // Step 1: DPR downscale
          if (dpr > 1) {
            cssWidth = Math.round(img.width / dpr);
            cssHeight = Math.round(img.height / dpr);
          }

          console.info(
            `[Screenshot CS] raw=${img.width}x${img.height} dpr=${dpr} css=${cssWidth}x${cssHeight}`
          );

          // Step 2: Token-budget resize (matches Claude official content script formula)
          const aspectRatio = cssWidth / cssHeight;
          const tokenCost = Math.ceil((cssWidth / pxPerToken) * (cssHeight / pxPerToken));

          let targetW = cssWidth;
          let targetH = cssHeight;

          if (tokenCost > maxTargetTokens) {
            const scaleFactor = Math.sqrt(maxTargetTokens / tokenCost);
            targetW = Math.round(cssWidth * scaleFactor);
            targetH = Math.round(targetW / aspectRatio);
          }

          const longestEdge = Math.max(targetW, targetH);
          if (longestEdge > maxTargetPx) {
            const edgeScale = maxTargetPx / longestEdge;
            targetW = Math.round(targetW * edgeScale);
            targetH = Math.round(targetH * edgeScale);
          }

          targetW = Math.max(1, targetW);
          targetH = Math.max(1, targetH);

          const needsResize = targetW < cssWidth || targetH < cssHeight;
          console.info(
            `[Screenshot CS] tokenCost=${tokenCost} target=${targetW}x${targetH} needsResize=${needsResize} ` +
              `pxPerToken=${pxPerToken} maxPx=${maxTargetPx} maxTokens=${maxTargetTokens}`
          );

          // Step 3: Draw DPR-corrected image onto first canvas
          const srcCanvas = document.createElement('canvas');
          srcCanvas.width = cssWidth;
          srcCanvas.height = cssHeight;
          const srcCtx = srcCanvas.getContext('2d');
          if (!srcCtx) return void reject(new Error('Failed to get canvas context'));

          if (dpr > 1) {
            srcCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, cssWidth, cssHeight);
          } else {
            srcCtx.drawImage(img, 0, 0);
          }

          // JPEG compress helper with iterative quality reduction
          const compressToFit = (canvas: HTMLCanvasElement): string => {
            let quality = initialQuality;
            let result = canvas.toDataURL('image/jpeg', quality).split(',')[1];
            while (result.length > maxChars && quality > minQuality) {
              quality -= qualityStep;
              result = canvas.toDataURL('image/jpeg', quality).split(',')[1];
            }
            return result;
          };

          // Step 4: If no spatial resize needed, just compress
          if (targetW >= cssWidth && targetH >= cssHeight) {
            const compressed = compressToFit(srcCanvas);
            return void resolve({
              base64: compressed,
              width: cssWidth,
              height: cssHeight,
              format: 'jpeg',
              viewportWidth: vpWidth,
              viewportHeight: vpHeight
            });
          }

          // Step 5: Resize to target dimensions, then compress
          const dstCanvas = document.createElement('canvas');
          dstCanvas.width = targetW;
          dstCanvas.height = targetH;
          const dstCtx = dstCanvas.getContext('2d');
          if (!dstCtx) return void reject(new Error('Failed to get target canvas context'));
          dstCtx.drawImage(srcCanvas, 0, 0, cssWidth, cssHeight, 0, 0, targetW, targetH);

          const compressed = compressToFit(dstCanvas);
          resolve({
            base64: compressed,
            width: targetW,
            height: targetH,
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
      minJpegQuality,
      resizeParams.pxPerToken,
      resizeParams.maxTargetPx,
      resizeParams.maxTargetTokens
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
