import React, { createContext, useContext, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useIntlSafe } from '../../index-react-dom-intl';
import { asFormatMessageLike, formatStepCountLabel } from './toolDisplay';

const TimelineContext = createContext<{
  hasCollapseHeader: boolean;
}>({ hasCollapseHeader: false });

export const TIMELINE_SNAPPY_OUT: [number, number, number, number] = [0.19, 1, 0.22, 1];
export const TIMELINE_ANIM_DURATION = 0.2;

export const TimelineGroupItem = React.memo(function TimelineGroupItem({
  icon,
  header,
  isExpanded,
  isFirstItem,
  isLastItem,
  isActive: _isActive,
  showDotFallback = true,
  children
}: {
  icon?: React.ReactNode;
  header?: React.ReactNode;
  isExpanded?: boolean;
  isFirstItem: boolean;
  isLastItem: boolean;
  isActive: boolean;
  showDotFallback?: boolean;
  children?: React.ReactNode;
}) {
  const { hasCollapseHeader } = useContext(TimelineContext);
  const hideTopLine = !hasCollapseHeader && isFirstItem;

  return (
    <div className="flex flex-col shrink-0">
      <div className="flex flex-row h-[8px]">
        <div className="w-[20px] flex justify-center">
          <div className={`w-[1px] h-full duration-150 ${hideTopLine ? '' : 'bg-border-300'}`} />
        </div>
      </div>
      <div className={`transition-colors rounded-lg duration-150 ${isExpanded ? 'bg-bg-000' : ''}`}>
        {header && (
          <div className="flex flex-row items-center py-1">
            <div className="w-[20px] flex justify-center shrink-0 text-text-500">
              {icon ??
                (showDotFallback && (
                  <div className="size-[8px] rounded-full bg-border-100 mt-0.5" />
                ))}
            </div>
            <div className="flex-1 min-w-0">{header}</div>
          </div>
        )}
        {children && (
          <div className="flex flex-row">
            <div className="w-[20px] flex justify-center shrink-0">
              {header ? (
                <div
                  className={`w-[1px] h-full duration-150 ${isLastItem ? '' : 'bg-border-300'}`}
                />
              ) : (
                <div className="flex flex-col items-center pt-1">
                  {icon ??
                    (showDotFallback && (
                      <div className="size-[8px] rounded-full bg-border-100 mt-0.5" />
                    ))}
                  <div
                    className={`w-[1px] flex-1 mt-1 duration-150 ${showDotFallback && isLastItem ? '' : 'bg-border-300'}`}
                  />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        )}
      </div>
      <div className="flex flex-row h-[8px]">
        <div className="w-[20px] flex justify-center">
          <div className={`w-[1px] h-full duration-150 ${isLastItem ? '' : 'bg-border-300'}`} />
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

  const containerClass = [
    'flex flex-col font-ui leading-normal',
    !borderless && 'rounded-lg border-0.5 border-border-300 my-3',
    !borderless && (isFirstBlockOfMessage ? 'mt-2' : 'mt-3'),
    !borderless && (isLastBlockOfMessage ? 'mb-2' : 'mb-3')
  ]
    .filter(Boolean)
    .join(' ');

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
                    className={`transition-transform text-text-300 ${showCollapsed ? 'rotate-0' : 'rotate-180'}`}
                  />
                }
                isFirstItem
                isLastItem={false}
                isActive={false}
                showDotFallback={false}
                header={
                  <button
                    onClick={() => setShowCollapsed(!showCollapsed)}
                    className="px-3 py-2 w-full text-left text-sm text-text-300"
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
