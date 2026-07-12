import { useMemo, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { StorageKeys, setStorageValue } from '../../extensionServices';
import { MemoizedFormattedMessage, useIntlSafe } from '../../index-react-dom-intl';
import { CompactBanner, SAFE_USE_TIPS_URL } from './SidepanelSupportViews';
import { useUIStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useModelStore } from '../stores/modelStore';
import { useChatActionsStore } from '../stores/chatActionsStore';
import { useSidepanelViewState } from '../contexts/SidepanelViewStateContext';
import { trackEvent } from '../../mcpRuntime';
import { getMessageLimitBannerState } from '../conversation/messageLimits';

/**
 * SidepanelBanners — 直接从 stores 读取状态，无 props
 */
export function SidepanelBanners() {
  const intl = useIntlSafe();

  // ─── Read state from stores ────────────────────────────────────────────
  const runtimeError = useSidepanelViewState().effectiveRuntimeError;
  const lastStopReason = useAgentStore((s) => s.lastStopReason);

  const messageLimit = useNotificationStore((s) => s.messageLimit);
  const messageLimitDismissed = useUIStore((s) => s.isMessageLimitDismissed);
  const setMessageLimitDismissed = useUIStore((s) => s.setIsMessageLimitDismissed);
  const showNotificationBanner = useUIStore((s) => s.showNotificationBanner);
  const setShowNotificationBanner = useUIStore((s) => s.setShowNotificationBanner);

  const notificationsEnabled = useNotificationStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useNotificationStore((s) => s.setNotificationsEnabled);

  const selectedModel = useModelStore((s) => s.selectedModel);

  // ─── Compute banner state ──────────────────────────────────────────────
  // Feature flags removed — fallbackConfig and announcementConfig are always empty
  const messageLimitBanner = useMemo(() => {
    if (messageLimit.type !== 'within_limit') {
      return getMessageLimitBannerState(messageLimit, selectedModel);
    }
    return null;
  }, [messageLimit, selectedModel]);

  const activeBanner = useMemo(() => {
    if (runtimeError) return 'error' as const;
    if (lastStopReason?.reason === 'refusal') {
      return 'refusal' as const;
    }
    if (messageLimitBanner && !messageLimitDismissed) {
      return 'messageLimit' as const;
    }
    if (showNotificationBanner && notificationsEnabled === undefined) {
      return 'notification' as const;
    }
    // Feature flags removed — announcement banner never shows
    return null;
  }, [
    runtimeError,
    lastStopReason,
    messageLimitBanner,
    messageLimitDismissed,
    showNotificationBanner,
    notificationsEnabled
  ]);

  // ─── Callbacks ──────────────────────────────────────────────────────────
  const effectiveClearError = useChatActionsStore((s) => s.effectiveClearError);

  return (
    <>
      {/* Banner area — matches bundle placement inside input area */}
      <div className={activeBanner ? 'px-3 pb-1.5 md:px-2' : 'px-3 md:px-2'}>
        <AnimatePresence mode="wait">
          {(() => {
            if (activeBanner === 'error') {
              const isNetworkError =
                runtimeError?.toLowerCase().includes('connection error') ||
                runtimeError?.toLowerCase().includes('network error') ||
                runtimeError?.toLowerCase().includes('failed to fetch');
              return (
                <CompactBanner
                  key="error"
                  type="error"
                  onDismiss={() => effectiveClearError()}
                  dismissWithGradient
                >
                  {runtimeError}
                  {isNetworkError && (
                    <>
                      {' '}
                      <button
                        onClick={() => {
                          effectiveClearError();
                          // Retry is not available in simplified source
                        }}
                        className="underline hover:opacity-80 transition-opacity"
                      >
                        <MemoizedFormattedMessage defaultMessage="Retry" id="retry" />
                      </button>
                    </>
                  )}
                </CompactBanner>
              );
            }
            if (activeBanner === 'refusal') {
              return (
                <CompactBanner key="refusal" type="refusal">
                  <span className="text-xs leading-[1.4]">
                    <MemoizedFormattedMessage
                      defaultMessage="SuperDuck is unable to respond to this request, which appears to violate our <usagePolicyLink>Usage Policy</usagePolicyLink>. Please start a new chat."
                      id="superduck_is_unable_to_respond_to_this_request"
                      values={{
                        usagePolicyLink: (chunks: ReactNode) => (
                          <button
                            onClick={() => chrome.tabs.create({ url: SAFE_USE_TIPS_URL })}
                            className="inline-link"
                          >
                            {chunks}
                          </button>
                        )
                      }}
                    />
                  </span>
                </CompactBanner>
              );
            }
            if (activeBanner === 'messageLimit' && messageLimitBanner) {
              return (
                <CompactBanner
                  key="messageLimit"
                  type={messageLimitBanner.isBlocking ? 'error' : 'danger'}
                  onDismiss={
                    messageLimitBanner.dismissible
                      ? () => setMessageLimitDismissed(true)
                      : undefined
                  }
                  dismissWithGradient
                  actionText={messageLimitBanner.actionLabel}
                  onAction={
                    messageLimitBanner.actionUrl
                      ? () => {
                          window.open(messageLimitBanner.actionUrl, '_blank');
                        }
                      : undefined
                  }
                >
                  {messageLimitBanner.text}
                </CompactBanner>
              );
            }
            if (activeBanner === 'notification') {
              return (
                <CompactBanner
                  key="notification"
                  type="notification"
                  onDismiss={async () => {
                    setNotificationsEnabled('disabled');
                    void trackEvent('superduck.sidebar.notification_toggled', {
                      enabled: false
                    });
                    await setStorageValue(StorageKeys.NOTIFICATIONS_ENABLED, 'disabled');
                    setShowNotificationBanner(false);
                  }}
                  actionIcon={<Bell size={16} />}
                  actionText={intl.formatMessage({
                    defaultMessage: 'Notify me',
                    id: 'notify_me'
                  })}
                  onAction={async () => {
                    setNotificationsEnabled('enabled');
                    void trackEvent('superduck.sidebar.notification_toggled', {
                      enabled: true
                    });
                    await setStorageValue(StorageKeys.NOTIFICATIONS_ENABLED, 'enabled');
                    setShowNotificationBanner(false);
                  }}
                >
                  <MemoizedFormattedMessage
                    defaultMessage="Get notified when tasks complete or need input"
                    id="sidepanel_notification_banner_message"
                  />
                </CompactBanner>
              );
            }
            return null;
          })()}
        </AnimatePresence>
      </div>
    </>
  );
}
