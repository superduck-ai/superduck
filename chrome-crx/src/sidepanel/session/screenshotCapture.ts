import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  base64ToBlob,
  blobToDataUrl,
  dataUrlToBlob,
  extractBase64FromDataUrl
} from '../../mcpServersStore';

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CapturedScreenshotAttachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  isAnnotated?: boolean;
}

class ScreenshotCaptureManager {
  private static instance: ScreenshotCaptureManager | null = null;

  static getInstance(): ScreenshotCaptureManager {
    if (!ScreenshotCaptureManager.instance) {
      ScreenshotCaptureManager.instance = new ScreenshotCaptureManager();
    }
    return ScreenshotCaptureManager.instance;
  }

  async captureVisibleTab(tabId?: number, forceTabActivation = true): Promise<string> {
    try {
      let targetWindowId: number | undefined;
      let resolvedTabId: number | undefined;

      if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        resolvedTabId = tab.id;
        targetWindowId = tab.windowId;

        if (!tab.active && resolvedTabId && forceTabActivation) {
          await chrome.tabs.update(resolvedTabId, { active: true });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await chrome.tabs.get(resolvedTabId);
        }
      } else {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab.id;
        targetWindowId = activeTab.windowId;
      }

      if (!targetWindowId) {
        throw new Error('No active window found');
      }

      const targetWindow = await chrome.windows.get(targetWindowId);
      if (!targetWindow.focused) {
        await chrome.windows.update(targetWindowId, { focused: true });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return await chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot access')) {
        throw new Error(
          'Cannot capture screenshot: Tab might be on a restricted page (chrome://, chrome-extension://, etc.)'
        );
      }
      throw error;
    }
  }

  async captureRegion(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const croppedBlob = await this.cropImage(screenshotBlob, region);
    return blobToDataUrl(croppedBlob);
  }

  async captureWithAnnotation(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const annotatedBlob = await this.addAnnotationOutline(screenshotBlob, region);
    return blobToDataUrl(annotatedBlob);
  }

  private async cropImage(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = region.width;
        canvas.height = region.height;
        context.drawImage(
          image,
          region.x * dpr,
          region.y * dpr,
          region.width * dpr,
          region.height * dpr,
          0,
          0,
          region.width,
          region.height
        );

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob from canvas'));
        }, 'image/png');
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      image.src = objectUrl;
    });
  }

  private async addAnnotationOutline(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);

        const viewportWidth = region.viewportWidth || image.width;
        const viewportHeight = region.viewportHeight || image.height;
        const scaleX = image.width / viewportWidth;
        const scaleY = image.height / viewportHeight;

        const x = region.x * scaleX;
        const y = region.y * scaleY;
        const width = region.width * scaleX;
        const height = region.height * scaleY;

        context.imageSmoothingEnabled = false;
        const accent = '#2D87D6';
        const scale = (scaleX + scaleY) / 2;

        context.shadowColor = accent;
        context.shadowBlur = 8 * scale;
        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 0.6;
        context.strokeRect(x, y, width, height);

        context.shadowColor = 'transparent';
        context.shadowBlur = 0;
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 4.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob from canvas'));
        }, 'image/png');
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      image.src = objectUrl;
    });
  }

  async injectSelectionOverlay(
    tabId: number,
    instructionText = 'Click to capture screen or drag to select an area'
  ): Promise<ScreenshotRegion | null> {
    return new Promise((resolve) => {
      const onMessage = (message: any, sender: chrome.runtime.MessageSender) => {
        if (sender.tab?.id === tabId && message.type === 'SCREENSHOT_SELECTION') {
          chrome.runtime.onMessage.removeListener(onMessage);
          if (message.cancelled) {
            resolve(null);
            return;
          }

          if (message.fullPage) {
            resolve({ x: 0, y: 0, width: -1, height: -1 });
            return;
          }

          resolve(message.region as ScreenshotRegion);
          return;
        }

        if (message.type === 'CANCEL_SCREENSHOT_OVERLAY') {
          chrome.runtime.onMessage.removeListener(onMessage);
          resolve(null);
        }
      };

      chrome.runtime.onMessage.addListener(onMessage);

      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(null);
      }, 60_000);

      chrome.scripting.executeScript(
        {
          target: { tabId },
          args: [instructionText],
          func: (text: string) => {
            const existing = document.getElementById('superduck-screenshot-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'superduck-screenshot-overlay';
            overlay.style.cssText = [
              'position: fixed',
              'top: 0',
              'left: 0',
              'width: 100vw',
              'height: 100vh',
              'background: transparent',
              'z-index: 2147483647',
              'cursor: crosshair',
              'user-select: none',
              'outline: none'
            ].join(';');
            overlay.setAttribute('tabindex', '0');

            const hint = document.createElement('div');
            hint.style.cssText = [
              'position: absolute',
              'top: 50%',
              'left: 50%',
              'transform: translate(-50%, -50%)',
              'background: rgba(0, 0, 0, 0.8)',
              'color: white',
              'padding: 12px 24px',
              'border-radius: 8px',
              'font-family: system-ui, -apple-system, sans-serif',
              'font-size: 16px',
              'z-index: 4',
              'display: flex',
              'align-items: center',
              'gap: 12px',
              'pointer-events: none',
              'white-space: nowrap',
              'max-width: 90vw'
            ].join(';');

            const label = document.createElement('span');
            label.textContent = text;
            label.style.cssText = [
              'pointer-events: none',
              'white-space: nowrap',
              'overflow: hidden',
              'text-overflow: ellipsis'
            ].join(';');

            hint.appendChild(label);
            overlay.appendChild(hint);

            const shadeTop = document.createElement('div');
            const shadeBottom = document.createElement('div');
            const shadeLeft = document.createElement('div');
            const shadeRight = document.createElement('div');
            const selection = document.createElement('div');

            selection.style.cssText = [
              'position: absolute',
              'border: 1px dashed hsl(210, 70.9%, 51.6%)',
              'background: transparent',
              'pointer-events: none',
              'display: none',
              'z-index: 3'
            ].join(';');

            const shadeBase = [
              'position: absolute',
              'background: rgba(0, 0, 0, 0.3)',
              'pointer-events: none',
              'z-index: 2'
            ].join(';');

            shadeTop.style.cssText = `${shadeBase};top:0;left:0;width:100%;height:100%`;
            shadeBottom.style.cssText = `${shadeBase};bottom:0;left:0;width:100%;height:0;display:none`;
            shadeLeft.style.cssText = `${shadeBase};top:0;left:0;width:0;height:100%;display:none`;
            shadeRight.style.cssText = `${shadeBase};top:0;right:0;width:0;height:100%;display:none`;

            overlay.appendChild(shadeTop);
            overlay.appendChild(shadeBottom);
            overlay.appendChild(shadeLeft);
            overlay.appendChild(shadeRight);
            overlay.appendChild(selection);

            let startX = 0;
            let startY = 0;
            let isDragging = false;

            overlay.onmousedown = (event: MouseEvent) => {
              if (event.button !== 0) return;

              isDragging = true;
              startX = event.clientX;
              startY = event.clientY;

              selection.style.display = 'block';
              selection.style.left = `${startX}px`;
              selection.style.top = `${startY}px`;
              selection.style.width = '0';
              selection.style.height = '0';

              hint.style.display = 'none';

              shadeTop.style.height = `${startY}px`;
              shadeBottom.style.display = 'block';
              shadeBottom.style.height = `${window.innerHeight - startY}px`;

              shadeLeft.style.display = 'block';
              shadeLeft.style.width = `${startX}px`;
              shadeLeft.style.top = `${startY}px`;
              shadeLeft.style.height = '0';

              shadeRight.style.display = 'block';
              shadeRight.style.width = `${window.innerWidth - startX}px`;
              shadeRight.style.top = `${startY}px`;
              shadeRight.style.height = '0';
            };

            overlay.onmousemove = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;
              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.left = `${x}px`;
              selection.style.top = `${y}px`;
              selection.style.width = `${width}px`;
              selection.style.height = `${height}px`;

              shadeTop.style.height = `${y}px`;
              shadeBottom.style.height = `${window.innerHeight - (y + height)}px`;
              shadeLeft.style.width = `${x}px`;
              shadeLeft.style.top = `${y}px`;
              shadeLeft.style.height = `${height}px`;
              shadeRight.style.width = `${window.innerWidth - (x + width)}px`;
              shadeRight.style.top = `${y}px`;
              shadeRight.style.height = `${height}px`;
            };

            overlay.onmouseup = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;

              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.display = 'none';
              shadeTop.style.display = 'none';
              shadeBottom.style.display = 'none';
              shadeLeft.style.display = 'none';
              shadeRight.style.display = 'none';
              hint.style.display = 'none';

              setTimeout(() => {
                if (width > 10 && height > 10) {
                  chrome.runtime.sendMessage({
                    type: 'SCREENSHOT_SELECTION',
                    region: {
                      x,
                      y,
                      width,
                      height,
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight
                    }
                  });
                } else {
                  chrome.runtime.sendMessage({
                    type: 'SCREENSHOT_SELECTION',
                    fullPage: true
                  });
                }
                overlay.remove();
              }, 10);
            };

            overlay.onkeydown = (event: KeyboardEvent) => {
              if (event.key !== 'Escape') return;

              chrome.runtime.sendMessage({
                type: 'SCREENSHOT_SELECTION',
                cancelled: true
              });
              overlay.remove();
            };

            document.body.appendChild(overlay);
            overlay.focus();
          }
        },
        () => {
          if (chrome.runtime.lastError) {
            chrome.runtime.onMessage.removeListener(onMessage);
            resolve(null);
          }
        }
      );
    });
  }
}

const screenshotCaptureManager = ScreenshotCaptureManager.getInstance();

interface ScreenshotCaptureParams {
  tabId?: number;
  onCapture: (attachment: CapturedScreenshotAttachment) => void;
  forceTabActivation?: boolean;
}

export function useScreenshotCapture({
  tabId,
  onCapture,
  forceTabActivation = true
}: ScreenshotCaptureParams) {
  const intl = useIntl();
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelCapture, setCancelCapture] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isCapturing && cancelCapture) {
        event.preventDefault();
        event.stopPropagation();
        cancelCapture();
        setCancelCapture(null);
      }
    };

    if (isCapturing) {
      document.addEventListener('keydown', handleEscape, true);
      window.addEventListener('keydown', handleEscape, true);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [cancelCapture, isCapturing]);

  const capture = useCallback(
    async (withSelection = true) => {
      if (isCapturing) return;

      setIsCapturing(true);
      setError(null);

      let wasCancelled = false;
      const cancel = () => {
        wasCancelled = true;
        setIsCapturing(false);

        if (tabId) {
          chrome.runtime.sendMessage({ type: 'CANCEL_SCREENSHOT_OVERLAY' }).catch(() => {});
          chrome.scripting
            .executeScript({
              target: { tabId },
              func: () => {
                const overlay = document.getElementById('superduck-screenshot-overlay');
                if (overlay) overlay.remove();
              }
            })
            .catch(() => {});
        }
      };

      setCancelCapture(() => cancel);

      try {
        let screenshotDataUrl: string;
        let isAnnotated = false;

        if (withSelection && tabId) {
          const overlayText = intl.formatMessage({
            defaultMessage: 'Click to capture screen or drag to select an area',
            id: 'jbEJHKa0PR'
          });

          const region = await screenshotCaptureManager.injectSelectionOverlay(tabId, overlayText);
          if (wasCancelled) return;
          if (!region) return;

          if (region.width === -1 && region.height === -1) {
            screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
              tabId,
              forceTabActivation
            );
          } else {
            screenshotDataUrl = await screenshotCaptureManager.captureWithAnnotation(
              tabId,
              region,
              forceTabActivation
            );
            isAnnotated = true;
          }
        } else {
          screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
            tabId,
            forceTabActivation
          );
        }

        if (wasCancelled) return;

        const base64 = extractBase64FromDataUrl(screenshotDataUrl);
        const blob = base64ToBlob(base64, 'image/png');
        const fileName = `screenshot-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        onCapture({
          id: crypto.randomUUID(),
          file,
          base64,
          url: screenshotDataUrl,
          isAnnotated
        });
      } catch {
        setError('Failed to capture screenshot');
      } finally {
        setIsCapturing(false);
        setCancelCapture(null);
      }
    },
    [forceTabActivation, intl, isCapturing, onCapture, tabId]
  );

  const captureFullScreen = useCallback(() => capture(false), [capture]);
  const captureSelection = useCallback(() => capture(true), [capture]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || !isCapturing || !tabId) return;

      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            const overlay = document.getElementById('superduck-screenshot-overlay');
            if (overlay) overlay.remove();
          }
        })
        .catch(() => {});

      setIsCapturing(false);
      setCancelCapture(null);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (isCapturing && tabId) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              const overlay = document.getElementById('superduck-screenshot-overlay');
              if (overlay) overlay.remove();
            }
          })
          .catch(() => {});
      }
    };
  }, [isCapturing, tabId]);

  return {
    isCapturing,
    error,
    captureFullScreen,
    captureSelection
  };
}
