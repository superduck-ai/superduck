import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import {
  ModelFallbackConfig,
  ModelsConfigFeatureValue,
  StorageKeys,
  setStorageValue
} from '../../extensionServices';
import { MemoizedFormattedMessage } from '../../index-react-dom-intl';
import { getModelDisplayName } from '../sidepanelUtils';
import type { AnnouncementConfig, NotificationPreference } from '../types';
import {
  AnnouncementIcon,
  CompactBanner,
  ModelFallbackCard,
  SAFE_USE_TIPS_URL
} from './SidepanelSupportViews';

export interface SidepanelBannersProps {
  // Banner state
  activeBanner:
    | 'error'
    | 'refusal'
    | 'messageLimit'
    | 'highRisk'
    | 'notification'
    | 'announcement'
    | null;
  effectiveRuntimeError: string | null;
  effectiveClearError: () => void;
  setRuntimeError: React.Dispatch<React.SetStateAction<string | null>>;

  // Message limit
  messageLimitBanner: {
    text: string;
    isBlocking: boolean;
    dismissible: boolean;
    actionLabel?: string;
    actionUrl?: string;
  } | null;
  setMessageLimitDismissed: React.Dispatch<React.SetStateAction<boolean>>;

  // High risk
  setSkipWarningDismissed: React.Dispatch<React.SetStateAction<boolean>>;

  // Notifications
  setNotificationsEnabled: React.Dispatch<React.SetStateAction<NotificationPreference>>;
  setShowNotificationBanner: React.Dispatch<React.SetStateAction<boolean>>;

  // Announcement
  announcementConfig: AnnouncementConfig;
  dismissAnnouncement: () => void;

  // Model fallback
  lastStopReason: { reason: string; messageId?: string } | null;
  fallbackConfig: ModelFallbackConfig | undefined;
  selectedModel: string;
  modelConfig: ModelsConfigFeatureValue;
  retryWithFallback: () => Promise<void>;
  sendRefusalFeedback: () => void;

  // Utils
  trackEvent: (event: string, properties?: any) => void;
}

export function SidepanelBanners({
  activeBanner,
  effectiveRuntimeError,
  effectiveClearError,
  setRuntimeError,
  messageLimitBanner,
  setMessageLimitDismissed,
  setSkipWarningDismissed,
  setNotificationsEnabled,
  setShowNotificationBanner,
  announcementConfig,
  dismissAnnouncement,
  lastStopReason,
  fallbackConfig,
  selectedModel,
  modelConfig,
  retryWithFallback,
  sendRefusalFeedback,
  trackEvent
}: SidepanelBannersProps) {
  return (
    <>
      {/* Banner area — matches bundle placement inside input area */}
      <div className="px-3 md:px-2">
        <AnimatePresence mode="wait">
          {(() => {
            if (activeBanner === 'error') {
              const isNetworkError =
                effectiveRuntimeError?.toLowerCase().includes('connection error') ||
                effectiveRuntimeError?.toLowerCase().includes('network error') ||
                effectiveRuntimeError?.toLowerCase().includes('failed to fetch');
              return (
                <CompactBanner
                  key="error"
                  type="error"
                  onDismiss={() => effectiveClearError()}
                  dismissWithGradient
                >
                  {effectiveRuntimeError}
                  {isNetworkError && (
                    <>
                      {' '}
                      <button
                        onClick={() => {
                          setRuntimeError(null);
                          // Retry is not available in simplified source
                        }}
                        className="underline hover:opacity-80 transition-opacity"
                      >
                        Retry
                      </button>
                    </>
                  )}
                </CompactBanner>
              );
            }
            if (activeBanner === 'refusal') {
              return (
                <CompactBanner key="refusal" type="refusal">
                  <span className="font-small">
                    SuperDuck is unable to respond to this request, which appears to violate our{' '}
                    <button
                      onClick={() =>
                        chrome.tabs.create({
                          url: 'https://superduck-ai.github.io/superduck/'
                        })
                      }
                      className="inline-link"
                    >
                      Usage Policy
                    </button>
                    . Please start a new chat.
                  </span>
                </CompactBanner>
              );
            }
            if (activeBanner === 'messageLimit' && messageLimitBanner) {
              return (
                <CompactBanner
                  key="messageLimit"
                  type={messageLimitBanner.isBlocking ? 'danger' : 'info'}
                  onDismiss={
                    messageLimitBanner.dismissible
                      ? () => setMessageLimitDismissed(true)
                      : undefined
                  }
                >
                  {messageLimitBanner.text}
                  {messageLimitBanner.actionLabel && messageLimitBanner.actionUrl && (
                    <>
                      {' · '}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          chrome.tabs.create({ url: messageLimitBanner.actionUrl! });
                        }}
                        className="underline cursor-pointer text-text-100 opacity-90 hover:opacity-100"
                      >
                        {messageLimitBanner.actionLabel}
                      </button>
                    </>
                  )}
                </CompactBanner>
              );
            }
            if (activeBanner === 'highRisk') {
              return (
                <CompactBanner
                  key="highRisk"
                  type="high-risk"
                  onDismiss={() => setSkipWarningDismissed(true)}
                  dismissWithGradient
                >
                  <MemoizedFormattedMessage
                    id="high_risk_superduck_can_take_most_actions_on"
                    defaultMessage="<bold>HIGH RISK:</bold> SuperDuck can take most actions on the internet now. This setting could put your data at risk. <link>See safe use tips</link>"
                    values={{
                      bold: (chunks: React.ReactNode) => (
                        <span className="font-bold">{chunks}</span>
                      ),
                      link: (chunks: React.ReactNode) => (
                        <button
                          onClick={() => chrome.tabs.create({ url: SAFE_USE_TIPS_URL })}
                          className="underline hover:opacity-80 transition-colors"
                        >
                          {chunks}
                        </button>
                      )
                    }}
                  />
                </CompactBanner>
              );
            }
            if (activeBanner === 'notification') {
              return (
                <CompactBanner
                  key="notification"
                  type="notification"
                  onAction={async () => {
                    setNotificationsEnabled('enabled');
                    void trackEvent('superduck.sidebar.notification_toggled', {
                      enabled: true
                    });
                    await setStorageValue(StorageKeys.NOTIFICATIONS_ENABLED, 'enabled');
                    setShowNotificationBanner(false);
                  }}
                  onDismiss={() => {
                    setNotificationsEnabled('disabled');
                    void trackEvent('superduck.sidebar.notification_toggled', {
                      enabled: false
                    });
                    void setStorageValue(StorageKeys.NOTIFICATIONS_ENABLED, 'disabled');
                    setShowNotificationBanner(false);
                  }}
                  actionText="Notify me"
                  actionIcon={<Bell size={16} />}
                >
                  Get notified when tasks complete or need input
                </CompactBanner>
              );
            }
            if (activeBanner === 'announcement') {
              const text = announcementConfig.text ?? '';
              return (
                <CompactBanner
                  key="announcement"
                  type="announcement"
                  onDismiss={dismissAnnouncement}
                >
                  <div className="flex items-start gap-2">
                    <AnnouncementIcon size={16} />
                    {text}
                  </div>
                </CompactBanner>
              );
            }
            return null;
          })()}
        </AnimatePresence>
      </div>
      {/* Model fallback card — shown when safety filters pause the chat */}
      {lastStopReason?.reason === 'refusal' && fallbackConfig && (
        <ModelFallbackCard
          currentModelName={
            fallbackConfig.currentModelName || getModelDisplayName(selectedModel, modelConfig)
          }
          fallbackModelName={fallbackConfig.fallbackModelName || ''}
          fallbackDisplayName={
            fallbackConfig.fallbackDisplayName ||
            getModelDisplayName(fallbackConfig.fallbackModelName || '', modelConfig)
          }
          learnMoreUrl={fallbackConfig.learnMoreUrl || 'https://superduck-ai.github.io/superduck/'}
          onRetry={() => void retryWithFallback()}
          onSendFeedback={sendRefusalFeedback}
        />
      )}
    </>
  );
}
