import React from 'react';
import {
  type NativeHostIntl,
  type NativeHostResetFeedback,
  type NativeHostRuntimeStatus,
  getErrorMessage,
  isNativeHostReady,
  normalizeStatus
} from './nativeHostStatusView';

type NativeHostStatusResponse = {
  status?: unknown;
};

type NativeHostResetResponse = {
  success?: boolean;
  reconnecting?: boolean;
  status?: unknown;
  error?: string;
};

const POST_RESET_STATUS_POLL_DELAY_MS = 1_000;
const POST_RESET_STATUS_POLL_ATTEMPTS = 6;

export interface UseNativeHostStatusOptions {
  intl: NativeHostIntl;
  trackEvent: (event: string, properties?: any) => void;
}

export interface UseNativeHostStatusReturn {
  status: NativeHostRuntimeStatus | null;
  isRefreshing: boolean;
  isResetting: boolean;
  isAwaitingReconnect: boolean;
  resetFeedback: NativeHostResetFeedback | null;
  refreshStatus: () => Promise<void>;
  resetNativeHost: () => Promise<void>;
  clearResetFeedback: () => void;
}

export function useNativeHostStatus({
  intl,
  trackEvent
}: UseNativeHostStatusOptions): UseNativeHostStatusReturn {
  const reconnectPollTimerRef = React.useRef<number | null>(null);
  const reconnectPollResolveRef = React.useRef<(() => void) | null>(null);
  const requestIdRef = React.useRef(0);
  const [isRefreshing, setIsRefreshing] = React.useState(true);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isAwaitingReconnect, setIsAwaitingReconnect] = React.useState(false);
  const [status, setStatus] = React.useState<NativeHostRuntimeStatus | null>(null);
  const [resetFeedback, setResetFeedback] = React.useState<NativeHostResetFeedback | null>(null);

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

        if (isNativeHostReady(latestStatus)) {
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

  const clearResetFeedback = React.useCallback(() => {
    setResetFeedback(null);
  }, []);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    return () => {
      clearReconnectPollTimer();
    };
  }, [clearReconnectPollTimer]);

  return {
    status,
    isRefreshing,
    isResetting,
    isAwaitingReconnect,
    resetFeedback,
    refreshStatus,
    resetNativeHost,
    clearResetFeedback
  };
}
