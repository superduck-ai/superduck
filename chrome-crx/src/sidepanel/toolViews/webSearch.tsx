import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CircleAlert, Globe, Search } from 'lucide-react';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import type { ApiTextContentBlock } from '../../messageTypes';
import { isRecord, isTextContentBlock } from '../../messageTypes';
import { useIntlSafe } from '../../index-react-dom-intl';
import { ToolUseRow } from './toolUseRow';
import { isKnowledgeContentBlock, getToolResultContentArray, getToolInputField } from './types';
import type {
  ToolRenderMode,
  ToolInputLike,
  ToolResultLike,
  KnowledgeContentBlock,
  KnowledgeSearchResultBlock,
  ParsedSearchEntry,
  SearchResult
} from './types';

export function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const faviconUrl = useMemo(() => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return null;
    }
  }, [url, size]);
  if (!faviconUrl) return <Globe size={size} className="text-muted-foreground" />;
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
    <Marker
      render={<button type="button" />}
      className="min-h-8 cursor-pointer rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      onClick={handleClick}
    >
      <MarkerIcon>
        <Favicon url={faviconUrl || url} size={12} />
      </MarkerIcon>
      <MarkerContent className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-0 flex-grow truncate text-xs text-foreground">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{hostname}</span>
      </MarkerContent>
    </Marker>
  );
});

function parseSearchResults(toolResult?: ToolResultLike): SearchResult[] {
  if (!toolResult?.content) return [];
  try {
    const content = getToolResultContentArray(toolResult.content);
    if (content) {
      const knowledge = content.filter(
        (block): block is KnowledgeContentBlock =>
          isKnowledgeContentBlock(block) && block.metadata?.type === 'webpage_metadata'
      );
      if (knowledge.length > 0) {
        return knowledge
          .filter((block): block is KnowledgeSearchResultBlock => typeof block.url === 'string')
          .map((block) => ({
            title: block.title || '',
            url: block.url,
            faviconUrl: block.metadata?.favicon_url
          }));
      }
    }

    const text =
      typeof toolResult.content === 'string'
        ? toolResult.content
        : content
            ?.filter((block): block is ApiTextContentBlock => isTextContentBlock(block))
            .map((block) => block.text)
            .join('\n') || '';

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
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .filter((entry): entry is ParsedSearchEntry => typeof entry.url === 'string')
      .map((entry) => ({
        title: typeof entry.title === 'string' ? entry.title : '',
        url: entry.url
      }));
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
  input: ToolInputLike;
  toolResult?: ToolResultLike;
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
  const query = getToolInputField(input, 'query');

  const isError = toolResult?.is_error === true;
  const isComplete = isError || count > 0 || !isStreaming;
  const displayText = !isComplete
    ? intl.formatMessage({ id: 'searching_the_web', defaultMessage: 'Searching the web' })
    : isError
      ? query
        ? intl.formatMessage(
            { id: 'web_search_failed_for_query', defaultMessage: 'Search failed for "{query}"' },
            { query }
          )
        : intl.formatMessage({ id: 'web_search_failed', defaultMessage: 'Search failed' })
      : query ||
        intl.formatMessage({ id: 'web_search_complete', defaultMessage: 'Search complete' });
  const secondaryText =
    !isError && isComplete && count > 0
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
      icon={<Search size={14} className="text-muted-foreground" />}
      text={displayText}
      secondaryText={secondaryText}
      secondaryIcon={
        isError ? <CircleAlert size={15} className="text-destructive" aria-hidden /> : undefined
      }
      isStreaming={!isComplete}
      tone={isError ? 'error' : !isComplete ? 'active' : 'default'}
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
          <div className="mx-2.5 mt-1 mb-2 max-h-[150px] overflow-y-auto rounded-md bg-muted/6 p-1 dark:bg-muted/5">
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
