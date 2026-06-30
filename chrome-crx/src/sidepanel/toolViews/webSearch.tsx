import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ApiTextContentBlock } from '../../messageTypes';
import { isRecord, isTextContentBlock } from '../../messageTypes';
import { useIntlSafe } from '../../index-react-dom-intl';
import { GlobeIcon, SearchIcon } from '@/sidepanel/components/icons';
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
