import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, FileInput, FileOutput, Wrench } from 'lucide-react';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { cn } from '@/lib/utils';
import { useIntlSafe } from '../../../index-react-dom-intl';
import { isRecord } from '../../../messageTypes';
import type { ApiToolResultBlock, ApiToolUseBlock } from '../../../messageTypes';
import { getToolDisplayName, resolveToolNameIcon } from '../../toolViews/toolDisplay';
import { getBase64ImageBlocks, getTextFromBlockContent } from '../../sidepanelUtils';
import { TimelineGroupItem } from '../../toolViews';
import { ShimmerText } from '@/sidepanel/components/StatusDisplay';
import type { ToolInputRecord, ToolResultDisplayContent } from '../../types';

/** ToolUseRow — renders a single tool use, in TimelineGroup mode or standalone.
 * Matches bundle's Ni → Si delegation pattern. */
export function ToolUseItem({
  block,
  toolResult,
  isStreaming,
  renderMode = 'Standard',
  isFirstBlockOfMessage = false,
  isLastBlockOfMessage = false,
  isFirstItemInGroup = false,
  isLastItemInGroup = false,
  toolDisplayName: explicitDisplayName,
  explicitIcon
}: {
  block: ApiToolUseBlock;
  toolResult?: ApiToolResultBlock;
  isStreaming: boolean;
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstBlockOfMessage?: boolean;
  isLastBlockOfMessage?: boolean;
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  toolDisplayName?: string;
  explicitIcon?: React.ReactNode;
}) {
  const intl = useIntlSafe();
  const [resultExpanded, setResultExpanded] = useState(false);
  const [requestExpanded, setRequestExpanded] = useState(false);
  const input = useMemo<ToolInputRecord | undefined>(
    () => (isRecord(block.input) ? block.input : undefined),
    [block.input]
  );
  const hasResult = !!toolResult;
  const isComplete = hasResult || !isStreaming;
  const isActive = !hasResult && isStreaming;
  const hasError = toolResult?.is_error === true;

  const displayName = useMemo(() => {
    if (explicitDisplayName) return explicitDisplayName;
    return getToolDisplayName(block.name);
  }, [block.name, explicitDisplayName]);

  const toolIcon = useMemo(() => {
    if (explicitIcon) return explicitIcon;
    const nameIcon = resolveToolNameIcon(block.name, 12);
    if (nameIcon) return nameIcon;
    return <Wrench size={12} className="text-muted-foreground" />;
  }, [explicitIcon, block.name]);

  const resultContent = useMemo(() => {
    if (!toolResult) return null;
    if (typeof toolResult.content === 'string') return toolResult.content;
    if (Array.isArray(toolResult.content)) {
      return {
        text: getTextFromBlockContent(toolResult.content),
        images: getBase64ImageBlocks(toolResult.content)
      } satisfies Exclude<ToolResultDisplayContent, string>;
    }
    return null;
  }, [toolResult]) as ToolResultDisplayContent | null;

  const requestContent = useMemo(() => {
    if (!input || Object.keys(input).length === 0) return null;
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return null;
    }
  }, [input]);

  const hasResultContent = !!resultContent;
  const hasRequestContent = !!requestContent;
  const toneClass = hasError ? 'superduck-tool-danger-surface' : 'superduck-tool-surface';
  const tone = hasError ? 'error' : isActive ? 'active' : 'default';
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      setRequestExpanded(false);
      setResultExpanded(false);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const headerButton = (
    <Marker
      render={<div />}
      className={cn(
        'group/row min-h-9 cursor-default rounded-md px-2.5 text-muted-foreground',
        renderMode !== 'TimelineGroup' && 'py-2'
      )}
    >
      {renderMode !== 'TimelineGroup' && (
        <MarkerIcon className="text-muted-foreground">{toolIcon}</MarkerIcon>
      )}
      <MarkerContent className="flex min-w-0 flex-1 items-center gap-2 text-foreground">
        <span className="w-0 flex-grow truncate text-left text-sm text-foreground">
          {isStreaming && !hasResult ? <ShimmerText>{displayName}</ShimmerText> : displayName}
        </span>
      </MarkerContent>
      {hasError && <CircleAlert size={15} className="ml-2 shrink-0 text-destructive" aria-hidden />}
    </Marker>
  );

  const requestBadge =
    hasRequestContent && !isComplete ? (
      <div className="mx-2.5 mt-1 mb-2">
        {!requestExpanded && (
          <Marker
            render={<button type="button" />}
            onClick={() => setRequestExpanded(true)}
            className="min-h-7 w-auto rounded-md border border-border/40 bg-muted/15 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:border-border/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <MarkerIcon className="size-3.5 text-inherit">
              <FileInput size={13} />
            </MarkerIcon>
            <MarkerContent className="flex-none font-mono text-inherit">
              {intl.formatMessage({ id: 'request', defaultMessage: 'Request' })}
            </MarkerContent>
          </Marker>
        )}
        <AnimatePresence>
          {requestExpanded && (
            <motion.div
              key="request-expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setRequestExpanded(false)}
                className="w-full cursor-pointer rounded-md border border-border/30 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-muted/10 dark:hover:bg-muted/20"
              >
                <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto [&_code]:!text-xs [&_pre]:!text-xs">
                  <pre className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                    {requestContent?.slice(0, 2000)}
                  </pre>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : null;

  const resultBadge =
    hasResultContent && isComplete ? (
      <div className="mx-2.5 mt-1 mb-2">
        {!resultExpanded && (
          <Marker
            render={<button type="button" />}
            onClick={() => setResultExpanded(true)}
            className={`min-h-7 w-auto rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
              hasError
                ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:border-destructive/50'
                : 'border-border/40 bg-muted/15 text-muted-foreground hover:bg-muted/30 hover:border-border/70 hover:text-foreground'
            }`}
          >
            <MarkerIcon className="size-3.5 text-inherit">
              {hasError ? <CircleAlert size={13} /> : <FileOutput size={13} />}
            </MarkerIcon>
            <MarkerContent className="flex-none font-mono text-inherit">
              {intl.formatMessage({ id: 'result', defaultMessage: 'Result' })}
            </MarkerContent>
          </Marker>
        )}
        <AnimatePresence>
          {resultExpanded && (
            <motion.div
              key="result-expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setResultExpanded(false)}
                className={cn(
                  'w-full cursor-pointer rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                  hasError
                    ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/8'
                    : 'border-border/30 bg-muted/20 hover:bg-muted/35 dark:bg-muted/10 dark:hover:bg-muted/20'
                )}
              >
                <div className="flex max-h-[200px] flex-col gap-2 overflow-y-auto [&_code]:!text-xs [&_pre]:!text-xs">
                  {typeof resultContent === 'string' ? (
                    <pre
                      className={cn(
                        'font-mono text-xs whitespace-pre-wrap',
                        hasError ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {resultContent.slice(0, 2000)}
                    </pre>
                  ) : (
                    <>
                      {resultContent.text && (
                        <pre
                          className={cn(
                            'font-mono text-xs whitespace-pre-wrap',
                            hasError ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {resultContent.text.slice(0, 2000)}
                        </pre>
                      )}
                      {resultContent.images?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {resultContent.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={`data:${img.source.media_type};base64,${img.source.data}`}
                              alt="tool result"
                              className="h-20 w-20 rounded border border-border/20 dark:border-border/20 object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : null;

  if (renderMode === 'TimelineGroup') {
    const isTimelineActive = isActive && isLastBlockOfMessage && isLastItemInGroup;
    const timelineTone = tone === 'active' && !isTimelineActive ? 'default' : tone;
    return (
      <TimelineGroupItem
        icon={toolIcon}
        header={headerButton}
        isExpanded={resultExpanded || requestExpanded}
        isFirstItem={isFirstItemInGroup}
        isLastItem={isLastItemInGroup}
        isActive={isTimelineActive}
        tone={timelineTone}
        showDotFallback={false}
      >
        {requestBadge}
        {resultBadge}
      </TimelineGroupItem>
    );
  }

  return (
    <div
      className={cn(
        'relative my-2 flex flex-col overflow-hidden rounded-lg border-[0.5px] font-ui leading-normal shadow-none transition-colors ease-out',
        toneClass,
        isActive && 'border-primary/50 shadow-[0_0_8px_rgba(59,130,246,0.06)]',
        !(resultExpanded || requestExpanded) && !hasError && !isActive && '',
        !(resultExpanded || requestExpanded) && (hasError || isActive) && 'hover:bg-muted/8',
        (resultExpanded || requestExpanded) &&
          !hasError &&
          !isActive &&
          'bg-muted/8 dark:bg-muted/6',
        isFirstBlockOfMessage ? 'mt-2' : 'mt-2.5',
        isLastBlockOfMessage ? 'mb-2' : 'mb-2.5'
      )}
    >
      {headerButton}
      {requestBadge}
      {resultBadge}
    </div>
  );
}
