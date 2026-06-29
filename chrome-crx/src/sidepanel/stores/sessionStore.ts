import { create } from 'zustand';

// =============================================================================
// Session Store — 会话管理
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - activeSessionId
// - activeConversationUuid
// - activeRemoteSessionId
// - showHistoryPanel
// =============================================================================

interface SessionState {
  activeSessionId: string;
  activeConversationUuid: string | null;
  activeRemoteSessionId: string | null;
  showHistoryPanel: boolean;

  // Actions
  setActiveSessionId: (id: string) => void;
  setActiveConversationUuid: (uuid: string | null) => void;
  setActiveRemoteSessionId: (id: string | null) => void;
  setShowHistoryPanel: (show: boolean) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: '',
  activeConversationUuid: null,
  activeRemoteSessionId: null,
  showHistoryPanel: false,

  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setActiveConversationUuid: (activeConversationUuid) => set({ activeConversationUuid }),
  setActiveRemoteSessionId: (activeRemoteSessionId) => set({ activeRemoteSessionId }),
  setShowHistoryPanel: (showHistoryPanel) => set({ showHistoryPanel }),

  clearSession: () =>
    set({
      activeSessionId: '',
      activeConversationUuid: null,
      activeRemoteSessionId: null,
      showHistoryPanel: false
    })
}));
