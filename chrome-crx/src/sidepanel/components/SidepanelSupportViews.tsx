import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { MemoizedFormattedMessage, useIntlSafe } from '@/index-react-dom-intl';
import type { ScrollContainerHandle } from '@/sidepanel/ScrollContainer';

function BrowserPermissionGate({ onAccept }: { onAccept: () => Promise<void> }) {
  return (
    <div className="h-screen bg-bg-100 text-text-100 flex items-center justify-center p-4">
      <div className="max-w-lg rounded-xl border border-border-300 bg-bg-000 p-5">
        <h2 className="text-lg font-medium mb-2">
          <MemoizedFormattedMessage
            defaultMessage="Enable browser control"
            id="sidepanel_enable_browser_control"
          />
        </h2>
        <p className="text-sm text-text-300 mb-4">
          <MemoizedFormattedMessage
            defaultMessage="SuperDuck needs browser control permission before running actions."
            id="sidepanel_browser_control_permission_required"
          />
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-accent-main-100 text-oncolor-100"
          onClick={() => void onAccept()}
        >
          <MemoizedFormattedMessage defaultMessage="Continue" id="continue" />
        </button>
      </div>
    </div>
  );
}

function SetupGate({
  authError,
  onRetry,
  onOpenSettings
}: {
  authError: string | null;
  onRetry: () => Promise<void>;
  onOpenSettings: () => void;
}) {
  return (
    <div className="h-screen bg-bg-100 text-text-100 flex items-center justify-center p-4">
      <div className="max-w-lg rounded-xl border border-border-300 bg-bg-000 p-5">
        <h2 className="text-lg font-medium mb-2">
          <MemoizedFormattedMessage defaultMessage="Setup required" id="sidepanel_setup_required" />
        </h2>
        <p className="text-sm text-text-300 mb-4">
          <MemoizedFormattedMessage
            defaultMessage="Configure your model provider and API key in settings before sending prompts."
            id="sidepanel_configure_model_before_prompting"
          />
        </p>
        {authError ? <p className="text-sm text-danger-000 mb-3">{authError}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-accent-main-100 text-oncolor-100"
            onClick={onOpenSettings}
          >
            <MemoizedFormattedMessage defaultMessage="Open settings" id="open_settings" />
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-border-300 text-text-100"
            onClick={() => void onRetry()}
          >
            <MemoizedFormattedMessage defaultMessage="Retry" id="retry" />
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionBlockedView({
  currentVersion,
  minSupportedVersion
}: {
  currentVersion: string;
  minSupportedVersion: string;
}) {
  return (
    <div className="h-screen bg-bg-100 text-text-100 flex items-center justify-center p-4">
      <div className="max-w-xl rounded-xl border border-border-300 bg-bg-000 p-5">
        <h2 className="text-lg font-medium mb-2">Extension update required</h2>
        <p className="text-sm text-text-300 mb-4">
          Current version {currentVersion} is below minimum supported version {minSupportedVersion}.
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-accent-main-100 text-oncolor-100"
          onClick={() =>
            chrome.tabs.create({
              url: 'https://superduck-ai.github.io/superduck/'
            })
          }
        >
          Open Chrome Web Store
        </button>
      </div>
    </div>
  );
}

function BlockedDomainView({
  category,
  isMainTabBlocked,
  onCloseBlockedSites
}: {
  category: string;
  isMainTabBlocked: boolean;
  onCloseBlockedSites: () => Promise<void>;
}) {
  return (
    <div className="h-screen bg-bg-100 text-text-100 flex items-center justify-center p-4">
      <div className="max-w-xl rounded-xl border border-border-300 bg-bg-000 p-5">
        <h2 className="text-lg font-medium mb-2">
          {isMainTabBlocked ? 'This page is blocked for browser control' : 'Workflow stopped'}
        </h2>
        <p className="text-sm text-text-300 mb-3">
          {isMainTabBlocked
            ? 'SuperDuck cannot assist with the content on this page.'
            : 'SuperDuck landed on a blocked site and cannot complete your request.'}{' '}
          <span className="font-mono">({category})</span>
        </p>
        {!isMainTabBlocked ? (
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-border-300 text-text-100"
            onClick={() => void onCloseBlockedSites()}
          >
            <MemoizedFormattedMessage defaultMessage="Close blocked site" id="close_blocked_site" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PermissionPrompt({ requestId }: { requestId: string }) {
  const sendDecision = useCallback(
    async (allowed: boolean) => {
      if (!requestId) return;
      try {
        await chrome.runtime.sendMessage({
          type: 'MCP_PERMISSION_RESPONSE',
          requestId,
          allowed
        });
      } catch (error) {
        console.error('[sidepanel] failed to send MCP permission response', error);
      } finally {
        window.close();
      }
    },
    [requestId]
  );

  return (
    <div className="h-screen bg-bg-100 text-text-100 p-4">
      <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-border-300 bg-bg-000 p-5">
        <h1 className="text-lg font-semibold mb-2">Permission request</h1>
        <p className="text-sm text-text-300 mb-4">
          SuperDuck is requesting permission to continue. Confirm to allow this action.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-bg-200 text-text-100 hover:bg-bg-300"
            onClick={() => void sendDecision(false)}
          >
            Deny
          </button>
          <button
            type="button"
            disabled={!requestId}
            className="px-4 py-2 rounded-lg bg-accent-main-100 text-oncolor-100 disabled:opacity-50"
            onClick={() => void sendDecision(true)}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

function ScrollToBottomButton({
  autoscrollRef,
  sentinelElement,
  isStreaming = false,
  scrollThreshold = 50
}: {
  autoscrollRef: React.RefObject<ScrollContainerHandle | null>;
  sentinelElement: HTMLDivElement | null;
  isStreaming?: boolean;
  scrollThreshold?: number;
}) {
  const intl = useIntlSafe();
  const [showButton, setShowButton] = useState(false);

  const handleClick = useCallback(() => {
    const ref = autoscrollRef.current;
    if (!ref) return;
    ref.scrollToBottom('instant');
    if (isStreaming) ref.setPinToBottom(true);
  }, [autoscrollRef, isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    autoscrollRef.current?.setPinToBottom(true);
  }, [isStreaming, autoscrollRef]);

  useEffect(() => {
    if (!sentinelElement) return;
    const scrollContainer = autoscrollRef.current?.getScrollContainer();
    if (!scrollContainer) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowButton(!entry.isIntersecting);
      },
      { root: scrollContainer, threshold: 0.01, rootMargin: `0px 0px ${scrollThreshold}px 0px` }
    );

    observer.observe(sentinelElement);
    return () => observer.disconnect();
  }, [sentinelElement, autoscrollRef, scrollThreshold]);

  return (
    <div className={`flex justify-center pb-2 ${showButton ? '' : 'hidden'}`}>
      <button
        onClick={handleClick}
        aria-label={intl.formatMessage({
          id: 'scroll_to_bottom',
          defaultMessage: 'Scroll to bottom'
        })}
        className={`scroll-btn-halo ${isStreaming ? 'is-streaming' : ''} size-9 inline-flex items-center justify-center border-0.5 !rounded-full p-1 shadow-md hover:shadow-lg bg-bg-000/80 hover:bg-bg-000 backdrop-blur relative transition-opacity duration-200 ${
          isStreaming ? 'border-accent-brand/30' : 'border-border-300'
        }`}
      >
        <ChevronDown size={16} className="text-text-300 relative z-10" />
      </button>
    </div>
  );
}

const SAFE_USE_TIPS_URL = 'https://superduck-ai.github.io/superduck/';

function AnnouncementIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M11.0974 2.04754C11.8559 1.36502 13.1023 1.62953 13.4919 2.61785L14.4558 5.06414C15.6023 4.86154 16.7713 5.48673 17.2145 6.61199C17.6576 7.73723 17.2274 8.98904 16.2507 9.62273L17.2155 12.071C17.6307 13.1254 16.7716 14.2422 15.6462 14.111L11.3727 13.61L12.3366 16.0563C12.6402 16.827 12.2615 17.6979 11.4909 18.0016L10.5602 18.3688C9.78952 18.6723 8.91852 18.2929 8.61493 17.5221L7.33173 14.2663L6.86689 14.4499C5.06846 15.1581 3.03623 14.2737 2.32782 12.4753C1.61965 10.6769 2.50309 8.64461 4.30146 7.93621L6.85907 6.92937C6.93572 6.89918 7.00401 6.84961 7.05732 6.7868L10.9528 2.19695L11.0974 2.04754ZM9.66669 13.4108C9.58487 13.4012 9.50115 13.4119 9.4245 13.4421L8.26239 13.8991L9.5456 17.1559C9.6468 17.4129 9.93711 17.5394 10.194 17.4382L11.1247 17.072C11.3814 16.9707 11.507 16.6803 11.4059 16.4235L10.2468 13.4782L9.66669 13.4108ZM4.66767 8.86687C3.38323 9.373 2.75252 10.8245 3.25849 12.1091C3.76452 13.3937 5.21604 14.0253 6.50067 13.5192L8.82587 12.6022L6.99384 7.94988L4.66767 8.86687ZM12.5612 2.98504C12.4313 2.65568 12.0162 2.56714 11.7634 2.79461L11.7145 2.84441L7.85028 7.39617L9.82978 12.4225L15.7614 13.1179C16.1365 13.1617 16.4229 12.7896 16.2849 12.4382L12.5612 2.98504ZM14.8356 6.02996L15.8708 8.65887C16.3372 8.25373 16.5232 7.58576 16.2839 6.9782C16.0445 6.37071 15.453 6.00819 14.8356 6.02996Z" />
    </svg>
  );
}

function CompactBanner({
  type,
  children,
  onAction,
  onDismiss,
  actionText,
  actionIcon,
  dismissWithGradient = false
}: {
  type: 'high-risk' | 'refusal' | 'error' | 'danger' | 'announcement' | 'notification' | 'info';
  children: React.ReactNode;
  onAction?: () => void;
  onDismiss?: () => void;
  actionText?: string;
  actionIcon?: React.ReactNode;
  dismissWithGradient?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const bgClass =
    type === 'high-risk'
      ? 'bg-[#F7ECC1] dark:bg-[#F5DB9A]'
      : type === 'refusal' || type === 'error' || type === 'danger'
        ? 'bg-danger-900'
        : type === 'announcement'
          ? 'bg-[#D4E7F7] dark:bg-[#2B5278]'
          : 'bg-bg-300 dark:bg-bg-400';

  const textClass =
    type === 'high-risk'
      ? 'text-[#141413]'
      : type === 'refusal' || type === 'error' || type === 'danger'
        ? 'text-danger-100 dark:text-danger-000'
        : type === 'announcement'
          ? 'text-[#1E5A8E] dark:text-[#D4E7F7]'
          : 'text-text-200 dark:text-text-300';

  const actionBtnClass =
    type === 'high-risk'
      ? 'bg-[#141413] text-[#F7ECC1] dark:text-[#F5DB9A]'
      : type === 'refusal' || type === 'danger'
        ? 'bg-danger-100 text-danger-900 dark:bg-danger-000 dark:text-danger-900'
        : 'bg-text-100 text-bg-000';

  const gradientStyle =
    type === 'high-risk'
      ? 'linear-gradient(45deg, transparent 70%, rgba(247, 236, 193, 0.5) 85%, rgba(247, 236, 193, 0.9) 100%)'
      : type === 'refusal' || type === 'error' || type === 'danger'
        ? 'linear-gradient(45deg, transparent 70%, rgba(249, 236, 236, 0.5) 85%, rgba(249, 236, 236, 0.9) 100%)'
        : type === 'announcement'
          ? 'linear-gradient(45deg, transparent 70%, rgba(212, 231, 247, 0.5) 85%, rgba(212, 231, 247, 0.9) 100%)'
          : 'linear-gradient(45deg, transparent 70%, rgba(255, 255, 255, 0.3) 85%, rgba(255, 255, 255, 0.6) 100%)';

  return (
    <div
      className={`${bgClass} ${textClass} rounded-t-[14px] px-4 py-2 flex items-center justify-between relative`}
      {...(dismissWithGradient && onDismiss
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false)
          }
        : {})}
    >
      <div className="text-xs flex-1">{children}</div>
      {!dismissWithGradient && (onAction || onDismiss) && (
        <div className="flex items-center gap-2 ml-3">
          {onAction && actionText && (
            <button
              onClick={onAction}
              className={`${actionBtnClass} px-3 py-1 rounded-md text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1`}
            >
              {actionIcon}
              {actionText}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 hover:opacity-70 rounded transition-opacity"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {dismissWithGradient && onDismiss && (
        <>
          <div
            className={`absolute inset-0 pointer-events-none rounded-t-[14px] transition-all duration-300 ease-out ${hovered ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: gradientStyle }}
          />
          <button
            onClick={onDismiss}
            className={`absolute top-3 right-3 p-0.5 transition-all duration-300 ease-out ${hovered ? 'opacity-70 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </>
      )}
    </div>
  );
}

function ModelFallbackCard({
  currentModelName,
  fallbackModelName,
  fallbackDisplayName,
  learnMoreUrl,
  onRetry,
  onSendFeedback
}: {
  currentModelName: string;
  fallbackModelName: string;
  fallbackDisplayName: string;
  learnMoreUrl: string;
  onRetry: (model: string) => void;
  onSendFeedback: () => void;
}) {
  const intl = useIntlSafe();

  return (
    <div
      className="bg-bg-000 rounded-2xl border-[0.5px] border-border-300 px-4 py-4"
      style={{ boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.04)' }}
    >
      <h3 className="font-ui text-[16px] font-medium leading-[140%] text-text-100 mb-2">
        {intl.formatMessage({ id: 'chat_paused', defaultMessage: 'Chat paused' })}
      </h3>
      <p className="font-base text-text-100 mb-0">
        <MemoizedFormattedMessage
          id="s_safety_filters_flagged_this_chat_due_to"
          defaultMessage="{currentModelName}'s safety filters flagged this chat. Due to its advanced capabilities, {currentModelName} has additional safety measures that occasionally pause normal, safe chats. We're working to improve this. Continue your chat with {fallbackDisplayName}, {sendFeedbackLink}, or {learnMoreLink}."
          values={{
            currentModelName,
            fallbackDisplayName,
            sendFeedbackLink: (
              <button
                onClick={onSendFeedback}
                className="inline-link hover:opacity-70 transition-opacity"
              >
                {intl.formatMessage({ id: 'send_feedback', defaultMessage: 'send feedback' })}
              </button>
            ),
            learnMoreLink: (
              <button
                onClick={() => chrome.tabs.create({ url: learnMoreUrl })}
                className="inline-link hover:opacity-70 transition-opacity"
              >
                {intl.formatMessage({ id: 'learn_more', defaultMessage: 'learn more' })}
              </button>
            )
          }}
        />
      </p>
      <button
        onClick={() => onRetry(fallbackModelName)}
        className="mt-4 w-full bg-accent-main-100 text-oncolor-100 hover:bg-accent-main-200 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        {intl.formatMessage(
          { id: 'retry_with', defaultMessage: 'Retry with {fallbackDisplayName}' },
          { fallbackDisplayName }
        )}
      </button>
    </div>
  );
}

export {
  AnnouncementIcon,
  BlockedDomainView,
  BrowserPermissionGate,
  CompactBanner,
  ModelFallbackCard,
  SetupGate,
  PermissionPrompt,
  SAFE_USE_TIPS_URL,
  ScrollToBottomButton,
  VersionBlockedView
};
