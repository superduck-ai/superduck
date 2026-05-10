import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useIntlSafe } from '../index-react-dom-intl';
import { ExternalLinkIcon, GlobeIcon, SearchIcon } from './icons';
import { ShimmerText } from './StatusDisplay';
import { asFormatMessageLike, formatStepCountLabel } from './toolDisplay';

export type ToolRenderMode = 'Standard' | 'TimelineGroup';

const TimelineContext = createContext<{
  hasCollapseHeader: boolean;
}>({ hasCollapseHeader: false });

export const TIMELINE_SNAPPY_OUT = [0.19, 1, 0.22, 1] as const;
export const TIMELINE_ANIM_DURATION = 0.2;

export const TimelineGroupItem = React.memo(function TimelineGroupItem({
  icon,
  header,
  isExpanded,
  isFirstItem,
  isLastItem,
  isActive,
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
                    ease: TIMELINE_SNAPPY_OUT as unknown as string,
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

export function Badge({
  color = 'default',
  size = 'default',
  children,
  className = '',
  uppercase = false,
  truncate = false
}: {
  color?: 'default' | 'flat' | 'secondary' | 'pro' | 'main' | 'danger';
  size?: 'default' | 'sm' | 'lg';
  children: React.ReactNode;
  className?: string;
  uppercase?: boolean;
  truncate?: boolean;
}) {
  const colorClasses = {
    default: 'bg-gradient-to-bl from-bg-500/30 to-bg-500/70 text-text-300',
    flat: 'bg-bg-500/40 text-text-200',
    secondary: 'bg-accent-secondary-900/40 text-accent-secondary-200',
    pro: 'bg-gradient-to-bl from-accent-pro-200 to-accent-pro-100 text-oncolor-100',
    main: 'bg-gradient-to-bl from-accent-main-200/70 to-accent-main-100 text-oncolor-100',
    danger: 'bg-danger-900 text-danger-200'
  };
  const sizeClasses = {
    default: 'h-5 px-1.5 rounded-md text-[0.625rem]',
    sm: 'h-4 px-1 rounded text-[0.625rem]',
    lg: 'h-6 px-2 rounded-lg text-xs'
  };

  return (
    <span
      className={`inline-flex items-center align-middle leading-none ${!truncate ? 'flex-shrink-0' : 'max-w-full'} ${colorClasses[color]} ${sizeClasses[size]} ${uppercase ? 'uppercase' : ''} ${className}`}
    >
      {truncate ? <span className="truncate">{children}</span> : children}
    </span>
  );
}

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

function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const faviconUrl = useMemo(() => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return null;
    }
  }, [url, size]);
  if (!faviconUrl) return <GlobeIcon size={size} className="text-text-300" />;
  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className="rounded-sm"
      onError={(event) => {
        (event.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

const SearchResultRow = React.memo(function SearchResultRow({
  title,
  url,
  faviconUrl,
  onClick
}: {
  title: string;
  url: string;
  faviconUrl?: string;
  onClick?: (url: string) => void;
}) {
  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, [url]);
  const handleClick = useCallback(() => {
    if (onClick) onClick(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, [onClick, url]);
  return (
    <div
      className="flex flex-row gap-3 items-center px-2 py-1.5 w-full rounded-md cursor-pointer transition-colors hover:bg-bg-200"
      onClick={handleClick}
    >
      <div className="flex-shrink-0">
        <Favicon url={faviconUrl || url} size={12} />
      </div>
      <div className="w-0 flex-grow font-small text-text-300 truncate">{title}</div>
      <div className="text-xs text-text-400 shrink-0">{hostname}</div>
    </div>
  );
});

function parseSearchResults(
  toolResult: any
): Array<{ title: string; url: string; faviconUrl?: string }> {
  if (!toolResult?.content) return [];
  try {
    if (Array.isArray(toolResult.content)) {
      const knowledge = toolResult.content.filter(
        (content: any) =>
          content.type === 'knowledge' && content.metadata?.type === 'webpage_metadata'
      );
      if (knowledge.length > 0) {
        return knowledge.map((content: any) => ({
          title: content.title || '',
          url: content.url || '',
          faviconUrl: content.metadata?.favicon_url
        }));
      }
    }

    let text = '';
    if (typeof toolResult.content === 'string') {
      text = toolResult.content;
    } else if (Array.isArray(toolResult.content)) {
      text = toolResult.content
        .filter((content: any) => content.type === 'text')
        .map((content: any) => content.text)
        .join('\n');
    }

    const linksIndex = text.indexOf('Links:');
    if (linksIndex === -1) return [];
    const afterLinks = text.slice(linksIndex + 6).trim();
    if (!afterLinks.startsWith('[')) return [];

    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let index = 0; index < afterLinks.length; index += 1) {
      const char = afterLinks[index];
      if (esc) {
        esc = false;
        continue;
      }
      if (char === '\\') {
        esc = true;
        continue;
      }
      if (char === '"') {
        inStr = !inStr;
        continue;
      }
      if (!inStr) {
        if (char === '[') depth += 1;
        else if (char === ']') {
          depth -= 1;
          if (depth === 0) {
            end = index + 1;
            break;
          }
        }
      }
    }

    if (end === -1) return [];
    const array = JSON.parse(afterLinks.slice(0, end));
    if (!Array.isArray(array)) return [];
    return array
      .filter((entry: any) => typeof entry?.url === 'string')
      .map((entry: any) => {
        let domain: string | undefined;
        try {
          domain = new URL(entry.url).hostname;
        } catch {}
        return { title: entry.title || '', url: entry.url, siteDomain: domain };
      });
  } catch {
    return [];
  }
}

export const WebSearchToolCell = React.memo(function WebSearchToolCell({
  input,
  toolResult,
  renderMode = 'Standard' as ToolRenderMode,
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  isFirstItemInGroup,
  isLastItemInGroup,
  isStreaming,
  onResultClick
}: {
  input: any;
  toolResult: any;
  renderMode?: ToolRenderMode;
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
  onResultClick?: (url: string) => void;
}) {
  const intl = useIntlSafe();
  const results = useMemo(() => parseSearchResults(toolResult), [toolResult]);
  const count = results.length;
  let query = '';
  if (typeof input === 'string') {
    try {
      query = JSON.parse(input)?.query || '';
    } catch {
      query = '';
    }
  } else {
    query = input?.query || '';
  }

  const isComplete = count > 0 || !isStreaming;
  const displayText = isComplete
    ? query
    : intl.formatMessage({ id: 'searching_the_web', defaultMessage: 'Searching the web' });
  const secondaryText =
    isComplete && count > 0
      ? intl.formatMessage(
          {
            id: 'search_result_count',
            defaultMessage: '{count, plural, one {# result} other {# results}}'
          },
          { count }
        )
      : undefined;

  return (
    <ToolUseRow
      icon={<SearchIcon size={12} className="text-text-300" />}
      text={displayText}
      secondaryText={secondaryText}
      isStreaming={!isComplete}
      hideCaret
      renderMode={renderMode}
      isFirstBlockOfMessage={isFirstBlockOfMessage}
      isLastBlockOfMessage={isLastBlockOfMessage}
      isFirstItemInGroup={isFirstItemInGroup}
      isLastItemInGroup={isLastItemInGroup}
    >
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="border-[0.5px] border-border-300 rounded-lg p-1 mx-2.5 mt-1 mb-2 max-h-[150px] overflow-y-auto bg-bg-000/50">
            <div className="flex flex-col gap-1">
              {results.map((result, index) => (
                <SearchResultRow
                  key={`${result.url}-${index}`}
                  title={result.title}
                  url={result.url}
                  faviconUrl={result.faviconUrl}
                  onClick={onResultClick}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </ToolUseRow>
  );
});

export const WebFetchToolCell = React.memo(function WebFetchToolCell({
  input,
  toolResult,
  renderMode = 'Standard' as ToolRenderMode,
  isFirstBlockOfMessage,
  isLastBlockOfMessage,
  isFirstItemInGroup,
  isLastItemInGroup,
  isStreaming,
  onUrlClick
}: {
  input: any;
  toolResult: any;
  renderMode?: ToolRenderMode;
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
  onUrlClick?: (url: string) => void;
}) {
  const intl = useIntlSafe();
  const url = String(input?.url || '');
  const hostname = useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }, [url]);
  const isError = toolResult?.is_error;
  const pageInfo = useMemo(() => {
    if (!toolResult?.content || isError) return null;
    try {
      const content = toolResult.content;
      if (!Array.isArray(content)) return null;
      const knowledge = content.find((item: any) => item.type === 'knowledge' && item.title);
      if (knowledge) return { title: knowledge.title };
      const textPart = content.find((item: any) => item.type === 'text');
      if (textPart?.text) {
        try {
          const parsed = JSON.parse(textPart.text);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
            return { title: parsed[0].title };
          }
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }, [toolResult, isError]);

  const isComplete = !!toolResult || !isStreaming;
  let displayText: React.ReactNode;
  let secondaryTextValue: string | undefined;
  if (isComplete) {
    if (isError) {
      displayText = (
        <>
          <span>
            {intl.formatMessage({ id: 'failed_to_fetch', defaultMessage: 'Failed to fetch' })}
          </span>{' '}
          <span className="text-text-400">{pageInfo?.title || url}</span>
        </>
      );
    } else {
      displayText = pageInfo?.title || url;
      secondaryTextValue = hostname || undefined;
    }
  } else {
    displayText = hostname
      ? intl.formatMessage(
          { id: 'fetching_from', defaultMessage: 'Fetching from {hostname}' },
          { hostname }
        )
      : intl.formatMessage({ id: 'fetching_page', defaultMessage: 'Fetching page' });
  }

  const handleClick = useCallback(() => {
    if (!url) return;
    if (onUrlClick) onUrlClick(url);
    else window.open(url, '_blank');
  }, [url, onUrlClick]);

  return (
    <ToolUseRow
      handleClick={url ? handleClick : undefined}
      isStreaming={!isComplete}
      icon={<Favicon url={url} size={16} />}
      text={displayText}
      secondaryText={secondaryTextValue}
      secondaryIcon={
        isComplete && url ? <ExternalLinkIcon size={16} className="text-text-300" /> : undefined
      }
      hideCaret
      isFirstBlockOfMessage={isFirstBlockOfMessage}
      isLastBlockOfMessage={isLastBlockOfMessage}
      renderMode={renderMode}
      isFirstItemInGroup={isFirstItemInGroup}
      isLastItemInGroup={isLastItemInGroup}
    />
  );
});
