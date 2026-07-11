import React, { createContext, useContext, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntlSafe } from '../../index-react-dom-intl';
import { asFormatMessageLike, formatStepCountLabel } from './toolDisplay';

const TimelineContext = createContext<{
  hasCollapseHeader: boolean;
}>({ hasCollapseHeader: false });

type TimelineTone = 'default' | 'active' | 'error' | 'success';

export const TIMELINE_SNAPPY_OUT: [number, number, number, number] = [0.19, 1, 0.22, 1];
export const TIMELINE_ANIM_DURATION = 0.2;

export const TimelineGroupItem = React.memo(function TimelineGroupItem({
  icon,
  header,
  isExpanded,
  isFirstItem,
  isLastItem,
  isActive,
  tone = 'default',
  showDotFallback = true,
  children
}: {
  icon?: React.ReactNode;
  header?: React.ReactNode;
  isExpanded?: boolean;
  isFirstItem: boolean;
  isLastItem: boolean;
  isActive: boolean;
  tone?: TimelineTone;
  showDotFallback?: boolean;
  children?: React.ReactNode;
}) {
  const { hasCollapseHeader } = useContext(TimelineContext);
  const hideTopLine = !hasCollapseHeader && isFirstItem;
  const resolvedTone = tone === 'default' && isActive ? 'active' : tone;
  const lineClass =
    resolvedTone === 'error'
      ? 'bg-destructive/35'
      : resolvedTone === 'active'
        ? 'bg-border/70 dark:bg-foreground/18'
        : 'bg-border/55 dark:bg-border/45';
  const itemClass =
    resolvedTone === 'error'
      ? 'superduck-tool-danger-surface border'
      : resolvedTone === 'active'
        ? 'superduck-tool-surface border'
        : isExpanded
          ? 'border-[0.5px] border-border/50 bg-muted/10 dark:bg-muted/8'
          : 'border-[0.5px] border-border/40 bg-card/60 dark:bg-card/25';

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex h-[8px] flex-row">
        <div className="flex w-[20px] justify-center">
          <div className={`w-[1px] h-full duration-150 ${hideTopLine ? '' : lineClass}`} />
        </div>
      </div>
      <div className={cn('rounded-lg transition-colors duration-150', itemClass)}>
        {header && (
          <div className="flex flex-row items-center py-1">
            <div className="flex w-[20px] shrink-0 justify-center text-muted-foreground">
              {icon ??
                (showDotFallback && <div className="mt-0.5 size-[8px] rounded-full bg-border" />)}
            </div>
            <div className="min-w-0 flex-1">{header}</div>
          </div>
        )}
        {children && (
          <div className="flex flex-row">
            <div className="flex w-[20px] shrink-0 justify-center">
              {header ? (
                <div className={`w-[1px] h-full duration-150 ${isLastItem ? '' : lineClass}`} />
              ) : (
                <div className="flex flex-col items-center pt-1">
                  {icon ??
                    (showDotFallback && (
                      <div className="mt-0.5 size-[8px] rounded-full bg-border" />
                    ))}
                  <div
                    className={`w-[1px] flex-1 mt-1 duration-150 ${showDotFallback && isLastItem ? '' : lineClass}`}
                  />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        )}
      </div>
      <div className="flex h-[8px] flex-row">
        <div className="flex w-[20px] justify-center">
          <div className={`w-[1px] h-full duration-150 ${isLastItem ? '' : lineClass}`} />
        </div>
      </div>
    </div>
  );
});

export const TimelineGroup = React.memo(function TimelineGroup({
  children,
  isFirstBlockOfMessage = false,
  isLastBlockOfMessage = false,
  borderless = false,
  autoCollapse = false,
  isTurnComplete = true
}: {
  children: React.ReactNode;
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  borderless?: boolean;
  autoCollapse?: boolean;
  isTurnComplete?: boolean;
}) {
  const intl = useIntlSafe();
  const [showCollapsed, setShowCollapsed] = useState(false);
  const items = React.Children.toArray(children);
  const count = items.length;
  const shouldCollapse = autoCollapse && count >= 3 && isTurnComplete;
  const collapsedCount = count;

  const containerClass = cn(
    'flex flex-col font-ui leading-normal',
    !borderless && 'superduck-tool-surface rounded-lg border',
    !borderless && (isFirstBlockOfMessage ? 'mt-2' : 'mt-3'),
    !borderless && (isLastBlockOfMessage ? 'mb-2' : 'mb-3')
  );

  const ctxValue = useMemo(
    () => ({
      hasCollapseHeader: shouldCollapse && collapsedCount > 0
    }),
    [shouldCollapse, collapsedCount]
  );

  return (
    <div className={containerClass}>
      <TimelineContext.Provider value={ctxValue}>
        {shouldCollapse ? (
          <>
            {collapsedCount > 0 && (
              <TimelineGroupItem
                icon={
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${showCollapsed ? 'rotate-0' : 'rotate-180'}`}
                  />
                }
                isFirstItem
                isLastItem={false}
                isActive={false}
                showDotFallback={false}
                header={
                  <button
                    onClick={() => setShowCollapsed(!showCollapsed)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/25 hover:text-foreground"
                  >
                    {showCollapsed
                      ? intl.formatMessage({ id: 'hide_steps', defaultMessage: 'Hide steps' })
                      : formatStepCountLabel(asFormatMessageLike(intl), collapsedCount)}
                  </button>
                }
              />
            )}
            {items.map((item, index) => {
              const key = React.isValidElement(item) ? item.key : index;
              const isHidden = shouldCollapse && !showCollapsed;
              return (
                <motion.div
                  key={key}
                  className="overflow-hidden shrink-0"
                  initial={false}
                  animate={isHidden ? 'collapsed' : 'expanded'}
                  variants={{
                    expanded: { opacity: 1, height: 'auto' },
                    collapsed: { opacity: 0, height: 0 }
                  }}
                  transition={{
                    ease: TIMELINE_SNAPPY_OUT,
                    duration: TIMELINE_ANIM_DURATION
                  }}
                  style={{
                    pointerEvents: isHidden ? 'none' : 'auto',
                    willChange: 'height, opacity'
                  }}
                >
                  {item}
                </motion.div>
              );
            })}
          </>
        ) : (
          items.map((item, index) => {
            const key = React.isValidElement(item) ? item.key : index;
            return <div key={key}>{item}</div>;
          })
        )}
      </TimelineContext.Provider>
    </div>
  );
});
