import { create } from 'zustand';
import type { SupportedLocale } from '../../index-react-dom-intl';
import type { PromptToSave } from '../shortcutsMenu/createShortcutHelpers';

// =============================================================================
// UI Store — UI 模态框/菜单/标志位
// =============================================================================

interface UIState {
  showCommandMenu: boolean;
  showWorkflowModeSelectionModal: boolean;
  showNotificationBanner: boolean;
  announcementDismissed: boolean;
  isGeneratingSummary: boolean;
  purlModeToggle: boolean;
  isMessageLimitDismissed: boolean;
  commandSearchTerm: string;
  promptToSave: PromptToSave | null;
  promptToEdit: { prompt: string; command?: string; name?: string; id?: string } | null;
  screenshotPreviewUrl: string | null;

  // Menu states (migrated from SidepanelApp useState)
  isModelMenuOpen: boolean;
  isHeaderMenuOpen: boolean;
  isLanguageSubmenuOpen: boolean;
  isPermissionMenuOpen: boolean;
  isActionsMenuOpen: boolean;
  pendingLocale: SupportedLocale | null;

  setShowCommandMenu: (show: boolean) => void;
  setShowWorkflowModeSelectionModal: (show: boolean) => void;
  setShowNotificationBanner: (show: boolean) => void;
  setAnnouncementDismissed: (dismissed: boolean) => void;
  setIsMessageLimitDismissed: (dismissed: boolean) => void;
  setCommandSearchTerm: (term: string) => void;
  setIsGeneratingSummary: (generating: boolean) => void;
  setPurlModeToggle: (toggle: boolean) => void;
  setPromptToSave: (data: PromptToSave | null) => void;
  setPromptToEdit: (
    data: { prompt: string; command?: string; name?: string; id?: string } | null
  ) => void;
  setScreenshotPreviewUrl: (url: string | null) => void;
  setIsModelMenuOpen: (open: boolean) => void;
  setIsHeaderMenuOpen: (open: boolean) => void;
  setIsLanguageSubmenuOpen: (open: boolean) => void;
  setIsPermissionMenuOpen: (open: boolean) => void;
  setIsActionsMenuOpen: (open: boolean) => void;
  setPendingLocale: (locale: SupportedLocale | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showCommandMenu: false,
  showWorkflowModeSelectionModal: false,
  showNotificationBanner: false,
  announcementDismissed: false,
  isMessageLimitDismissed: false,
  commandSearchTerm: '',
  isGeneratingSummary: false,
  purlModeToggle: false,
  promptToSave: null,
  promptToEdit: null,
  screenshotPreviewUrl: null,

  // Menu states
  isModelMenuOpen: false,
  isHeaderMenuOpen: false,
  isLanguageSubmenuOpen: false,
  isPermissionMenuOpen: false,
  isActionsMenuOpen: false,
  pendingLocale: null,

  setShowCommandMenu: (showCommandMenu) => set({ showCommandMenu }),
  setShowWorkflowModeSelectionModal: (showWorkflowModeSelectionModal) =>
    set({ showWorkflowModeSelectionModal }),
  setShowNotificationBanner: (showNotificationBanner) => set({ showNotificationBanner }),
  setAnnouncementDismissed: (announcementDismissed) => set({ announcementDismissed }),
  setIsMessageLimitDismissed: (isMessageLimitDismissed) => set({ isMessageLimitDismissed }),
  setCommandSearchTerm: (commandSearchTerm) => set({ commandSearchTerm }),
  setIsGeneratingSummary: (isGeneratingSummary) => set({ isGeneratingSummary }),
  setPurlModeToggle: (purlModeToggle) => set({ purlModeToggle }),
  setPromptToSave: (promptToSave) => set({ promptToSave }),
  setPromptToEdit: (promptToEdit) => set({ promptToEdit }),
  setScreenshotPreviewUrl: (screenshotPreviewUrl) => set({ screenshotPreviewUrl }),
  setIsModelMenuOpen: (isModelMenuOpen) => set({ isModelMenuOpen }),
  setIsHeaderMenuOpen: (isHeaderMenuOpen) => set({ isHeaderMenuOpen }),
  setIsLanguageSubmenuOpen: (isLanguageSubmenuOpen) => set({ isLanguageSubmenuOpen }),
  setIsPermissionMenuOpen: (isPermissionMenuOpen) => set({ isPermissionMenuOpen }),
  setIsActionsMenuOpen: (isActionsMenuOpen) => set({ isActionsMenuOpen }),
  setPendingLocale: (pendingLocale) => set({ pendingLocale })
}));
