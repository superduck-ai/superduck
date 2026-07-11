import React, { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { MemoizedFormattedMessage, useIntlSafe } from '@/index-react-dom-intl';

function BrowserPermissionGate({ onAccept }: { onAccept: () => Promise<void> }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg p-5">
        <h2 className="mb-2 text-lg font-semibold">
          <MemoizedFormattedMessage
            defaultMessage="Enable browser control"
            id="sidepanel_enable_browser_control"
          />
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          <MemoizedFormattedMessage
            defaultMessage="SuperDuck needs browser control permission before running actions."
            id="sidepanel_browser_control_permission_required"
          />
        </p>
        <Button onClick={() => void onAccept()}>
          <MemoizedFormattedMessage defaultMessage="Continue" id="continue" />
        </Button>
      </Card>
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
    <div className="flex h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg p-5">
        <h2 className="mb-2 text-lg font-semibold">
          <MemoizedFormattedMessage defaultMessage="Setup required" id="sidepanel_setup_required" />
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          <MemoizedFormattedMessage
            defaultMessage="Configure your model provider and API key in settings before sending prompts."
            id="sidepanel_configure_model_before_prompting"
          />
        </p>
        {authError ? <p className="mb-3 text-sm text-destructive">{authError}</p> : null}
        <div className="flex gap-2">
          <Button onClick={onOpenSettings}>
            <MemoizedFormattedMessage defaultMessage="Open settings" id="open_settings" />
          </Button>
          <Button variant="outline" onClick={() => void onRetry()}>
            <MemoizedFormattedMessage defaultMessage="Retry" id="retry" />
          </Button>
        </div>
      </Card>
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
    <div className="flex h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-xl p-5">
        <h2 className="mb-2 text-lg font-semibold">
          <MemoizedFormattedMessage
            defaultMessage="Extension update required"
            id="sidepanel_update_required"
          />
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          <MemoizedFormattedMessage
            defaultMessage="Current version {currentVersion} is below minimum supported version {minSupportedVersion}."
            id="sidepanel_current_version_below_minimum"
            values={{ currentVersion, minSupportedVersion }}
          />
        </p>
        <Button
          onClick={() =>
            chrome.tabs.create({
              url: 'https://superduck-ai.github.io/superduck/'
            })
          }
        >
          <MemoizedFormattedMessage
            defaultMessage="Open Chrome Web Store"
            id="open_chrome_web_store"
          />
        </Button>
      </Card>
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
    <div className="flex h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-xl p-5">
        <h2 className="mb-2 text-lg font-semibold">
          {isMainTabBlocked ? (
            <MemoizedFormattedMessage
              defaultMessage="This page is blocked for browser control"
              id="sidepanel_page_blocked_for_browser_control"
            />
          ) : (
            <MemoizedFormattedMessage defaultMessage="Workflow stopped" id="workflow_stopped" />
          )}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isMainTabBlocked ? (
            <MemoizedFormattedMessage
              defaultMessage="SuperDuck cannot assist with the content on this page."
              id="sidepanel_cannot_assist_blocked_page"
            />
          ) : (
            <MemoizedFormattedMessage
              defaultMessage="SuperDuck landed on a blocked site and cannot complete your request."
              id="sidepanel_landed_on_blocked_site"
            />
          )}{' '}
          <span className="font-mono">({category})</span>
        </p>
        {!isMainTabBlocked ? (
          <Button variant="outline" onClick={() => void onCloseBlockedSites()}>
            <MemoizedFormattedMessage defaultMessage="Close blocked site" id="close_blocked_site" />
          </Button>
        ) : null}
      </Card>
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
    <div className="h-screen bg-background p-4 text-foreground">
      <Card className="mx-auto mt-10 w-full max-w-xl p-5">
        <h1 className="mb-2 text-lg font-semibold">
          <MemoizedFormattedMessage defaultMessage="Permission request" id="permission_request" />
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          <MemoizedFormattedMessage
            defaultMessage="SuperDuck is requesting permission to continue. Confirm to allow this action."
            id="sidepanel_permission_request_description"
          />
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void sendDecision(false)}>
            <MemoizedFormattedMessage defaultMessage="Deny" id="deny" />
          </Button>
          <Button disabled={!requestId} onClick={() => void sendDecision(true)}>
            <MemoizedFormattedMessage defaultMessage="Allow" id="allow" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

const SAFE_USE_TIPS_URL = 'https://superduck-ai.github.io/superduck/';

function CompactBanner({
  type,
  children,
  onAction,
  onDismiss,
  actionText,
  actionIcon,
  dismissWithGradient = false
}: {
  type: 'refusal' | 'error' | 'danger' | 'announcement' | 'notification' | 'info';
  children: React.ReactNode;
  onAction?: () => void;
  onDismiss?: () => void;
  actionText?: string;
  actionIcon?: React.ReactNode;
  dismissWithGradient?: boolean;
}) {
  const intl = useIntlSafe();
  const [hovered, setHovered] = useState(false);
  const isDanger = type === 'refusal' || type === 'error' || type === 'danger';

  const bgClass = isDanger
    ? 'border border-destructive/25 bg-destructive/10'
    : type === 'announcement'
      ? 'border border-primary/20 bg-primary/10'
      : 'border border-border bg-muted/55';

  const textClass = isDanger ? 'text-destructive' : 'text-foreground';

  const gradientStyle = isDanger
    ? 'linear-gradient(45deg, transparent 70%, color-mix(in oklab, var(--destructive), transparent 92%) 85%, color-mix(in oklab, var(--destructive), transparent 88%) 100%)'
    : type === 'announcement'
      ? 'linear-gradient(45deg, transparent 70%, color-mix(in oklab, var(--primary), transparent 92%) 85%, color-mix(in oklab, var(--primary), transparent 88%) 100%)'
      : 'linear-gradient(45deg, transparent 70%, color-mix(in oklab, var(--foreground), transparent 94%) 85%, color-mix(in oklab, var(--foreground), transparent 90%) 100%)';

  return (
    <div
      className={`${bgClass} ${textClass} relative flex items-center justify-between overflow-hidden rounded-lg px-3 py-2 text-xs shadow-xs`}
      {...(dismissWithGradient && onDismiss
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false)
          }
        : {})}
    >
      <div className="flex-1 text-xs">{children}</div>
      {!dismissWithGradient && (onAction || onDismiss) && (
        <div className="ml-3 flex items-center gap-2">
          {onAction && actionText && (
            <Button
              type="button"
              onClick={onAction}
              variant={isDanger ? 'destructive' : 'secondary'}
              size="xs"
              className="gap-1"
            >
              {actionIcon}
              {actionText}
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              onClick={onDismiss}
              variant="ghost"
              size="icon-xs"
              className="size-6"
              aria-label={intl.formatMessage({ defaultMessage: 'Dismiss', id: 'dismiss' })}
            >
              <X size={12} />
            </Button>
          )}
        </div>
      )}
      {dismissWithGradient && onDismiss && (
        <>
          <div
            className={`absolute inset-0 pointer-events-none rounded-t-[14px] transition-all duration-300 ease-out ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: gradientStyle }}
          />
          <Button
            type="button"
            onClick={onDismiss}
            variant="ghost"
            size="icon-xs"
            className={`absolute right-2 top-2.5 z-10 size-6 rounded-md transition-all duration-200 ease-out hover:opacity-100 focus-visible:opacity-100 ${
              hovered ? 'opacity-70' : 'opacity-45'
            }`}
            aria-label={intl.formatMessage({ defaultMessage: 'Dismiss', id: 'dismiss' })}
          >
            <X size={11} />
          </Button>
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
    <Card className="px-4 py-4">
      <h3 className="mb-2 text-base font-semibold leading-snug text-foreground">
        {intl.formatMessage({ id: 'chat_paused', defaultMessage: 'Chat paused' })}
      </h3>
      <p className="mb-0 text-sm leading-relaxed text-foreground">
        <MemoizedFormattedMessage
          id="s_safety_filters_flagged_this_chat_due_to"
          defaultMessage="{currentModelName}'s safety filters flagged this chat. Due to its advanced capabilities, {currentModelName} has additional safety measures that occasionally pause normal, safe chats. We're working to improve this. Continue your chat with {fallbackDisplayName}, {sendFeedbackLink}, or {learnMoreLink}."
          values={{
            currentModelName,
            fallbackDisplayName,
            sendFeedbackLink: (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={onSendFeedback}
                className="inline h-auto p-0 text-sm font-normal align-baseline"
              >
                {intl.formatMessage({ id: 'send_feedback', defaultMessage: 'send feedback' })}
              </Button>
            ),
            learnMoreLink: (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => chrome.tabs.create({ url: learnMoreUrl })}
                className="inline h-auto p-0 text-sm font-normal align-baseline"
              >
                {intl.formatMessage({ id: 'learn_more', defaultMessage: 'learn more' })}
              </Button>
            )
          }}
        />
      </p>
      <Button className="mt-4 w-full" onClick={() => onRetry(fallbackModelName)}>
        {intl.formatMessage(
          { id: 'retry_with', defaultMessage: 'Retry with {fallbackDisplayName}' },
          { fallbackDisplayName }
        )}
      </Button>
    </Card>
  );
}

export {
  BlockedDomainView,
  BrowserPermissionGate,
  CompactBanner,
  ModelFallbackCard,
  SetupGate,
  PermissionPrompt,
  SAFE_USE_TIPS_URL,
  VersionBlockedView
};
