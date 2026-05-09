import React from 'react';
import { create } from 'zustand';

// =============================================================================
// Message Store (lines 593-619)
// =============================================================================

export interface ChatMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

interface MessagesState {
  messages: ChatMessage[];
  messageByIndex: Map<number, ChatMessage>;
  isStreaming: boolean;
  sessionId: string | null;
  hasApprovedPlan: boolean;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (index: number, message: ChatMessage) => void;
  clearMessages: () => void;
  setStreaming: (streaming: boolean) => void;
  setSessionId: (id: string | null) => void;
  setHasApprovedPlan: (approved: boolean) => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
  messages: [],
  messageByIndex: new Map(),
  isStreaming: false,
  sessionId: null,
  hasApprovedPlan: false,

  setMessages: (messages) => {
    const messageByIndex = new Map<number, ChatMessage>();
    messages.forEach((msg, idx) => {
      messageByIndex.set(idx, msg);
    });
    set({ messages, messageByIndex });
  },

  appendMessage: (message) =>
    set((state) => {
      const messages = [...state.messages, message];
      const idx = messages.length - 1;
      const messageByIndex = new Map(state.messageByIndex);
      messageByIndex.set(idx, message);
      return { messages, messageByIndex };
    }),

  updateMessage: (index, message) =>
    set((state) => {
      const messages = [...state.messages];
      messages[index] = message;
      const messageByIndex = new Map(state.messageByIndex);
      messageByIndex.set(index, message);
      return { messages, messageByIndex };
    }),

  clearMessages: () => set({ messages: [], messageByIndex: new Map(), hasApprovedPlan: false }),

  setStreaming: (isStreaming) => set({ isStreaming }),
  setSessionId: (sessionId) => set({ sessionId }),
  setHasApprovedPlan: (hasApprovedPlan) => set({ hasApprovedPlan })
}));

// =============================================================================
// UI Store (lines 646-693)
// =============================================================================

interface UIState {
  showCommandMenu: boolean;
  showWorkflowModeSelectionModal: boolean;
  showSkipPermissionsOverlay: boolean;
  showShareWarningModal: boolean;
  showFeedbackForm: boolean;
  showNotificationBanner: boolean;
  announcementDismissed: boolean;
  skipPermissionsWarningDismissed: boolean;
  isMessageLimitDismissed: boolean;
  showTopGradient: boolean;
  hasBlockingWarning: boolean;
  commandSearchTerm: string;
  isGeneratingSummary: boolean;
  pendingContinue: boolean;
  lastGroupShowExpandedTimeline: boolean;
  lastGroupAnimationCompletedAt: number;
  promptToSave: { prompt: string; command?: string } | null;
  promptToEdit: { prompt: string; command?: string; name?: string; id?: string } | null;
  screenshotPreviewUrl: string | null;
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
  setPendingContinue: (pending: boolean) => void;
  setLastGroupShowExpandedTimeline: (show: boolean) => void;
  setLastGroupAnimationCompletedAt: (time: number) => void;
  setPromptToSave: (data: { prompt: string; command?: string } | null) => void;
  setPromptToEdit: (
    data: { prompt: string; command?: string; name?: string; id?: string } | null
  ) => void;
  setScreenshotPreviewUrl: (url: string | null) => void;
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
  pendingContinue: false,
  lastGroupShowExpandedTimeline: false,
  lastGroupAnimationCompletedAt: 0,
  promptToSave: null,
  promptToEdit: null,
  screenshotPreviewUrl: null,

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
  setPendingContinue: (pendingContinue) => set({ pendingContinue }),
  setLastGroupShowExpandedTimeline: (lastGroupShowExpandedTimeline) =>
    set({ lastGroupShowExpandedTimeline }),
  setLastGroupAnimationCompletedAt: (lastGroupAnimationCompletedAt) =>
    set({ lastGroupAnimationCompletedAt }),
  setPromptToSave: (promptToSave) => set({ promptToSave }),
  setPromptToEdit: (promptToEdit) => set({ promptToEdit }),
  setScreenshotPreviewUrl: (screenshotPreviewUrl) => set({ screenshotPreviewUrl }),

  resetOnSessionClear: () =>
    set({
      hasBlockingWarning: false,
      skipPermissionsWarningDismissed: false,
      lastGroupShowExpandedTimeline: false,
      lastGroupAnimationCompletedAt: 0
    })
}));

// =============================================================================
// Deep Equal Utility (lines 619-644)
// =============================================================================

function isIterable(obj: unknown): obj is Iterable<unknown> {
  return obj != null && typeof obj === 'object' && Symbol.iterator in obj;
}

function hasEntries(
  obj: Iterable<unknown>
): obj is Iterable<unknown> & { entries: () => Iterable<[unknown, unknown]> } {
  return 'entries' in obj;
}

function mapEqual(
  a: Map<unknown, unknown> | { entries: () => Iterable<[unknown, unknown]> },
  b: Map<unknown, unknown> | { entries: () => Iterable<[unknown, unknown]> }
): boolean {
  const mapA = a instanceof Map ? a : new Map(a.entries());
  const mapB = b instanceof Map ? b : new Map(b.entries());
  if (mapA.size !== mapB.size) return false;
  for (const [key, value] of mapA) {
    if (!mapB.has(key) || !Object.is(value, mapB.get(key))) return false;
  }
  return true;
}

function iterableEqual(a: Iterable<unknown>, b: Iterable<unknown>): boolean {
  const iterA = a[Symbol.iterator]();
  const iterB = b[Symbol.iterator]();
  let resultA = iterA.next();
  let resultB = iterB.next();
  while (!resultA.done && !resultB.done) {
    if (!Object.is(resultA.value, resultB.value)) return false;
    resultA = iterA.next();
    resultB = iterB.next();
  }
  return !!resultA.done && !!resultB.done;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (isIterable(a) && isIterable(b)) {
    return hasEntries(a) && hasEntries(b) ? mapEqual(a, b) : iterableEqual(a, b);
  }

  return mapEqual(
    { entries: () => Object.entries(a as Record<string, unknown>) },
    { entries: () => Object.entries(b as Record<string, unknown>) }
  );
}

export function useDeepMemoSelector<T>(selector: (state: T) => unknown) {
  const prevRef = React.useRef<unknown>(undefined);
  return (state: T) => {
    const result = selector(state);
    return deepEqual(prevRef.current, result) ? prevRef.current : (prevRef.current = result);
  };
}
