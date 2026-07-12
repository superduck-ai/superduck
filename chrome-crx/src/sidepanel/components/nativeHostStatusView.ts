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

export function isNativeHostReady(status: NativeHostRuntimeStatus | null): boolean {
  return (
    status?.nativeHostInstalled === true &&
    status.connecting !== true &&
    status.reconnecting !== true
  );
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
  if (isNativeHostReady(status)) return 'connected';
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
        dotClassName: 'bg-muted-foreground',
        iconClassName: 'bg-muted text-muted-foreground',
        pillClassName: 'bg-muted text-muted-foreground'
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
        dotClassName: 'bg-warning',
        iconClassName: 'bg-warning/10 text-warning',
        pillClassName: 'bg-warning/10 text-warning'
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
        dotClassName: 'bg-muted-foreground',
        iconClassName: 'bg-muted text-muted-foreground',
        pillClassName: 'bg-muted text-muted-foreground'
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
        dotClassName: 'bg-destructive',
        iconClassName: 'bg-destructive/10 text-destructive',
        pillClassName: 'bg-destructive/10 text-destructive'
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
        dotClassName: 'bg-success',
        iconClassName: 'bg-success/10 text-success',
        pillClassName: 'bg-success/10 text-success'
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
        dotClassName: 'bg-warning',
        iconClassName: 'bg-warning/10 text-warning',
        pillClassName: 'bg-warning/10 text-warning'
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
        dotClassName: 'bg-muted-foreground',
        iconClassName: 'bg-muted text-muted-foreground',
        pillClassName: 'bg-muted text-muted-foreground'
      };
  }
}
