import React, { useCallback, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { cn } from '@/lib/utils';
import { ShimmerText } from '@/sidepanel/components/StatusDisplay';
import { TimelineGroupItem } from './timeline';
import type { ToolRenderMode } from './types';

type ToolUseTone = 'default' | 'active' | 'error' | 'success';

export const ToolUseRow = React.memo(function ToolUseRow({
  handleClick,
  isDisabled,
  isExpanded,
  isStreaming,
  icon,
  text,
  secondaryText,
  secondaryIcon,
  secondaryElement,
  hideCaret,
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  renderMode = 'Standard' as ToolRenderMode,
  isFirstItemInGroup,
  isLastItemInGroup,
  tone = 'default',
  className: extraClass,
  children
}: {
  handleClick?: () => void;
  isDisabled?: boolean;
  isExpanded?: boolean;
  isStreaming?: boolean;
  icon?: React.ReactNode;
  text?: React.ReactNode;
  secondaryText?: string;
  secondaryIcon?: React.ReactNode;
  secondaryElement?: React.ReactNode;
  hideCaret?: boolean;
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  renderMode?: ToolRenderMode;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  tone?: ToolUseTone;
  className?: string;
  children?: React.ReactNode;
}) {
  const noClick = isDisabled || !handleClick;
  const button = (
    <Marker
      render={noClick ? <div /> : <button type="button" />}
      onClick={noClick ? undefined : handleClick}
      aria-expanded={noClick ? undefined : isExpanded}
      className={cn(
        'group/row min-h-9 rounded-md px-2.5 text-foreground',
        renderMode !== 'TimelineGroup' && (secondaryElement ? 'py-1.5' : 'py-2'),
        noClick
          ? '!cursor-default'
          : 'cursor-pointer transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        extraClass
      )}
    >
      {icon && renderMode !== 'TimelineGroup' && (
        <MarkerIcon className="text-muted-foreground">{icon}</MarkerIcon>
      )}
      <MarkerContent className="flex min-w-0 flex-1 items-center gap-2 text-foreground">
        <span
          className={cn(
            'min-w-0 truncate text-left text-sm text-foreground transition-colors',
            !secondaryElement ? 'w-0 flex-grow' : ''
          )}
        >
          {isStreaming ? (
            <ShimmerText className="shimmer-color-blue-500/60 shimmer-angle-45">{text}</ShimmerText>
          ) : (
            text
          )}
        </span>
        {secondaryElement && (
          <span className="ml-2 flex shrink-0 items-center">{secondaryElement}</span>
        )}
      </MarkerContent>
      <span className="flex shrink-0 flex-row items-center gap-1.5">
        {secondaryText && (
          <span className="shrink-0 whitespace-nowrap pl-1 text-xs text-muted-foreground">
            {secondaryText}
          </span>
        )}
        {secondaryIcon && <span className="inline-flex">{secondaryIcon}</span>}
        {!noClick && !hideCaret && (
          <span
            className={`inline-flex transition-transform duration-100 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
          >
            <ChevronDown className="text-muted-foreground" size={16} />
          </span>
        )}
      </span>
    </Marker>
  );

  if (renderMode === 'TimelineGroup') {
    const isTimelineActive = !!isStreaming && !!isLastBlockOfMessage && !!isLastItemInGroup;
    const timelineTone = tone === 'active' && !isTimelineActive ? 'default' : tone;
    return (
      <TimelineGroupItem
        icon={icon}
        header={button}
        isExpanded={!!isExpanded}
        isFirstItem={!!isFirstItemInGroup}
        isLastItem={!!isLastItemInGroup}
        isActive={isTimelineActive}
        tone={timelineTone}
        showDotFallback={false}
      >
        {children}
      </TimelineGroupItem>
    );
  }

  const toneClass =
    tone === 'error'
      ? 'border-[0.5px] border-destructive/25 bg-destructive/[0.02] dark:border-destructive/30 dark:bg-destructive/[0.04]'
      : tone === 'active'
        ? 'border-[0.5px] border-primary/45 bg-primary/[0.02] dark:border-primary/40 dark:bg-primary/[0.03] shadow-[0_0_8px_rgba(59,130,246,0.04)]'
        : 'border-[0.5px] border-border/45 bg-muted/6 dark:border-border/40 dark:bg-muted/5';

  return (
    <div
      className={cn(
        'relative my-2 flex flex-col overflow-hidden rounded-lg font-ui leading-normal shadow-none transition-colors ease-out',
        toneClass,
        !isDisabled && !isExpanded && tone !== 'default' && 'hover:bg-muted/10',
        isFirstBlockOfMessage ? 'mt-2' : 'mt-2.5',
        isLastBlockOfMessage ? 'mb-2' : 'mb-2.5',
        isExpanded && tone === 'default' && 'bg-muted/10 dark:bg-muted/8'
      )}
    >
      {button}
      {children}
    </div>
  );
});

export const CollapsibleToolUseRow = React.memo(function CollapsibleToolUseRow({
  isExpandingDisabled,
  isExpanded,
  setIsExpanded,
  ...rest
}: {
  isExpandingDisabled?: boolean;
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
} & Omit<React.ComponentProps<typeof ToolUseRow>, 'handleClick' | 'isDisabled' | 'isExpanded'>) {
  const toggle = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded, setIsExpanded]);
  const wasStreamingRef = useRef(!!rest.isStreaming);

  useEffect(() => {
    if (wasStreamingRef.current && !rest.isStreaming) {
      setIsExpanded(false);
    }
    wasStreamingRef.current = !!rest.isStreaming;
  }, [rest.isStreaming, setIsExpanded]);

  return (
    <ToolUseRow
      {...rest}
      isExpanded={isExpanded}
      isDisabled={isExpandingDisabled}
      handleClick={isExpandingDisabled ? undefined : toggle}
    />
  );
});
