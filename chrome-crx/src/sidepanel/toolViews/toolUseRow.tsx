import React, { useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { ShimmerText } from '@/sidepanel/components/StatusDisplay';
import { TimelineGroupItem } from './timeline';
import type { ToolRenderMode } from './types';

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
  className?: string;
  children?: React.ReactNode;
}) {
  const noClick = isDisabled || !handleClick;
  const button = (
    <button
      onClick={noClick ? undefined : handleClick}
      className={`group/row flex flex-row items-center rounded-lg px-2.5 w-full ${secondaryElement ? 'gap-2' : 'justify-between'} ${
        renderMode !== 'TimelineGroup' ? (secondaryElement ? 'py-1' : 'py-2') : ''
      } text-text-300 ${noClick ? '!cursor-default' : 'cursor-pointer transition-colors duration-200 hover:text-text-200 hover:text-text-000'} ${extraClass || ''}`}
    >
      <div className="flex flex-row items-center gap-2 min-w-0 flex-1">
        {icon && renderMode !== 'TimelineGroup' && (
          <div className="flex items-center justify-center shrink-0">{icon}</div>
        )}
        <div
          className={`text-sm text-text-500 text-left truncate ${!secondaryElement ? 'w-0 flex-grow' : ''}`}
        >
          {isStreaming ? <ShimmerText>{text}</ShimmerText> : text}
        </div>
        {secondaryElement && (
          <div className="flex items-center shrink-0 ml-2">{secondaryElement}</div>
        )}
      </div>
      <div className="flex flex-row items-center gap-1.5 shrink-0">
        {secondaryText && (
          <p className="pl-1 text-text-500 font-small shrink-0 whitespace-nowrap">
            {secondaryText}
          </p>
        )}
        {secondaryIcon && <span className="inline-flex">{secondaryIcon}</span>}
        {!noClick && !hideCaret && !secondaryIcon && (
          <span
            className={`inline-flex transition-transform duration-100 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
          >
            <ChevronDown className="text-text-300" size={16} />
          </span>
        )}
      </div>
    </button>
  );

  if (renderMode === 'TimelineGroup') {
    return (
      <TimelineGroupItem
        icon={icon}
        header={button}
        isExpanded={!!isExpanded}
        isFirstItem={!!isFirstItemInGroup}
        isLastItem={!!isLastItemInGroup}
        isActive={!!isStreaming && !!isLastBlockOfMessage && !!isLastItemInGroup}
        showDotFallback={false}
      >
        {children}
      </TimelineGroupItem>
    );
  }

  return (
    <div
      className={`ease-out rounded-lg border-[0.5px] flex flex-col font-ui leading-normal my-3 border-border-300 ${
        !isDisabled && !isExpanded ? 'hover:bg-bg-200' : ''
      } ${isFirstBlockOfMessage ? 'mt-2' : 'mt-3'} ${isLastBlockOfMessage ? 'mb-2' : 'mb-3'} ${
        isExpanded ? 'bg-bg-000 shadow-sm' : ''
      }`}
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
  return (
    <ToolUseRow
      {...rest}
      isExpanded={isExpanded}
      isDisabled={isExpandingDisabled}
      handleClick={isExpandingDisabled ? undefined : toggle}
    />
  );
});
