export type NativeHostRuntimeStatus = {
  nativeHostInstalled?: boolean;
  mcpConnected?: boolean;
  connecting?: boolean;
  reconnecting?: boolean;
  error?: string;
};

export type NativeHostStatusKind =
  | 'resetting'
  | 'waiting'
  | 'checking'
  | 'error'
  | 'connected'
  | 'hostReady'
  | 'bridge'
  | 'disconnected';

export type NativeHostStatusView = {
  label: string;
  pill: string;
  dotClassName: string;
  iconClassName: string;
  pillClassName: string;
};

export type NativeHostResetFeedback = {
  type: 'pending' | 'success' | 'warning' | 'error';
  message: string;
};

export type NativeHostIntl = {
  formatMessage: (
    descriptor: { id: string; defaultMessage?: string },
    values?: Record<string, string | number | boolean | null | undefined>
  ) => string;
};

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unable to check native host status.';
}

export function normalizeStatus(status: unknown): NativeHostRuntimeStatus {
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

export function getStatusKind(
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

export function getStatusView(
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
        dotClassName: 'bg-text-400',
        iconClassName: 'bg-bg-200 text-text-300',
        pillClassName: 'bg-bg-200 text-text-300'
      };
  }
}
