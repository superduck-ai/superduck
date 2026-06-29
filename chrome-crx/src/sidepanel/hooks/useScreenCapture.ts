import { useCallback } from 'react';

interface ScreenCaptureResult {
  base64: string | null;
  error?: string;
}

interface UseScreenCaptureProps {
  tabId: number;
  forceTabActivation?: boolean;
  onCapture?: (result: ScreenCaptureResult) => void;
}

interface UseScreenCaptureReturn {
  captureFullScreen: () => Promise<ScreenCaptureResult>;
}

export const useScreenCapture = ({
  tabId,
  forceTabActivation = false,
  onCapture
}: UseScreenCaptureProps): UseScreenCaptureReturn => {
  const captureFullScreen = useCallback(async (): Promise<ScreenCaptureResult> => {
    try {
      // Activate tab if needed
      if (forceTabActivation) {
        await chrome.tabs.update(tabId, { active: true });
        // Wait for tab to become active
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Capture visible tab
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: 'jpeg',
        quality: 90
      });

      // Extract base64 from data URL
      const base64 = dataUrl.split(',')[1];

      const result: ScreenCaptureResult = { base64 };

      if (onCapture) {
        onCapture(result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to capture screenshot';
      const result: ScreenCaptureResult = { base64: null, error: errorMessage };

      if (onCapture) {
        onCapture(result);
      }

      return result;
    }
  }, [tabId, forceTabActivation, onCapture]);

  return { captureFullScreen };
};
