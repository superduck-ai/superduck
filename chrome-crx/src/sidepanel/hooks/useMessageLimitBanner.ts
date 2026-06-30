import { useMemo } from 'react';
import {
  getMessageLimitBannerState,
  type MessageLimitBannerState,
  type MessageLimitState
} from '../conversation/messageLimits';

export interface UseMessageLimitBannerProps {
  messageLimit: MessageLimitState;
  selectedModel: string;
}

/**
 * useMessageLimitBanner — 消息限制横幅
 * 当消息数量超过限制时显示横幅
 */
export function useMessageLimitBanner({ messageLimit, selectedModel }: UseMessageLimitBannerProps) {
  return useMemo(() => {
    return getMessageLimitBannerState(messageLimit, selectedModel);
  }, [messageLimit, selectedModel]);
}

// Re-export for useActiveBanner
export type { MessageLimitBannerState };
