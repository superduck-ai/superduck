import React from 'react';
import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  MonitorCheck,
  MonitorCog,
  MonitorX,
  RefreshCw,
  Terminal
} from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger, SimpleTooltip } from '@/components/ui';
import {
  type NativeHostIntl,
  type NativeHostStatusKind,
  getStatusKind,
  getStatusView
} from './nativeHostStatusView';
import { useNativeHostStatus } from './useNativeHostStatus';

export interface NativeHostStatusButtonProps {
  intl: NativeHostIntl;
  onOpen?: () => void;
  trackEvent: (event: string, properties?: any) => void;
}

const CLI_SETUP_COMMANDS = ['npm install -g superduck-cli', 'superduck setup'] as const;
const CLI_SETUP_COMMAND_TEXT = CLI_SETUP_COMMANDS.join('\n');

function NativeHostGlyph({
  statusKind,
  size,
  className
}: {
  statusKind: NativeHostStatusKind;
  size: number;
  className?: string;
}) {
  if (statusKind === 'resetting' || statusKind === 'waiting' || statusKind === 'checking') {
    return <Loader2 size={size} className={`${className ?? ''} animate-spin`} />;
  }

  if (statusKind === 'error') {
    return <MonitorX size={size} className={className} />;
  }

  if (statusKind === 'connected') {
    return <MonitorCheck size={size} className={className} />;
  }

  return <MonitorCog size={size} className={className} />;
}

export function NativeHostStatusButton({ intl, onOpen, trackEvent }: NativeHostStatusButtonProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerButtonRef = React.useRef<HTMLButtonElement>(null);
  const copyResetTimerRef = React.useRef<number | null>(null);
  const dialogTitleId = React.useId();
  const dialogDescriptionId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [copiedCommands, setCopiedCommands] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);

  const {
    status,
    isRefreshing,
    isResetting,
    isAwaitingReconnect,
    resetFeedback,
    refreshStatus,
    resetNativeHost,
    clearResetFeedback
  } = useNativeHostStatus({ intl, trackEvent });

  const statusKind = getStatusKind(status, isRefreshing, isResetting, isAwaitingReconnect);
  const statusView = getStatusView(intl, statusKind);
  const tooltipLabel = intl.formatMessage(
    {
      id: 'native_host_status_tooltip',
      defaultMessage: 'Browser control: {status}'
    },
    { status: statusView.label }
  );

  React.useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  async function copyCommands() {
    try {
      await navigator.clipboard.writeText(CLI_SETUP_COMMAND_TEXT);
      setCopiedCommands(true);
      setCopyFailed(false);
      void trackEvent('superduck.sidebar.native_host_commands_copied');

      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedCommands(false);
        setCopyFailed(false);
      }, 1600);
    } catch (err) {
      console.warn('[nativeHost] copy setup commands failed', err);
      setCopiedCommands(false);
      setCopyFailed(true);

      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => setCopyFailed(false), 1600);
    }
  }

  return (
    <div ref={rootRef} className="relative inline-flex h-8 w-8 items-center justify-center">
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            onOpen?.();
            clearResetFeedback();
            void trackEvent('superduck.sidebar.native_host_status_opened', {
              nativeHostInstalled: Boolean(status?.nativeHostInstalled),
              mcpConnected: Boolean(status?.mcpConnected)
            });
            void refreshStatus();
          }
        }}
      >
        <PopoverTrigger
          render={
            <button
              ref={triggerButtonRef}
              type="button"
              className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ${
                isOpen
                  ? 'bg-muted/50 text-foreground'
                  : 'text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground'
              }`}
              aria-label={intl.formatMessage(
                {
                  id: 'native_host_status_button_aria',
                  defaultMessage: 'Browser control status: {status}'
                },
                { status: statusView.label }
              )}
              title={tooltipLabel}
            />
          }
        >
          <SimpleTooltip tooltipContent={tooltipLabel} side="bottom" showTooltip={!isOpen}>
            <div className="flex h-8 w-8 items-center justify-center">
              <NativeHostGlyph statusKind={statusKind} size={16} className="shrink-0" />
            </div>
          </SimpleTooltip>
          <span
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-background ${statusView.dotClassName}`}
          />
        </PopoverTrigger>

        <PopoverContent
          className="w-[min(290px,calc(100vw-1.5rem))] p-3 max-h-[calc(100vh-6rem)] overflow-y-auto backdrop-blur-md"
          align="end"
          side="bottom"
          sideOffset={8}
          role="dialog"
          aria-labelledby={dialogTitleId}
          aria-describedby={dialogDescriptionId}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${statusView.iconClassName}`}
            >
              <NativeHostGlyph statusKind={statusKind} size={16} className="shrink-0" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 id={dialogTitleId} className="truncate text-sm font-medium text-foreground">
                  {intl.formatMessage({
                    id: 'native_host_status_title',
                    defaultMessage: 'SuperDuck CLI'
                  })}
                </h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${statusView.pillClassName}`}
                >
                  {statusView.pill}
                </span>
              </div>
              <p id={dialogDescriptionId} className="mt-1 text-xs leading-5 text-muted-foreground">
                {intl.formatMessage({
                  id: 'native_host_product_description',
                  defaultMessage: 'Use SuperDuck to let agents control Chrome.'
                })}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border-0.5 border-border bg-muted/50 p-2.5">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">
                  {intl.formatMessage({
                    id: 'native_host_cli_setup_title',
                    defaultMessage: 'Install CLI'
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyCommands()}
                className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={intl.formatMessage({
                  id: 'native_host_copy_commands',
                  defaultMessage: 'Copy setup commands'
                })}
              >
                {copiedCommands ? (
                  <Check size={12} />
                ) : copyFailed ? (
                  <CircleAlert size={12} />
                ) : (
                  <Copy size={12} />
                )}
                <span aria-live="polite">
                  {copiedCommands
                    ? intl.formatMessage({
                        id: 'native_host_copied',
                        defaultMessage: 'Copied'
                      })
                    : copyFailed
                      ? intl.formatMessage({
                          id: 'native_host_copy_failed',
                          defaultMessage: 'Failed'
                        })
                      : intl.formatMessage({
                          id: 'native_host_copy',
                          defaultMessage: 'Copy'
                        })}
                </span>
              </button>
            </div>
            <div className="mt-2 rounded-md bg-background px-2 py-1.5">
              {CLI_SETUP_COMMANDS.map((command) => (
                <code
                  key={command}
                  className="block min-w-0 truncate font-mono text-[11px] leading-5 text-foreground"
                >
                  {command}
                </code>
              ))}
            </div>
          </div>

          {resetFeedback ? (
            <div className="mt-3 border-t border-border/70 pt-3" role="status" aria-live="polite">
              <p
                className={`inline-flex items-center gap-1.5 text-xs leading-5 ${
                  resetFeedback.type === 'success'
                    ? 'text-success'
                    : resetFeedback.type === 'pending'
                      ? 'text-muted-foreground'
                      : resetFeedback.type === 'warning'
                        ? 'text-warning'
                        : 'text-destructive'
                }`}
              >
                {resetFeedback.type === 'success' ? (
                  <Check size={13} className="shrink-0" />
                ) : resetFeedback.type === 'pending' ? (
                  <Loader2 size={13} className="shrink-0 animate-spin" />
                ) : (
                  <CircleAlert size={13} className="shrink-0" />
                )}
                <span>{resetFeedback.message}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => void resetNativeHost()}
              className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              disabled={isResetting || isAwaitingReconnect}
              aria-busy={isResetting || isAwaitingReconnect}
              aria-label={intl.formatMessage({
                id: 'native_host_reset_connection',
                defaultMessage: 'Reset connection'
              })}
            >
              <RefreshCw
                size={13}
                className={isResetting || isAwaitingReconnect ? 'animate-spin' : ''}
              />
              <span className="truncate">
                {intl.formatMessage({
                  id: 'native_host_reset_connection',
                  defaultMessage: 'Reset connection'
                })}
              </span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
