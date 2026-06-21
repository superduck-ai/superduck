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
import { Tooltip } from '../Tooltip';

type NativeHostRuntimeStatus = {
  nativeHostInstalled?: boolean;
  mcpConnected?: boolean;
  connecting?: boolean;
  reconnecting?: boolean;
  error?: string;
};

type NativeHostStatusResponse = {
  status?: unknown;
};

type NativeHostResetResponse = {
  success?: boolean;
  reconnecting?: boolean;
  status?: unknown;
  error?: string;
};

type NativeHostStatusKind =
  | 'resetting'
  | 'waiting'
  | 'checking'
  | 'error'
  | 'connected'
  | 'hostReady'
  | 'bridge'
  | 'disconnected';

type NativeHostStatusView = {
  label: string;
  pill: string;
  dotClassName: string;
  iconClassName: string;
  pillClassName: string;
};

type NativeHostResetFeedback = {
  type: 'pending' | 'success' | 'warning' | 'error';
  message: string;
};

type NativeHostIntl = {
  formatMessage: (
    descriptor: { id: string; defaultMessage?: string },
    values?: Record<string, string | number | boolean | null | undefined>
  ) => string;
};

export interface NativeHostStatusButtonProps {
  intl: NativeHostIntl;
  onOpen?: () => void;
  trackEvent: (event: string, properties?: any) => void;
}

const CLI_SETUP_COMMANDS = ['npm install -g superduck-cli', 'superduck setup'] as const;
const CLI_SETUP_COMMAND_TEXT = CLI_SETUP_COMMANDS.join('\n');
const POST_RESET_STATUS_POLL_DELAY_MS = 1_000;
const POST_RESET_STATUS_POLL_ATTEMPTS = 6;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unable to check native host status.';
}

function normalizeStatus(status: unknown): NativeHostRuntimeStatus {
  if (!status || typeof status !== 'object') {
    return {
      nativeHostInstalled: false,
      mcpConnected: false
    };
  }

  const candidate = status as Record<string, unknown>;

  return {
    nativeHostInstalled: candidate.nativeHostInstalled === true,
    mcpConnected: candidate.mcpConnected === true,
    connecting: candidate.connecting === true,
    reconnecting: candidate.reconnecting === true,
    error: typeof candidate.error === 'string' ? candidate.error : undefined
  };
}

function getStatusKind(
  status: NativeHostRuntimeStatus | null,
  isRefreshing: boolean,
  isResetting: boolean,
  isAwaitingReconnect: boolean
): NativeHostStatusKind {
  if (isResetting) return 'resetting';
  if (isAwaitingReconnect) return 'waiting';
  if (!status && isRefreshing) return 'checking';
  if (status?.error) return 'error';
  if (status?.connecting || status?.reconnecting) return 'waiting';
  if (status?.nativeHostInstalled && status.mcpConnected) return 'connected';
  if (status?.nativeHostInstalled) return 'hostReady';
  if (status?.mcpConnected) return 'bridge';
  return 'disconnected';
}

function getStatusView(
  intl: NativeHostIntl,
  statusKind: NativeHostStatusKind
): NativeHostStatusView {
  switch (statusKind) {
    case 'resetting':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_resetting_label',
          defaultMessage: 'Resetting connection'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_resetting_pill',
          defaultMessage: 'Resetting'
        }),
        dotClassName: 'bg-text-400',
        iconClassName: 'bg-bg-200 text-text-300',
        pillClassName: 'bg-bg-200 text-text-300'
      };

    case 'waiting':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_waiting_label',
          defaultMessage: 'Waiting to connect'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_waiting_pill',
          defaultMessage: 'Waiting'
        }),
        dotClassName: 'bg-warning-100',
        iconClassName: 'bg-warning-900/40 text-warning-100',
        pillClassName: 'bg-warning-900/40 text-warning-100'
      };

    case 'checking':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_checking_label',
          defaultMessage: 'Checking'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_checking_pill',
          defaultMessage: 'Checking'
        }),
        dotClassName: 'bg-text-400',
        iconClassName: 'bg-bg-200 text-text-300',
        pillClassName: 'bg-bg-200 text-text-300'
      };

    case 'error':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_error_label',
          defaultMessage: 'Check failed'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_error_pill',
          defaultMessage: 'Needs attention'
        }),
        dotClassName: 'bg-danger-100',
        iconClassName: 'bg-danger-900/30 text-danger-100',
        pillClassName: 'bg-danger-900/30 text-danger-100'
      };

    case 'connected':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_connected_label',
          defaultMessage: 'Connected'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_connected_pill',
          defaultMessage: 'Connected'
        }),
        dotClassName: 'bg-accent-secondary-200',
        iconClassName: 'bg-accent-secondary-900/40 text-accent-secondary-200',
        pillClassName: 'bg-accent-secondary-900/40 text-accent-secondary-200'
      };

    case 'hostReady':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_host_ready_label',
          defaultMessage: 'Waiting'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_host_ready_pill',
          defaultMessage: 'Waiting'
        }),
        dotClassName: 'bg-warning-100',
        iconClassName: 'bg-warning-900/40 text-warning-100',
        pillClassName: 'bg-warning-900/40 text-warning-100'
      };

    case 'bridge':
      return {
        label: intl.formatMessage({
          id: 'native_host_status_bridge_label',
          defaultMessage: 'Partially connected'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_bridge_pill',
          defaultMessage: 'Partial'
        }),
        dotClassName: 'bg-warning-100',
        iconClassName: 'bg-warning-900/40 text-warning-100',
        pillClassName: 'bg-warning-900/40 text-warning-100'
      };

    case 'disconnected':
    default:
      return {
        label: intl.formatMessage({
          id: 'native_host_status_disconnected_label',
          defaultMessage: 'Disconnected'
        }),
        pill: intl.formatMessage({
          id: 'native_host_status_disconnected_pill',
          defaultMessage: 'Disconnected'
        }),
        dotClassName: 'bg-danger-100',
        iconClassName: 'bg-danger-900/30 text-danger-100',
        pillClassName: 'bg-danger-900/30 text-danger-100'
      };
  }
}

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

  if (statusKind === 'error' || statusKind === 'disconnected') {
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
  const reconnectPollTimerRef = React.useRef<number | null>(null);
  const reconnectPollResolveRef = React.useRef<(() => void) | null>(null);
  const requestIdRef = React.useRef(0);
  const dialogTitleId = React.useId();
  const dialogDescriptionId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(true);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isAwaitingReconnect, setIsAwaitingReconnect] = React.useState(false);
  const [status, setStatus] = React.useState<NativeHostRuntimeStatus | null>(null);
  const [resetFeedback, setResetFeedback] = React.useState<NativeHostResetFeedback | null>(null);
  const [copiedCommands, setCopiedCommands] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const statusKind = getStatusKind(status, isRefreshing, isResetting, isAwaitingReconnect);
  const statusView = getStatusView(intl, statusKind);
  const tooltipLabel = intl.formatMessage(
    {
      id: 'native_host_status_tooltip',
      defaultMessage: 'Browser control: {status}'
    },
    { status: statusView.label }
  );

  const clearReconnectPollTimer = React.useCallback(() => {
    if (reconnectPollTimerRef.current != null) {
      window.clearTimeout(reconnectPollTimerRef.current);
      reconnectPollTimerRef.current = null;
    }
    reconnectPollResolveRef.current?.();
    reconnectPollResolveRef.current = null;
  }, []);

  const waitForReconnectPollDelay = React.useCallback(async () => {
    clearReconnectPollTimer();
    await new Promise<void>((resolve) => {
      reconnectPollResolveRef.current = resolve;
      reconnectPollTimerRef.current = window.setTimeout(() => {
        reconnectPollTimerRef.current = null;
        reconnectPollResolveRef.current = null;
        resolve();
      }, POST_RESET_STATUS_POLL_DELAY_MS);
    });
  }, [clearReconnectPollTimer]);

  const readNativeHostStatus = React.useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Chrome runtime is not available.');
    }

    const response = (await chrome.runtime.sendMessage({
      type: 'check_native_host_status'
    })) as NativeHostStatusResponse | undefined;

    return normalizeStatus(response?.status);
  }, []);

  const refreshStatus = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    clearReconnectPollTimer();
    setIsAwaitingReconnect(false);
    setIsRefreshing(true);

    try {
      const nextStatus = await readNativeHostStatus();
      if (requestIdRef.current !== requestId) return;

      setStatus(nextStatus);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;

      setStatus({
        nativeHostInstalled: false,
        mcpConnected: false,
        error: getErrorMessage(err)
      });
    } finally {
      if (requestIdRef.current === requestId) {
        setIsRefreshing(false);
      }
    }
  }, [clearReconnectPollTimer, readNativeHostStatus]);

  const pollPostResetStatus = React.useCallback(
    async (requestId: number) => {
      let latestStatus: NativeHostRuntimeStatus | null = null;

      for (let attempt = 1; attempt <= POST_RESET_STATUS_POLL_ATTEMPTS; attempt++) {
        await waitForReconnectPollDelay();
        if (requestIdRef.current !== requestId) return;

        try {
          latestStatus = await readNativeHostStatus();
        } catch (err) {
          if (attempt < POST_RESET_STATUS_POLL_ATTEMPTS) continue;

          if (requestIdRef.current !== requestId) return;
          setIsAwaitingReconnect(false);
          setStatus({
            nativeHostInstalled: false,
            mcpConnected: false,
            error: getErrorMessage(err)
          });
          setResetFeedback({
            type: 'error',
            message: intl.formatMessage({
              id: 'native_host_reset_failed',
              defaultMessage: "SuperDuck couldn't reset the local connection."
            })
          });
          void trackEvent('superduck.sidebar.native_host_reset_failed', {
            error: getErrorMessage(err)
          });
          return;
        }

        if (requestIdRef.current !== requestId) return;
        setStatus(latestStatus);

        if (latestStatus.nativeHostInstalled && latestStatus.mcpConnected) {
          setIsAwaitingReconnect(false);
          setResetFeedback({
            type: 'success',
            message: intl.formatMessage({
              id: 'native_host_reset_success',
              defaultMessage: 'Connection reset. SuperDuck is connected.'
            })
          });
          void trackEvent('superduck.sidebar.native_host_reset_succeeded', { attempt });
          return;
        }
      }

      if (requestIdRef.current !== requestId) return;
      setIsAwaitingReconnect(false);
      setResetFeedback({
        type: 'warning',
        message: intl.formatMessage({
          id: 'native_host_reset_still_disconnected',
          defaultMessage: "Reset finished, but SuperDuck still can't connect."
        })
      });
      void trackEvent('superduck.sidebar.native_host_reset_finished_disconnected', {
        nativeHostInstalled: Boolean(latestStatus?.nativeHostInstalled),
        mcpConnected: Boolean(latestStatus?.mcpConnected)
      });
    },
    [intl, readNativeHostStatus, trackEvent, waitForReconnectPollDelay]
  );

  const resetNativeHost = React.useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    clearReconnectPollTimer();
    setIsResetting(true);
    setIsAwaitingReconnect(false);
    setIsRefreshing(false);
    setResetFeedback(null);

    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        throw new Error('Chrome runtime is not available.');
      }

      const response = (await chrome.runtime.sendMessage({
        type: 'reset_native_host_connection'
      })) as NativeHostResetResponse | undefined;

      if (requestIdRef.current !== requestId) return;

      const nextStatus = normalizeStatus(response?.status);
      const resetStarted = response?.success === true;
      const pendingStatus = resetStarted
        ? {
            nativeHostInstalled: nextStatus.nativeHostInstalled || response?.reconnecting === true,
            mcpConnected: false,
            reconnecting: true
          }
        : nextStatus;
      setStatus(pendingStatus);

      if (resetStarted) {
        setIsAwaitingReconnect(true);
        setResetFeedback({
          type: 'pending',
          message: intl.formatMessage({
            id: 'native_host_reset_waiting',
            defaultMessage: 'Connection reset. Waiting for SuperDuck to reconnect.'
          })
        });
        void trackEvent('superduck.sidebar.native_host_reset_started');
        void pollPostResetStatus(requestId);
        return;
      }

      setIsAwaitingReconnect(false);
      setResetFeedback({
        type: response?.error ? 'error' : 'warning',
        message: response?.error
          ? intl.formatMessage({
              id: 'native_host_reset_failed',
              defaultMessage: "SuperDuck couldn't reset the local connection."
            })
          : intl.formatMessage({
              id: 'native_host_reset_still_disconnected',
              defaultMessage: "Reset finished, but SuperDuck still can't connect."
            })
      });
      void trackEvent('superduck.sidebar.native_host_reset_finished_disconnected', {
        nativeHostInstalled: Boolean(nextStatus.nativeHostInstalled),
        mcpConnected: Boolean(nextStatus.mcpConnected),
        error: response?.error
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;

      setStatus({
        nativeHostInstalled: false,
        mcpConnected: false,
        error: getErrorMessage(err)
      });
      setResetFeedback({
        type: 'error',
        message: intl.formatMessage({
          id: 'native_host_reset_failed',
          defaultMessage: "SuperDuck couldn't reset the local connection."
        })
      });
      void trackEvent('superduck.sidebar.native_host_reset_failed', {
        error: getErrorMessage(err)
      });
    } finally {
      if (requestIdRef.current === requestId) {
        setIsResetting(false);
        setIsRefreshing(false);
      }
    }
  }, [clearReconnectPollTimer, intl, pollPostResetStatus, trackEvent]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  React.useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      clearReconnectPollTimer();
    };
  }, [clearReconnectPollTimer]);

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
    <div ref={rootRef} className="relative inline-flex h-7 w-7 items-center justify-center">
      <Tooltip tooltipContent={tooltipLabel} side="bottom" showTooltip={!isOpen}>
        <button
          ref={triggerButtonRef}
          type="button"
          className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            isOpen ? 'bg-bg-300 text-text-100' : 'text-text-300 hover:bg-bg-300 hover:text-text-100'
          }`}
          onClick={() => {
            setIsOpen((value) => {
              const nextValue = !value;
              if (nextValue) {
                onOpen?.();
                setResetFeedback(null);
                void trackEvent('superduck.sidebar.native_host_status_opened', {
                  nativeHostInstalled: Boolean(status?.nativeHostInstalled),
                  mcpConnected: Boolean(status?.mcpConnected)
                });
                void refreshStatus();
              }
              return nextValue;
            });
          }}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={intl.formatMessage(
            {
              id: 'native_host_status_button_aria',
              defaultMessage: 'Browser control status: {status}'
            },
            { status: statusView.label }
          )}
          title={tooltipLabel}
        >
          <NativeHostGlyph statusKind={statusKind} size={14} className="shrink-0" />
          <span
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-2 ring-bg-000 ${statusView.dotClassName}`}
          />
        </button>
      </Tooltip>

      {isOpen ? (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-[328px] max-w-[calc(100vw-2rem)] rounded-xl border-0.5 border-border-200 bg-bg-000 p-3 text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] backdrop-blur-xl"
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
                <h2 id={dialogTitleId} className="truncate text-sm font-medium text-text-100">
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
              <p id={dialogDescriptionId} className="mt-1 text-xs leading-5 text-text-300">
                {intl.formatMessage({
                  id: 'native_host_product_description',
                  defaultMessage: 'Use SuperDuck to let agents control Chrome.'
                })}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border-0.5 border-border-200 bg-bg-100 p-2.5">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="shrink-0 text-text-300" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-100">
                  {intl.formatMessage({
                    id: 'native_host_cli_setup_title',
                    defaultMessage: 'Install CLI'
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyCommands()}
                className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
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
            <div className="mt-2 rounded-md bg-bg-000 px-2 py-1.5">
              {CLI_SETUP_COMMANDS.map((command) => (
                <code
                  key={command}
                  className="block min-w-0 truncate font-mono text-[11px] leading-5 text-text-100"
                >
                  {command}
                </code>
              ))}
            </div>
          </div>

          {resetFeedback ? (
            <div
              className="mt-3 border-t border-border-200/70 pt-3"
              role="status"
              aria-live="polite"
            >
              <p
                className={`inline-flex items-center gap-1.5 text-xs leading-5 ${
                  resetFeedback.type === 'success'
                    ? 'text-accent-secondary-200'
                    : resetFeedback.type === 'pending'
                      ? 'text-text-300'
                      : resetFeedback.type === 'warning'
                        ? 'text-warning-100'
                        : 'text-danger-100'
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
              className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-bg-200 px-2 text-xs font-medium text-text-100 transition-colors hover:bg-bg-300 disabled:opacity-60"
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
        </div>
      ) : null}
    </div>
  );
}
