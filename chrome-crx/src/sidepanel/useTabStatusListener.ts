import { useEffect } from 'react';
import type { DependencyList } from 'react';

type TabChangeProperty = 'status' | 'active' | 'url' | 'title' | 'audible' | 'mutedInfo' | 'favIconUrl';

interface TabChangeInfo {
  status?: 'loading' | 'complete' | 'unloaded';
  active?: boolean;
  url?: string;
  title?: string;
  audible?: boolean;
  mutedInfo?: chrome.tabs.MutedInfo;
  favIconUrl?: string;
}

export const useTabStatusListener = (
  tabId: number | undefined,
  callback: (changeInfo: TabChangeInfo) => void,
  properties: TabChangeProperty[],
  dependencies: DependencyList = []
) => {
  useEffect(() => {
    if (!tabId) return;

    const handleTabUpdate = (
      updatedTabId: number,
      changeInfo: TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (updatedTabId === tabId) {
        // Check if any of the specified properties changed
        const hasRelevantChange = properties.some((prop) => prop in changeInfo);

        if (hasRelevantChange) {
          callback(changeInfo);
        }
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, [tabId, ...dependencies]);
};
