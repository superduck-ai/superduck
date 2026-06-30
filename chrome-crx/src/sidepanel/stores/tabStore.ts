import { create } from 'zustand';

// =============================================================================
// Tab Store — 当前标签页与输入目标
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - currentPageUrl
// - currentPageTitle
// - populatedInputTargetTabId
// - preservedTranscriptTabId
// - preservedTranscriptActiveTabId
// =============================================================================

interface TabState {
  currentPageUrl: string;
  currentPageTitle: string;
  populatedInputTargetTabId: number | undefined;
  preservedTranscriptTabId: number | undefined;
  preservedTranscriptActiveTabId: number | undefined;

  // Actions
  setCurrentPageUrl: (url: string) => void;
  setCurrentPageTitle: (title: string) => void;
  setPopulatedInputTargetTabId: (id: number | undefined) => void;
  setPreservedTranscriptTabId: (id: number | undefined) => void;
  setPreservedTranscriptActiveTabId: (id: number | undefined) => void;
}

export const useTabStore = create<TabState>((set) => ({
  currentPageUrl: '',
  currentPageTitle: '',
  populatedInputTargetTabId: undefined,
  preservedTranscriptTabId: undefined,
  preservedTranscriptActiveTabId: undefined,

  setCurrentPageUrl: (currentPageUrl) => set({ currentPageUrl }),
  setCurrentPageTitle: (currentPageTitle) => set({ currentPageTitle }),
  setPopulatedInputTargetTabId: (populatedInputTargetTabId) => set({ populatedInputTargetTabId }),
  setPreservedTranscriptTabId: (preservedTranscriptTabId) => set({ preservedTranscriptTabId }),
  setPreservedTranscriptActiveTabId: (preservedTranscriptActiveTabId) =>
    set({ preservedTranscriptActiveTabId })
}));
