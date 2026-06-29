import { useEffect } from 'react';

export interface UseNotificationUIEffectsProps {
  messageLimitType: string;
  setMessageLimitDismissed: (dismissed: boolean) => void;
  lastStopReason: string | undefined;
  setRefusalFeedbackSent: (sent: boolean) => void;
  activeSessionId: string;
  setSkipWarningDismissed: (dismissed: boolean) => void;
  notificationBannerTimerRef: React.MutableRefObject<number | null>;
  autoScrollRef: React.RefObject<any>;
  apiMessagesLength: number;
  setShowTopGradient: (show: boolean) => void;
}

/**
 * useNotificationUIEffects — 通知和 UI 相关 effects
 * 封装消息限制、拒绝反馈、跳过警告、通知 banner 清理、滚动渐变等
 */
export function useNotificationUIEffects({
  messageLimitType,
  setMessageLimitDismissed,
  lastStopReason,
  setRefusalFeedbackSent,
  activeSessionId,
  setSkipWarningDismissed,
  notificationBannerTimerRef,
  autoScrollRef,
  apiMessagesLength,
  setShowTopGradient
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

  // Reset skip warning dismissal when session changes
  useEffect(() => {
    setSkipWarningDismissed(false);
  }, [activeSessionId, setSkipWarningDismissed]);

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

  // Top gradient on scroll
  useEffect(() => {
    const container = autoScrollRef.current?.getScrollContainer();
    if (!container) return;
    const handleScroll = () => {
      setShowTopGradient(container.scrollTop > 10);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [apiMessagesLength, autoScrollRef, setShowTopGradient]);
}
