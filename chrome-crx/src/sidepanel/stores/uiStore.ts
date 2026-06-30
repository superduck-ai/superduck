import { create } from 'zustand';
import type { SupportedLocale } from '../../index-react-dom-intl';

// =============================================================================
// UI Store — UI 模态框/菜单/标志位
// =============================================================================

interface UIState {
  showCommandMenu: boolean;
  showWorkflowModeSelectionModal: boolean;
  showSkipPermissionsOverlay: boolean;
  showShareWarningModal: boolean;
  showFeedbackForm: boolean;
  showNotificationBanner: boolean;
  announcementDismissed: boolean;
  isGeneratingSummary: boolean;
  purlModeToggle: boolean;
  skipPermissionsWarningDismissed: boolean;
  isMessageLimitDismissed: boolean;
  showTopGradient: boolean;
  hasBlockingWarning: boolean;
  commandSearchTerm: string;
  pendingContinue: boolean;
  lastGroupShowExpandedTimeline: boolean;
  lastGroupAnimationCompletedAt: number;
  promptToSave: { prompt: string; command?: string } | null;
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
  setShowSkipPermissionsOverlay: (show: boolean) => void;
  setShowShareWarningModal: (show: boolean) => void;
  setShowFeedbackForm: (show: boolean) => void;
  setShowNotificationBanner: (show: boolean) => void;
  setAnnouncementDismissed: (dismissed: boolean) => void;
  setSkipPermissionsWarningDismissed: (dismissed: boolean) => void;
  setIsMessageLimitDismissed: (dismissed: boolean) => void;
  setShowTopGradient: (show: boolean) => void;
  setHasBlockingWarning: (has: boolean) => void;
  setCommandSearchTerm: (term: string) => void;
  setIsGeneratingSummary: (generating: boolean) => void;
  setPurlModeToggle: (toggle: boolean) => void;
  setPendingContinue: (pending: boolean) => void;
  setLastGroupShowExpandedTimeline: (show: boolean) => void;
  setLastGroupAnimationCompletedAt: (time: number) => void;
  setPromptToSave: (data: { prompt: string; command?: string } | null) => void;
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
  resetOnSessionClear: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  showCommandMenu: false,
  showWorkflowModeSelectionModal: false,
  showSkipPermissionsOverlay: false,
  showShareWarningModal: false,
  showFeedbackForm: false,
  showNotificationBanner: false,
  announcementDismissed: false,
  skipPermissionsWarningDismissed: false,
  isMessageLimitDismissed: false,
  showTopGradient: false,
  hasBlockingWarning: false,
  commandSearchTerm: '',
  isGeneratingSummary: false,
  purlModeToggle: false,
  pendingContinue: false,
  lastGroupShowExpandedTimeline: false,
  lastGroupAnimationCompletedAt: 0,
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
  setShowSkipPermissionsOverlay: (showSkipPermissionsOverlay) =>
    set({ showSkipPermissionsOverlay }),
  setShowShareWarningModal: (showShareWarningModal) => set({ showShareWarningModal }),
  setShowFeedbackForm: (showFeedbackForm) => set({ showFeedbackForm }),
  setShowNotificationBanner: (showNotificationBanner) => set({ showNotificationBanner }),
  setAnnouncementDismissed: (announcementDismissed) => set({ announcementDismissed }),
  setSkipPermissionsWarningDismissed: (skipPermissionsWarningDismissed) =>
    set({ skipPermissionsWarningDismissed }),
  setIsMessageLimitDismissed: (isMessageLimitDismissed) => set({ isMessageLimitDismissed }),
  setShowTopGradient: (showTopGradient) => set({ showTopGradient }),
  setHasBlockingWarning: (hasBlockingWarning) => set({ hasBlockingWarning }),
  setCommandSearchTerm: (commandSearchTerm) => set({ commandSearchTerm }),
  setIsGeneratingSummary: (isGeneratingSummary) => set({ isGeneratingSummary }),
  setPurlModeToggle: (purlModeToggle) => set({ purlModeToggle }),
  setPendingContinue: (pendingContinue) => set({ pendingContinue }),
  setLastGroupShowExpandedTimeline: (lastGroupShowExpandedTimeline) =>
    set({ lastGroupShowExpandedTimeline }),
  setLastGroupAnimationCompletedAt: (lastGroupAnimationCompletedAt) =>
    set({ lastGroupAnimationCompletedAt }),
  setPromptToSave: (promptToSave) => set({ promptToSave }),
  setPromptToEdit: (promptToEdit) => set({ promptToEdit }),
  setScreenshotPreviewUrl: (screenshotPreviewUrl) => set({ screenshotPreviewUrl }),
  setIsModelMenuOpen: (isModelMenuOpen) => set({ isModelMenuOpen }),
  setIsHeaderMenuOpen: (isHeaderMenuOpen) => set({ isHeaderMenuOpen }),
  setIsLanguageSubmenuOpen: (isLanguageSubmenuOpen) => set({ isLanguageSubmenuOpen }),
  setIsPermissionMenuOpen: (isPermissionMenuOpen) => set({ isPermissionMenuOpen }),
  setIsActionsMenuOpen: (isActionsMenuOpen) => set({ isActionsMenuOpen }),
  setPendingLocale: (pendingLocale) => set({ pendingLocale }),

  resetOnSessionClear: () =>
    set({
      hasBlockingWarning: false,
      skipPermissionsWarningDismissed: false,
      lastGroupShowExpandedTimeline: false,
      lastGroupAnimationCompletedAt: 0
    })
}));
