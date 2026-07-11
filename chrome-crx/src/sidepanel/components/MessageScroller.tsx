import React, {
  useRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useState,
  useEffect
} from 'react';
import { useIntl } from 'react-intl';
import { ArrowDown } from 'lucide-react';
import { cn, useComposedRefs } from '@/components/ui';

export interface ScrollContainerHandle {
  getScrollContainer: () => HTMLDivElement | null;
  scrollToBottom: (behavior?: ScrollBehavior, options?: { onlyIfPinned?: boolean }) => void;
  setPinToBottom: (pinned: boolean) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
}

export interface MessageScrollerProps {
  children: React.ReactNode;
  parentClassName?: string;
  innerClassName?: string;
  isStreaming?: boolean;
  hideScrollButton?: boolean;
  ref?: React.Ref<ScrollContainerHandle>;
  pinToBottomConfig?: {
    disabled: boolean;
    initialValue: boolean;
  };
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function MessageScroller({
  ref,
  children,
  parentClassName,
  innerClassName,
  isStreaming = false,
  hideScrollButton = false,
  pinToBottomConfig = { disabled: false, initialValue: true },
  containerRef
}: MessageScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(containerRef?.current || null);
  const composedRef = useComposedRefs(containerRef as React.Ref<HTMLDivElement>, scrollRef);
  const innerRef = useRef<HTMLDivElement>(null);

  const [isPinned, setIsPinned] = useState(pinToBottomConfig.initialValue);
  const isPinnedRef = useRef(isPinned);
  const programmaticScrollRef = useRef(false);
  const programmaticReleaseTimerRef = useRef<number | null>(null);
  const wheelGestureActiveRef = useRef(false);
  const wheelUpDistanceRef = useRef(0);
  const wheelStartScrollTopRef = useRef<number | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const wheelResetTimerRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);

  const intl = useIntl();

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  const getScrollContainer = useCallback(() => scrollRef.current, []);

  const clearWheelGesture = useCallback(() => {
    if (wheelSettleTimerRef.current !== null) {
      window.clearTimeout(wheelSettleTimerRef.current);
      wheelSettleTimerRef.current = null;
    }
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = null;
    }
    wheelGestureActiveRef.current = false;
    wheelUpDistanceRef.current = 0;
    wheelStartScrollTopRef.current = null;
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto', options?: { onlyIfPinned?: boolean }) => {
      if (!scrollRef.current) return;
      if (options?.onlyIfPinned && !isPinnedRef.current) return;

      programmaticScrollRef.current = true;
      if (programmaticReleaseTimerRef.current !== null) {
        window.clearTimeout(programmaticReleaseTimerRef.current);
      }
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
      programmaticReleaseTimerRef.current = window.setTimeout(
        () => {
          programmaticScrollRef.current = false;
          programmaticReleaseTimerRef.current = null;
        },
        behavior === 'smooth' ? 400 : 80
      );
    },
    []
  );

  const setPinToBottom = useCallback(
    (pinned: boolean) => {
      if (pinned) {
        clearWheelGesture();
      }
      setIsPinned(pinned);
      isPinnedRef.current = pinned;
    },
    [clearWheelGesture]
  );

  const releasePinForLayoutChange = useCallback(() => {
    clearWheelGesture();
    programmaticScrollRef.current = false;
    if (programmaticReleaseTimerRef.current !== null) {
      window.clearTimeout(programmaticReleaseTimerRef.current);
      programmaticReleaseTimerRef.current = null;
    }
    setIsPinned(false);
    isPinnedRef.current = false;
  }, [clearWheelGesture]);

  useImperativeHandle(
    ref,
    () => ({
      getScrollContainer,
      scrollToBottom,
      setPinToBottom,
      innerRef
    }),
    [getScrollContainer, scrollToBottom, setPinToBottom]
  );

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleReleasePinForLayoutChange = () => releasePinForLayoutChange();

    const handleScroll = () => {
      const { scrollHeight, scrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom <= 8;

      // 1. 如果是程序触发的滚动
      if (programmaticScrollRef.current) {
        if (isAtBottom) {
          programmaticScrollRef.current = false;
          setIsPinned(true);
          isPinnedRef.current = true;
        }
        lastScrollTopRef.current = scrollTop;
        return;
      }

      // 2. 如果是用户手动滚动
      const isScrollingUp = scrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      if (isAtBottom) {
        setIsPinned(true);
        isPinnedRef.current = true;
      } else if (wheelGestureActiveRef.current) {
        return;
      } else if (distanceFromBottom > 50 && isScrollingUp) {
        setIsPinned(false);
        isPinnedRef.current = false;
      }
    };

    container.addEventListener('superduck:release-pin', handleReleasePinForLayoutChange);
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('superduck:release-pin', handleReleasePinForLayoutChange);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [releasePinForLayoutChange]);

  // 用户手势打断逻辑
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const clearProgrammaticScroll = () => {
      programmaticScrollRef.current = false;
      if (programmaticReleaseTimerRef.current !== null) {
        window.clearTimeout(programmaticReleaseTimerRef.current);
        programmaticReleaseTimerRef.current = null;
      }
    };

    const scheduleWheelSettle = () => {
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
      }

      wheelSettleTimerRef.current = window.setTimeout(() => {
        wheelSettleTimerRef.current = null;

        const { scrollHeight, scrollTop, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const observedUpDistance =
          wheelStartScrollTopRef.current === null ? 0 : wheelStartScrollTopRef.current - scrollTop;
        const shouldLockFromWheel = wheelUpDistanceRef.current > 50 || observedUpDistance > 50;

        if (shouldLockFromWheel) {
          setIsPinned(false);
          isPinnedRef.current = false;
          wheelGestureActiveRef.current = false;
          return;
        }

        if (distanceFromBottom <= 8) {
          setIsPinned(true);
          isPinnedRef.current = true;
          return;
        }

        if (isPinnedRef.current) {
          scrollToBottom('auto', { onlyIfPinned: true });
        }
      }, 80);
    };

    const handleWheel = (event: WheelEvent) => {
      clearProgrammaticScroll();
      wheelGestureActiveRef.current = true;
      if (wheelStartScrollTopRef.current === null) {
        wheelStartScrollTopRef.current = container.scrollTop;
      }

      if (event.deltaY < 0) {
        wheelUpDistanceRef.current += Math.abs(event.deltaY);
        if (wheelUpDistanceRef.current > 50) {
          setIsPinned(false);
          isPinnedRef.current = false;
          wheelGestureActiveRef.current = false;
        }
      } else if (event.deltaY > 0) {
        wheelUpDistanceRef.current = 0;
      }

      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
      wheelResetTimerRef.current = window.setTimeout(() => {
        wheelGestureActiveRef.current = false;
        wheelUpDistanceRef.current = 0;
        wheelStartScrollTopRef.current = null;
        wheelResetTimerRef.current = null;
      }, 180);

      scheduleWheelSettle();
    };

    const handleTouchMove = () => {
      clearProgrammaticScroll();
      wheelGestureActiveRef.current = false;
      wheelUpDistanceRef.current = 0;
      wheelStartScrollTopRef.current = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchmove', handleTouchMove);
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = null;
      }
      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
        wheelResetTimerRef.current = null;
      }
    };
  }, [scrollToBottom]);

  useEffect(
    () => () => {
      if (programmaticReleaseTimerRef.current !== null) {
        window.clearTimeout(programmaticReleaseTimerRef.current);
      }
    },
    []
  );

  // MutationObserver & ResizeObserver 结合跟滚限频
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    let rafId: number | null = null;
    let lastScrollHeight = container.scrollHeight;
    let lastClientHeight = container.clientHeight;

    const syncScrollableState = () => {
      const nextHasScrollableContent = container.scrollHeight > container.clientHeight + 8;
      setHasScrollableContent((current) =>
        current === nextHasScrollableContent ? current : nextHasScrollableContent
      );
    };

    const triggerScroll = () => {
      const newScrollHeight = container.scrollHeight;
      const newClientHeight = container.clientHeight;
      syncScrollableState();
      if (newScrollHeight !== lastScrollHeight || newClientHeight !== lastClientHeight) {
        lastScrollHeight = newScrollHeight;
        lastClientHeight = newClientHeight;
        const suppressAutoStickUntil = Number(
          container.dataset.superduckSuppressAutoStickUntil ?? 0
        );
        const shouldSuppressAutoStick =
          Number.isFinite(suppressAutoStickUntil) && performance.now() < suppressAutoStickUntil;

        if (isPinnedRef.current && !shouldSuppressAutoStick) {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            scrollToBottom('auto', { onlyIfPinned: true });
          });
        }
      }
    };

    syncScrollableState();

    const mutationObserver = new MutationObserver(triggerScroll);
    mutationObserver.observe(inner, { childList: true, subtree: true, characterData: true });

    const resizeObserver = new ResizeObserver(triggerScroll);
    resizeObserver.observe(inner);
    resizeObserver.observe(container);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isStreaming, scrollToBottom]);

  useEffect(() => {
    if (!isStreaming && isPinnedRef.current) {
      scrollToBottom('auto');
    }
  }, [isStreaming, scrollToBottom]);

  const scrollLabel = intl.formatMessage({
    id: 'scrollToBottom',
    defaultMessage: 'Scroll to bottom'
  });
  const showScrollButton =
    !pinToBottomConfig.disabled && hasScrollableContent && !isPinned && !hideScrollButton;

  return (
    <div data-testid="message-scroller" className="h-full w-full relative">
      <div
        className={cn(
          'message-scroller overflow-y-auto overflow-x-hidden h-full w-full',
          parentClassName
        )}
        ref={composedRef}
        data-testid="message-scroller-viewport"
      >
        <div
          className={cn('relative w-full min-h-full flex flex-col', innerClassName)}
          ref={innerRef}
          data-testid="message-scroller-content"
        >
          {children}
          {showScrollButton && <div aria-hidden="true" className="h-16 shrink-0" />}
        </div>
      </div>

      {showScrollButton && (
        <button
          type="button"
          onClick={() => {
            setPinToBottom(true);
            scrollToBottom('auto');
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('[data-chat-input-editor="true"]')?.focus();
            });
          }}
          data-testid="message-scroller-button"
          aria-label={scrollLabel}
          className="absolute left-1/2 -translate-x-1/2 bottom-2 z-30 inline-flex items-center justify-center p-0 leading-none rounded-full border border-border/15 bg-background/85 text-muted-foreground/80 hover:text-foreground hover:bg-accent/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 size-8 shadow-xs backdrop-blur-md opacity-85 hover:opacity-100 duration-200"
        >
          <ArrowDown className="size-4 shrink-0" data-testid="scroll-to-bottom-button" />
        </button>
      )}
    </div>
  );
}
