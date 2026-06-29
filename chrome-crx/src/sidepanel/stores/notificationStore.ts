import { create } from 'zustand';
import type { MessageLimitState } from '../conversation/messageLimits';
import type { NotificationPreference } from '../types';

// =============================================================================
// Notification Store — 通知与消息限制
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - notificationsEnabled
// - messageLimit
// =============================================================================

interface NotificationState {
  notificationsEnabled: NotificationPreference;
  messageLimit: MessageLimitState;

  // Actions
  setNotificationsEnabled: (enabled: NotificationPreference) => void;
  setMessageLimit: (
    limit: MessageLimitState | ((prev: MessageLimitState) => MessageLimitState)
  ) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notificationsEnabled: undefined,
  messageLimit: { type: 'within_limit' },

  setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
  setMessageLimit: (messageLimit) =>
    set((state) => ({
      messageLimit:
        typeof messageLimit === 'function' ? messageLimit(state.messageLimit) : messageLimit
    }))
}));
