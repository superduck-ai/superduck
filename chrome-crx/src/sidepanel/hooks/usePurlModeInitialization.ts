import { useEffect } from 'react';

export interface UsePurlModeInitializationProps {
  purlModeFeatureEnabled: boolean;
  setPurlModeToggle: (value: boolean) => void;
}

/**
 * usePurlModeInitialization — 闪电模式初始化
 * 从 chrome.storage 加载闪电模式设置
 */
export function usePurlModeInitialization({
  purlModeFeatureEnabled,
  setPurlModeToggle
}: UsePurlModeInitializationProps) {
  useEffect(() => {
    if (purlModeFeatureEnabled) {
      chrome.storage.local.get('purlMode').then((result) => {
        if (result.purlMode) setPurlModeToggle(true);
      });
    }
  }, [purlModeFeatureEnabled, setPurlModeToggle]);
}
