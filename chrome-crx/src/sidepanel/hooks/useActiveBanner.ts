import { useMemo } from 'react';
import type { MessageLimitBannerState } from './useMessageLimitBanner';
import type { NotificationPreference } from '../types';

export type ActiveBanner =
  | 'error'
  | 'refusal'
  | 'version_update'
  | 'messageLimit'
  | 'notification'
  | 'announcement'
  | MessageLimitBannerState
  | null;

export interface UseActiveBannerProps {
  messageLimitBanner: MessageLimitBannerState | null;
  versionUpdateBanner: 'version_update' | null;
  effectiveRuntimeError: string | null;
  lastStopReason: { reason: string } | null | undefined;
  fallbackConfig: { fallbackModelName?: string } | undefined;
  messageLimitDismissed: boolean;
  showNotificationBanner: boolean;
  notificationsEnabled: NotificationPreference;
  announcementConfig: { enabled?: boolean };
  announcementText: string;
  announcementDismissed: boolean;
}

/**
 * useActiveBanner — 当前活跃的横幅
 * 决定显示哪个横幅（消息限制、版本更新、错误、拒绝等）
 */
export function useActiveBanner({
  messageLimitBanner,
  versionUpdateBanner,
  effectiveRuntimeError,
  lastStopReason,
  fallbackConfig,
  messageLimitDismissed,
  showNotificationBanner,
  notificationsEnabled,
  announcementConfig,
  announcementText,
  announcementDismissed
}: UseActiveBannerProps): ActiveBanner {
  return useMemo(() => {
    if (lastStopReason?.reason === 'refusal' && fallbackConfig?.fallbackModelName) {
      return null;
    }
    if (effectiveRuntimeError) return 'error' as const;
    if (lastStopReason?.reason === 'refusal' && !fallbackConfig?.fallbackModelName) {
      return 'refusal' as const;
    }
    if (messageLimitBanner && !messageLimitDismissed) {
      return 'messageLimit' as const;
    }
    if (showNotificationBanner && notificationsEnabled === undefined) {
      return 'notification' as const;
    }
    if ((announcementConfig.enabled ?? false) && announcementText && !announcementDismissed) {
      return 'announcement' as const;
    }
    return versionUpdateBanner;
  }, [
    messageLimitBanner,
    versionUpdateBanner,
    effectiveRuntimeError,
    lastStopReason,
    fallbackConfig,
    messageLimitDismissed,
    showNotificationBanner,
    notificationsEnabled,
    announcementConfig.enabled,
    announcementText,
    announcementDismissed
  ]);
}
