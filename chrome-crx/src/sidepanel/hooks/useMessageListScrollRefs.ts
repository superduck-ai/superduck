import { useMemo } from 'react';

export interface UseMessageListScrollRefsProps {
  scrollRefs: {
    lastAssistantMessage: React.RefObject<HTMLDivElement | null>;
    lastHumanMessage: React.RefObject<HTMLDivElement | null>;
  };
}

/**
 * useMessageListScrollRefs — 消息列表滚动 refs
 * 为 MessageList 创建稳定的滚动 refs 引用
 */
export function useMessageListScrollRefs({ scrollRefs }: UseMessageListScrollRefsProps) {
  return useMemo(
    () => ({
      lastAssistantMessage: scrollRefs.lastAssistantMessage,
      lastHumanMessage: scrollRefs.lastHumanMessage
    }),
    [scrollRefs.lastAssistantMessage, scrollRefs.lastHumanMessage]
  );
}
