import React, { useRef, useCallback, useLayoutEffect, forwardRef } from 'react';
import type { ScrollContainerHandle } from '@/sidepanel/components/ScrollContainer';

interface ScrollRefs {
  lastAssistantMessage: React.RefObject<HTMLDivElement | null>;
  lastHumanMessage: React.RefObject<HTMLDivElement | null>;
  chatInput?: React.RefObject<HTMLDivElement | null>;
  extras: React.RefObject<HTMLDivElement | null>;
  extraSpace: React.RefObject<HTMLDivElement | null>;
}

interface AutoScrollSpacerProps {
  scrollRefs: ScrollRefs;
  autoScrollRef: React.RefObject<ScrollContainerHandle | null>;
  messageCount: number;
  additionalBuffer?: number;
  parentContainerRef?: React.RefObject<HTMLDivElement | null>;
  disablePinToTop?: boolean;
  disableInitialScrollToBottom?: boolean;
  isStreaming?: boolean;
}

export const AutoScrollSpacer: React.FC<AutoScrollSpacerProps> = ({
  scrollRefs,
  autoScrollRef,
  messageCount,
  additionalBuffer = 0,
  parentContainerRef,
  disablePinToTop = false,
  disableInitialScrollToBottom = false,
  isStreaming = false
}) => {
  const prevCountRef = useRef(messageCount);

  const recalculateSpace = useCallback(() => {
    // During streaming, no spacer needed — content should sit right above the input
    if (isStreaming) {
      if (scrollRefs.extraSpace.current) {
        scrollRefs.extraSpace.current.style.height = '0px';
      }
      return;
    }

    const lastAssistantHeight = scrollRefs.lastAssistantMessage.current?.clientHeight || 0;
    const lastHumanHeight = scrollRefs.lastHumanMessage.current?.clientHeight || 0;
    const chatInputHeight = scrollRefs.chatInput?.current?.clientHeight || 0;
    const extrasHeight = scrollRefs.extras.current?.clientHeight || 0;
    const containerHeight =
      parentContainerRef?.current?.clientHeight ||
      autoScrollRef.current?.getScrollContainer()?.clientHeight ||
      window.innerHeight;
    const buffer = additionalBuffer || 62;

    const spaceNeeded = Math.max(
      containerHeight -
        lastHumanHeight -
        lastAssistantHeight -
        extrasHeight -
        chatInputHeight -
        buffer,
      0
    );

    if (scrollRefs.extraSpace.current) {
      scrollRefs.extraSpace.current.style.height = `${spaceNeeded}px`;
    }
  }, [
    scrollRefs.lastAssistantMessage,
    scrollRefs.lastHumanMessage,
    scrollRefs.chatInput,
    scrollRefs.extras,
    scrollRefs.extraSpace,
    autoScrollRef,
    parentContainerRef,
    additionalBuffer,
    isStreaming
  ]);

  useLayoutEffect(() => {
    if (prevCountRef.current !== messageCount) {
      recalculateSpace();
      if (!disablePinToTop) {
        autoScrollRef.current?.setPinToBottom(true);
        autoScrollRef.current?.scrollToBottom('smooth');
      }
    }
    prevCountRef.current = messageCount;
  }, [messageCount, recalculateSpace, autoScrollRef, disablePinToTop]);

  useLayoutEffect(() => {
    recalculateSpace();
  }, [isStreaming, recalculateSpace]);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      recalculateSpace();
    });

    [
      scrollRefs.lastAssistantMessage,
      scrollRefs.lastHumanMessage,
      scrollRefs.chatInput,
      scrollRefs.extras
    ].forEach((ref) => {
      if (ref?.current) observer.observe(ref.current);
    });

    window.addEventListener('resize', recalculateSpace);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', recalculateSpace);
    };
  }, [scrollRefs, recalculateSpace, messageCount]);

  useLayoutEffect(() => {
    if (!disableInitialScrollToBottom) {
      autoScrollRef.current?.setPinToBottom(true);
      autoScrollRef.current?.scrollToBottom('instant');
    }
  }, [autoScrollRef, disableInitialScrollToBottom]);

  return <div ref={scrollRefs.extraSpace} aria-hidden="true" />;
};

export const LastMessageSentinel = forwardRef<HTMLDivElement>((_props, ref) => (
  <div ref={ref} aria-hidden="true" className="h-px w-full pointer-events-none" />
));

LastMessageSentinel.displayName = 'LastMessageSentinel';
