import { useEffect } from 'react';

export interface UseNotificationUIEffectsProps {
  messageLimitType: string;
  setMessageLimitDismissed: (dismissed: boolean) => void;
  lastStopReason: string | undefined;
  setRefusalFeedbackSent: (sent: boolean) => void;
  notificationBannerTimerRef: React.MutableRefObject<number | null>;
}

/**
 * useNotificationUIEffects — 通知和 UI 相关 effects
 * 封装消息限制、拒绝反馈、通知 banner 清理、滚动渐变等
 */
export function useNotificationUIEffects({
  messageLimitType,
  setMessageLimitDismissed,
  lastStopReason,
  setRefusalFeedbackSent,
  notificationBannerTimerRef
}: UseNotificationUIEffectsProps) {
  // Reset message limit dismissal when limit changes
  useEffect(() => {
    if (messageLimitType === 'within_limit') return;
    setMessageLimitDismissed(false);
  }, [messageLimitType, setMessageLimitDismissed]);

  // Reset refusal feedback when stop reason changes
  useEffect(() => {
    if (lastStopReason === 'refusal') return;
    setRefusalFeedbackSent(false);
  }, [lastStopReason, setRefusalFeedbackSent]);

  // Cleanup notification banner timer on unmount
  useEffect(
    () => () => {
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }
    },
    [notificationBannerTimerRef]
  );
}
