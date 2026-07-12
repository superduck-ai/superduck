import { useMemo, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useMathPlugins } from '../components/MarkdownComponents';
import { useIntlSafe } from '../../index-react-dom-intl';
import { isToolUseContentBlock } from '../../messageTypes';
import type { ApiConversationMessage, ApiMessageBlock } from '../../messageTypes';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { cn } from '@/lib/utils';
import { asFormatMessageLike, formatStepCountLabel } from '../toolViews/toolDisplay';
import { TIMELINE_ANIM_DURATION, TIMELINE_SNAPPY_OUT } from '../toolViews';
import { BlockRenderer } from './BlockRenderer';
import { splitAnswerBlocks } from '../answerBlocks';

function getMessageScrollerViewport(anchor: HTMLElement) {
  return (
    anchor
      .closest('[data-testid="message-scroller"]')
      ?.querySelector<HTMLElement>('[data-testid="message-scroller-viewport"]') ?? null
  );
}

function keepScrollAnchorStable(
  viewport: HTMLElement,
  anchor: HTMLElement,
  initialAnchorTop: number
) {
  const startedAt = performance.now();
  const durationMs = Math.max(TIMELINE_ANIM_DURATION * 1000 + 80, 180);

  const stabilize = () => {
    if (!viewport.isConnected || !anchor.isConnected) return;

    const anchorTop = anchor.getBoundingClientRect().top;
    const delta = anchorTop - initialAnchorTop;
    if (Math.abs(delta) > 0.5) {
      viewport.scrollTop += delta;
    }

    if (performance.now() - startedAt < durationMs) {
      window.requestAnimationFrame(stabilize);
    }
  };

  window.requestAnimationFrame(stabilize);
}

function pauseMessageScrollerAutoStick(viewport: HTMLElement) {
  const durationMs = Math.max(TIMELINE_ANIM_DURATION * 1000 + 100, 220);
  const suppressUntil = performance.now() + durationMs;

  viewport.dataset.superduckSuppressAutoStickUntil = String(suppressUntil);
  viewport.dispatchEvent(new CustomEvent('superduck:release-pin'));

  window.setTimeout(() => {
    const currentSuppressUntil = Number(viewport.dataset.superduckSuppressAutoStickUntil ?? 0);
    if (currentSuppressUntil <= suppressUntil) {
      delete viewport.dataset.superduckSuppressAutoStickUntil;
    }
  }, durationMs + 40);
}

/** ContentBlocksRenderer — splits blocks at turn_answer_start, collapses tool steps when complete. */
export function ContentBlocksRenderer({
  blocks,
  isStreaming,
  allMessages
}: {
  blocks: ApiMessageBlock[];
  isStreaming: boolean;
  allMessages: ApiConversationMessage[];
}) {
  const [showCollapsed, setShowCollapsed] = useState(false);
  const intl = useIntlSafe();
  const { remarkMath, rehypeKatex } = useMathPlugins();

  const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer, answerStartIndex } = useMemo(
    () => splitAnswerBlocks(blocks),
    [blocks]
  );

  const toolUseCount = useMemo(() => {
    const target = hasFinalAnswer ? blocksBeforeAnswer : blocks;
    return target.filter(
      (block) => isToolUseContentBlock(block) && block.name !== 'turn_answer_start'
    ).length;
  }, [blocks, blocksBeforeAnswer, hasFinalAnswer]);

  const shouldCollapse = !isStreaming && toolUseCount >= 3;

  const renderBlocks = (
    list: ApiMessageBlock[],
    keyPrefix: string,
    streaming: boolean,
    offset = 0
  ) =>
    list.map((block, i) => (
      <BlockRenderer
        key={`${keyPrefix}-${offset + i}`}
        block={block}
        index={i}
        blocks={list}
        renderMode="Standard"
        isStreaming={streaming}
        allMessages={allMessages}
        remarkMath={remarkMath}
        rehypeKatex={rehypeKatex}
      />
    ));

  const renderCollapsible = (list: ApiMessageBlock[], keyPrefix: string) => {
    const handleToggleCollapsed = (event: MouseEvent<HTMLElement>) => {
      const trigger = event.currentTarget;
      const viewport = getMessageScrollerViewport(trigger);
      const initialAnchorTop = trigger.getBoundingClientRect().top;

      if (viewport) {
        pauseMessageScrollerAutoStick(viewport);
        keepScrollAnchorStable(viewport, trigger, initialAnchorTop);
      }

      setShowCollapsed((current) => !current);
    };

    return (
      <>
        <div className="my-3">
          <Marker
            variant="separator"
            render={<button type="button" />}
            onClick={handleToggleCollapsed}
            aria-expanded={showCollapsed}
            className={cn(
              'min-h-8 border-0 bg-transparent px-0 py-1 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&:after]:bg-border/70 [&:before]:bg-border/70',
              showCollapsed && 'text-foreground'
            )}
          >
            <MarkerContent className="inline-flex max-w-[76%] items-center justify-center gap-1.5 truncate px-1 text-center text-inherit">
              <span className="truncate">
                {showCollapsed
                  ? intl.formatMessage({ id: 'hide_steps', defaultMessage: 'Hide steps' })
                  : formatStepCountLabel(asFormatMessageLike(intl), toolUseCount)}
              </span>
              <ChevronDown
                size={15}
                className={`shrink-0 text-muted-foreground transition-transform ${showCollapsed ? 'rotate-180' : 'rotate-0'}`}
              />
            </MarkerContent>
          </Marker>
        </div>
        <AnimatePresence>
          {showCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ease: TIMELINE_SNAPPY_OUT, duration: TIMELINE_ANIM_DURATION }}
              className="overflow-hidden"
            >
              {renderBlocks(list, keyPrefix, false)}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  };

  if (hasFinalAnswer) {
    if (shouldCollapse) {
      return (
        <>
          {renderCollapsible(blocksBeforeAnswer, 'before-answer')}
          {renderBlocks(blocksAfterAnswer, 'after-answer', false, answerStartIndex)}
        </>
      );
    }
    return (
      <>
        {renderBlocks(blocksBeforeAnswer, 'before-answer', false)}
        {renderBlocks(blocksAfterAnswer, 'after-answer', false, answerStartIndex)}
      </>
    );
  }

  if (shouldCollapse) return renderCollapsible(blocks, 'block');
  return <>{renderBlocks(blocks, 'block', isStreaming)}</>;
}
