import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { base64ToBlob, extractBase64FromDataUrl } from '../../../mcpServersStore';
import type { CapturedScreenshotAttachment } from './types';
import { screenshotCaptureManager } from './engine';

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
