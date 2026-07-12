import React, { useCallback, useMemo } from 'react';
import { useIntlSafe } from '../../index-react-dom-intl';
import { CircleAlert } from 'lucide-react';
import { ExternalLinkIcon } from '@/sidepanel/components/icons';
import { ToolUseRow } from './toolUseRow';
import { Favicon } from './webSearch';
import { getToolInputField, getToolResultContentArray, isKnowledgeContentBlock } from './types';
import type { ToolRenderMode, ToolInputLike, ToolResultLike, KnowledgeContentBlock } from './types';
import { isRecord, isTextContentBlock } from '../../messageTypes';
import type { ApiTextContentBlock } from '../../messageTypes';

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
  input: ToolInputLike;
  toolResult?: ToolResultLike;
  renderMode?: ToolRenderMode;
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming?: boolean;
  onUrlClick?: (url: string) => void;
}) {
  const intl = useIntlSafe();
  const url = getToolInputField(input, 'url');
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
      const content = getToolResultContentArray(toolResult.content);
      if (!Array.isArray(content)) return null;
      const knowledge = content.find(
        (item): item is KnowledgeContentBlock =>
          isKnowledgeContentBlock(item) && typeof item.title === 'string'
      );
      if (knowledge) return { title: knowledge.title };
      const textPart = content.find((item): item is ApiTextContentBlock =>
        isTextContentBlock(item)
      );
      if (textPart?.text) {
        try {
          const parsed = JSON.parse(textPart.text);
          if (
            Array.isArray(parsed) &&
            parsed.length > 0 &&
            isRecord(parsed[0]) &&
            typeof parsed[0].title === 'string'
          ) {
            return { title: parsed[0].title };
          }
        } catch {
          return null;
        }
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
          <span className="text-muted-foreground">{pageInfo?.title || url}</span>
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
        isError ? (
          <CircleAlert size={15} className="text-destructive" aria-hidden />
        ) : isComplete && url ? (
          <ExternalLinkIcon size={16} className="text-muted-foreground" />
        ) : undefined
      }
      hideCaret
      tone={isError ? 'error' : !isComplete ? 'active' : 'default'}
      isFirstBlockOfMessage={isFirstBlockOfMessage}
      isLastBlockOfMessage={isLastBlockOfMessage}
      renderMode={renderMode}
      isFirstItemInGroup={isFirstItemInGroup}
      isLastItemInGroup={isLastItemInGroup}
    />
  );
});
