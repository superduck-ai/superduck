export interface MessageLimitState {
  type: 'within_limit' | 'approaching_limit' | 'exceeded_limit';
  percentUsed?: number;
  resetsAt?: number;
  windows?: Record<string, { status: string; resets_at?: number }>;
  remaining?: number;
  overageDisabledReason?: string;
}

export interface AccountEligibilityInfo {
  hasPro: boolean;
  hasMax: boolean;
  orgType: string;
  rateLimitTier: string;
}

export interface MessageLimitBannerState {
  text: string;
  isBlocking: boolean;
  dismissible: boolean;
  actionLabel?: string;
  actionUrl?: string;
  tone: 'warning' | 'danger';
}

export const CONTEXT_WINDOW = 200000;
export const MAX_TOKENS = 10000;

export function calculateMessageLimitFromUsage(
  usage: any,
  contextWindow: number = CONTEXT_WINDOW
): MessageLimitState {
  const inputTokens = usage?.input_tokens || 0;
  const outputTokens = usage?.output_tokens || 0;
  const cacheTokens =
    (usage?.cache_creation_input_tokens || 0) + (usage?.cache_read_input_tokens || 0);
  const total = inputTokens + outputTokens + cacheTokens;
  const budget = Math.max(1, contextWindow - MAX_TOKENS);
  const percentUsed = Math.round((total / budget) * 100);
  if (percentUsed >= 95) {
    return { type: 'exceeded_limit', percentUsed };
  }
  if (percentUsed >= 90) {
    return { type: 'approaching_limit', percentUsed };
  }
  return { type: 'within_limit', percentUsed };
}

export function parseMessageLimit(value: unknown): MessageLimitState | null {
  if (!value || typeof value !== 'object') return null;
  const rawType = (value as any).type;
  if (
    rawType !== 'within_limit' &&
    rawType !== 'approaching_limit' &&
    rawType !== 'exceeded_limit'
  ) {
    return null;
  }
  return {
    type: rawType,
    percentUsed:
      typeof (value as any).percentUsed === 'number' ? (value as any).percentUsed : undefined,
    resetsAt: typeof (value as any).resetsAt === 'number' ? (value as any).resetsAt : undefined,
    remaining: typeof (value as any).remaining === 'number' ? (value as any).remaining : undefined,
    windows:
      (value as any).windows && typeof (value as any).windows === 'object'
        ? (value as any).windows
        : undefined,
    overageDisabledReason:
      typeof (value as any).overageDisabledReason === 'string'
        ? (value as any).overageDisabledReason
        : undefined
  };
}

export function parseRateLimitFromError(error: unknown): MessageLimitState | null {
  let raw = '';
  if (typeof error === 'string') {
    raw = error;
  } else if (error instanceof Error) {
    raw = error.message;
  } else {
    try {
      raw = JSON.stringify(error);
    } catch {
      raw = '';
    }
  }
  if (!raw) return null;

  const parseCandidate = (candidate: string): MessageLimitState | null => {
    try {
      const parsed = JSON.parse(candidate);
      const rateLimit = parseMessageLimit(parsed);
      if (rateLimit) return rateLimit;
      if (parsed?.error?.message && typeof parsed.error.message === 'string') {
        return parseCandidate(parsed.error.message);
      }
      if (parsed?.message && typeof parsed.message === 'string') {
        return parseCandidate(parsed.message);
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(raw);
  if (direct) return direct;

  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    return parseCandidate(raw.slice(jsonStart));
  }
  return null;
}

export function parseRateLimitHeaders(headers: Record<string, string>): MessageLimitState | null {
  const unified = headers['anthropic-ratelimit-unified-status'];
  if (!unified || unified === 'allowed') return { type: 'within_limit' };

  const windows: any = {};
  const parseWindow = (key: string) => {
    const status = headers[`anthropic-ratelimit-unified-${key}-status`];
    const reset = headers[`anthropic-ratelimit-unified-${key}-reset`];
    if (status) {
      windows[key] = {
        status:
          status === 'rejected'
            ? 'exceeded_limit'
            : status === 'allowed_warning'
              ? 'approaching_limit'
              : 'within_limit',
        resets_at: reset ? parseInt(reset, 10) : Math.floor(Date.now() / 1000)
      };
    }
  };
  parseWindow('5h');
  parseWindow('7d');
  parseWindow('7d_opus');
  parseWindow('overage');

  const resetHeader = headers['anthropic-ratelimit-unified-reset'];
  const resetsAt = resetHeader ? parseInt(resetHeader, 10) : Math.floor(Date.now() / 1000) + 3600;
  const type =
    unified === 'rejected'
      ? 'exceeded_limit'
      : unified === 'allowed_warning'
        ? 'approaching_limit'
        : 'within_limit';

  const result: MessageLimitState =
    type === 'within_limit'
      ? { type: 'within_limit', windows }
      : type === 'approaching_limit'
        ? { type: 'approaching_limit', resetsAt, windows, remaining: 5 }
        : { type: 'exceeded_limit', resetsAt, windows };

  const overageReason = headers['anthropic-ratelimit-unified-overage-disabled-reason'];
  if (overageReason && result.type !== 'within_limit') {
    result.overageDisabledReason = overageReason;
  }
  return result;
}

export function shouldUpdateMessageLimit(
  current: MessageLimitState,
  next: MessageLimitState
): boolean {
  if (current.type !== next.type) return true;
  if (next.type !== 'within_limit' && current.type !== 'within_limit') {
    if (current.resetsAt !== next.resetsAt) return true;
    if (current.overageDisabledReason !== next.overageDisabledReason) return true;
    const curOvg = (current as any).windows?.overage?.status;
    const nextOvg = (next as any).windows?.overage?.status;
    if (curOvg !== nextOvg) return true;
    if (
      current.type === 'approaching_limit' &&
      next.type === 'approaching_limit' &&
      current.remaining !== next.remaining
    ) {
      return true;
    }
  }
  return false;
}

function formatResetTime(resetSeconds: number, windowName?: string | null) {
  const date = new Date(resetSeconds * 1000);
  if (windowName === '7d' || windowName === '7d_opus') {
    return date.toLocaleString(undefined, {
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  return date.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function pickLimitWindow(messageLimit: MessageLimitState, currentModel: string) {
  const windows = messageLimit.windows || {};
  const isOpus = currentModel.startsWith('claude-opus');
  const is5hExceeded = windows['5h']?.status === 'exceeded_limit';
  const is7dExceeded = windows['7d']?.status === 'exceeded_limit';
  const is7dOpusExceeded = isOpus && windows['7d_opus']?.status === 'exceeded_limit';
  const isOverageExceeded = windows.overage?.status === 'exceeded_limit';

  if ((is5hExceeded || is7dExceeded || is7dOpusExceeded) && isOverageExceeded) {
    return {
      name: 'overage',
      status: windows.overage.status,
      resetsAt: windows.overage.resets_at
    };
  }

  const exceededCandidates: Array<{ name: string; resetTime: number }> = [];
  if (is5hExceeded && typeof windows['5h']?.resets_at === 'number') {
    exceededCandidates.push({ name: '5h', resetTime: windows['5h'].resets_at });
  }
  if (is7dExceeded && typeof windows['7d']?.resets_at === 'number') {
    exceededCandidates.push({ name: '7d', resetTime: windows['7d'].resets_at });
  }
  if (is7dOpusExceeded && typeof windows['7d_opus']?.resets_at === 'number') {
    exceededCandidates.push({ name: '7d_opus', resetTime: windows['7d_opus'].resets_at });
  }

  if (exceededCandidates.length > 1) {
    const latestReset = exceededCandidates.reduce((latest, current) =>
      current.resetTime > latest.resetTime ? current : latest
    );
    return { name: latestReset.name, status: 'exceeded_limit', resetsAt: latestReset.resetTime };
  }

  if (is7dOpusExceeded) {
    return {
      name: '7d_opus',
      status: windows['7d_opus']?.status,
      resetsAt: windows['7d_opus']?.resets_at
    };
  }
  if (is7dExceeded) {
    return { name: '7d', status: windows['7d']?.status, resetsAt: windows['7d']?.resets_at };
  }
  if (is5hExceeded || windows['5h']?.status === 'approaching_limit') {
    return { name: '5h', status: windows['5h']?.status, resetsAt: windows['5h']?.resets_at };
  }
  if (windows['7d']?.status === 'approaching_limit') {
    return { name: '7d', status: windows['7d']?.status, resetsAt: windows['7d']?.resets_at };
  }
  if (windows.overage?.status === 'approaching_limit') {
    return { name: 'overage', status: windows.overage.status, resetsAt: windows.overage.resets_at };
  }
  return null;
}

export function getMessageLimitBannerState(
  messageLimit: MessageLimitState,
  currentModel: string,
  accountInfo: AccountEligibilityInfo | null
): MessageLimitBannerState | null {
  if (messageLimit.type === 'within_limit') {
    return null;
  }

  const windowLabelMap: Record<string, string> = {
    '5h': '5-hour',
    '7d': 'Weekly',
    '7d_opus': 'Deep'
  };
  const selectedWindow = pickLimitWindow(messageLimit, currentModel);
  const selectedWindowName = selectedWindow?.name || '';
  const selectedWindowLabel = selectedWindowName
    ? windowLabelMap[selectedWindowName] || null
    : null;
  const overageReason = messageLimit.overageDisabledReason || '';
  const hasBlockingOverageReason = Boolean(
    overageReason &&
    overageReason !== 'overage_not_provisioned' &&
    overageReason !== 'org_level_disabled'
  );
  const hasOverageWindow = Boolean(messageLimit.windows?.overage);
  const isOverageScenario = hasOverageWindow || hasBlockingOverageReason;
  const isOverageBlocking =
    messageLimit.windows?.overage?.status === 'exceeded_limit' || hasBlockingOverageReason;
  const isOverageActive = isOverageScenario && !isOverageBlocking;

  const isHardBlocking =
    messageLimit.type === 'exceeded_limit' ||
    (messageLimit.type === 'approaching_limit' && messageLimit.remaining === 0) ||
    isOverageBlocking;

  const isTeamOrg =
    accountInfo?.orgType === 'claude_team' || accountInfo?.orgType === 'claude_enterprise';
  const isMax20x = accountInfo?.rateLimitTier === 'default_claude_max_20x';
  const canUpgrade = !isTeamOrg && !isMax20x;
  const upgradeUrl = accountInfo?.hasPro
    ? 'https://superduck-ai.github.io/superduck/'
    : 'https://superduck-ai.github.io/superduck/';
  const upgradeLabel = accountInfo?.hasPro ? 'Subscribe to Max' : 'Upgrade';
  const settingsUsageUrl = 'https://superduck-ai.github.io/superduck/';
  const settingsBillingUrl = 'https://superduck-ai.github.io/superduck/';

  if (isOverageScenario) {
    if (isOverageBlocking) {
      if (isTeamOrg) {
        return {
          text: 'Limit reached - contact an admin to keep working',
          isBlocking: true,
          dismissible: false,
          tone: 'danger'
        };
      }
      if (overageReason === 'out_of_credits') {
        return {
          text: 'Wallet empty',
          isBlocking: true,
          dismissible: false,
          actionLabel: 'Add credits',
          actionUrl: settingsBillingUrl,
          tone: 'danger'
        };
      }
      return {
        text: 'Spend limit reached',
        isBlocking: true,
        dismissible: false,
        actionLabel: 'Manage',
        actionUrl: settingsUsageUrl,
        tone: 'danger'
      };
    }

    if (isOverageActive && typeof selectedWindow?.resetsAt === 'number') {
      const resetText = formatResetTime(selectedWindow.resetsAt, selectedWindowName || null);
      const label = selectedWindowLabel ? `${selectedWindowLabel} limit` : 'Limit';
      return {
        text: `${label} resets ${resetText} · continuing with extra usage`,
        isBlocking: false,
        dismissible: true,
        tone: 'warning'
      };
    }
  }

  if (isHardBlocking) {
    const reset = selectedWindow?.resetsAt || messageLimit.resetsAt;
    if (typeof reset !== 'number') {
      return {
        text: 'Usage limit reached',
        isBlocking: true,
        dismissible: false,
        tone: 'danger'
      };
    }

    const resetText = formatResetTime(reset, selectedWindowName || null);
    if (selectedWindowLabel) {
      if (isTeamOrg) {
        return {
          text: `${selectedWindowLabel} limit resets ${resetText} - contact an admin to keep working`,
          isBlocking: true,
          dismissible: false,
          tone: 'danger'
        };
      }

      const canEnableOverages =
        isMax20x &&
        (overageReason === 'overage_not_provisioned' || overageReason === 'org_level_disabled');
      return {
        text: `${selectedWindowLabel} limit reached · resets ${resetText}`,
        isBlocking: true,
        dismissible: false,
        ...(canEnableOverages
          ? { actionLabel: 'Keep working', actionUrl: settingsUsageUrl }
          : canUpgrade
            ? { actionLabel: upgradeLabel, actionUrl: upgradeUrl }
            : {}),
        tone: 'danger'
      };
    }

    return {
      text: `Usage limit reached · resets ${resetText}`,
      isBlocking: true,
      dismissible: false,
      tone: 'danger'
    };
  }

  if (selectedWindowName === '5h') {
    return {
      text: 'Approaching 5-hour limit',
      isBlocking: false,
      dismissible: true,
      ...(canUpgrade ? { actionLabel: upgradeLabel, actionUrl: upgradeUrl } : {}),
      tone: 'warning'
    };
  }
  if (selectedWindowName === '7d' || selectedWindowName === '7d_opus') {
    return {
      text: 'Approaching weekly limit',
      isBlocking: false,
      dismissible: true,
      ...(canUpgrade ? { actionLabel: upgradeLabel, actionUrl: upgradeUrl } : {}),
      tone: 'warning'
    };
  }
  if (typeof messageLimit.remaining === 'number') {
    return {
      text:
        messageLimit.remaining === 1
          ? 'You have 1 message left before hitting usage limits.'
          : `You have ${messageLimit.remaining} messages left before hitting usage limits.`,
      isBlocking: false,
      dismissible: true,
      tone: 'warning'
    };
  }

  return {
    text: 'Usage limit warning',
    isBlocking: false,
    dismissible: true,
    tone: 'warning'
  };
}
