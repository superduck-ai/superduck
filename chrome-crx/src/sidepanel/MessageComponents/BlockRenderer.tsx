import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createStandardMarkdownComponents,
  preprocessMarkdownText,
  STANDARD_MARKDOWN_GRID_CLASS,
  useMathPlugins,
  buildRemarkPlugins,
  buildRehypePlugins
} from '../components/MarkdownComponents';
import { useIntlSafe } from '../../index-react-dom-intl';
import {
  isRecord,
  isTextContentBlock,
  isToolResultContentBlock,
  isToolUseContentBlock
} from '../../messageTypes';
import type {
  ApiConversationMessage,
  ApiMessageBlock,
  ApiToolResultBlock,
  ApiToolUseBlock
} from '../../messageTypes';
import {
  BROWSER_TOOLS,
  MCP_TOOL_REGEX,
  asFormatMessageLike,
  getToolDisplayInfo,
  resolveToolIcon
} from '../toolViews/toolDisplay';
import { WebFetchToolCell, WebSearchToolCell } from '../toolViews';
import { getStringField } from './browserBatch/browserBatchParser';
import { UpdatePlanCell } from './permission/UpdatePlanCell';
import { BrowserBatchToolCell } from './browserBatch/BrowserBatchToolCell';
import { BrowserToolCell } from './tools/BrowserToolCell';
import { ToolUseItem } from './tools/ToolUseItem';

/** Checks if a block should be grouped in a timeline (tool_use or tool_result) */
export function isTimelineBlock(
  block: ApiMessageBlock
): block is ApiToolUseBlock | ApiToolResultBlock {
  return isToolUseContentBlock(block) || isToolResultContentBlock(block);
}

/** BlockRenderer — bundle's lv component.
 * Dispatches to the right renderer for each block type. */
export const BlockRenderer = React.memo(function BlockRenderer({
  block,
  index,
  blocks,
  renderMode = 'Standard',
  isFirstItemInGroup = false,
  isLastItemInGroup = false,
  isStreaming,
  allMessages,
  remarkMath,
  rehypeKatex
}: {
  block: ApiMessageBlock;
  index: number;
  blocks: ApiMessageBlock[];
  renderMode?: 'Standard' | 'TimelineGroup';
  isFirstItemInGroup?: boolean;
  isLastItemInGroup?: boolean;
  isStreaming: boolean;
  allMessages: ApiConversationMessage[];
  remarkMath?: ReturnType<typeof useMathPlugins>['remarkMath'];
  rehypeKatex?: ReturnType<typeof useMathPlugins>['rehypeKatex'];
}) {
  const isFirst = index === 0;
  const isLast = index === blocks.length - 1;
  const intlBlock = useIntlSafe();

  const remarkPlugins = useMemo(() => [remarkGfm, ...buildRemarkPlugins(remarkMath)], [remarkMath]);
  const rehypePlugins = useMemo(() => buildRehypePlugins(rehypeKatex), [rehypeKatex]);

  const mdComponents = useMemo(() => createStandardMarkdownComponents(), []);

  const processedText = useMemo(() => {
    if (isTextContentBlock(block) && block.text) {
      return preprocessMarkdownText(block.text);
    }
    return '';
  }, [block]);

  if (isTextContentBlock(block)) {
    const text = block.text;
    if (!text) return null;
    const textColor = renderMode === 'TimelineGroup' ? 'text-foreground' : undefined;

    return (
      <div
        className={`font-superduck-response text-sm leading-[1.65rem] ${textColor || 'text-foreground'} break-words`}
      >
        <div className={`standard-markdown ${STANDARD_MARKDOWN_GRID_CLASS}`}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={mdComponents}
          >
            {processedText}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  if (isToolUseContentBlock(block)) {
    if (block.name === 'turn_answer_start') return null;

    let toolResult: ApiToolResultBlock | undefined;
    for (const msg of allMessages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const found = msg.content.find(
          (contentBlock): contentBlock is ApiToolResultBlock =>
            isToolResultContentBlock(contentBlock) && contentBlock.tool_use_id === block.id
        );
        if (found) {
          toolResult = found;
          break;
        }
      }
    }

    const input = isRecord(block.input) ? block.input : undefined;
    const streamingForTool = isStreaming && !toolResult;

    if (block.name === 'WebSearch') {
      return (
        <WebSearchToolCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
          onResultClick={(url) => chrome.tabs.create({ url })}
        />
      );
    }

    if (block.name === 'WebFetch') {
      return (
        <WebFetchToolCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
          onUrlClick={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
        />
      );
    }

    if (block.name === 'update_plan') {
      return (
        <UpdatePlanCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
        />
      );
    }

    if (block.name === 'browser_batch') {
      return (
        <BrowserBatchToolCell
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
        />
      );
    }

    if (BROWSER_TOOLS.has(block.name)) {
      return (
        <BrowserToolCell
          toolName={block.name}
          input={input}
          toolResult={toolResult}
          renderMode={renderMode}
          isFirstBlockOfMessage={isFirst}
          isLastBlockOfMessage={isLast}
          isFirstItemInGroup={isFirstItemInGroup}
          isLastItemInGroup={isLastItemInGroup}
          isStreaming={streamingForTool}
        />
      );
    }

    let derivedDisplayName: string | undefined;
    let derivedIcon: React.ReactNode | undefined;

    if (block.name === 'switch_browser') {
      const info = getToolDisplayInfo(
        block.name,
        input,
        toolResult,
        asFormatMessageLike(intlBlock)
      );
      derivedDisplayName = info.text;
      derivedIcon = resolveToolIcon(info.icon, 16);
    } else if (block.name === 'bash' || block.name === 'Bash' || block.name === 'bash_tool') {
      derivedDisplayName = getStringField(input, 'description') || getStringField(input, 'command');
    } else if (
      block.name === 'str_replace' ||
      block.name === 'str_replace_editor' ||
      block.name === 'Edit'
    ) {
      const inputPath = getStringField(input, 'path');
      derivedDisplayName = inputPath
        ? intlBlock.formatMessage(
            { id: 'editing', defaultMessage: 'Editing {fileName}' },
            { fileName: inputPath }
          )
        : undefined;
    } else if (block.name === 'Read') {
      const filePath = getStringField(input, 'file_path');
      derivedDisplayName = filePath
        ? intlBlock.formatMessage(
            { id: 'reading', defaultMessage: 'Reading {fileName}' },
            { fileName: filePath }
          )
        : undefined;
    } else if (block.name === 'Write') {
      const filePath = getStringField(input, 'file_path');
      derivedDisplayName = filePath
        ? intlBlock.formatMessage(
            { id: 'writing_file', defaultMessage: 'Writing {fileName}' },
            { fileName: filePath }
          )
        : undefined;
    } else if (block.name === 'Glob' || block.name === 'Grep') {
      derivedDisplayName = getStringField(input, 'pattern');
    } else if (block.name === 'Task') {
      derivedDisplayName = getStringField(input, 'description');
    } else if (MCP_TOOL_REGEX.test(block.name)) {
      const match = block.name.match(/^mcp__[0-9a-f-]+__(.+)$/);
      if (match) {
        derivedDisplayName = match[1]
          .split('_')
          .map((w: string, i: number) =>
            i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()
          )
          .join(' ');
      }
    }

    return (
      <ToolUseItem
        block={block}
        toolResult={toolResult}
        isStreaming={streamingForTool}
        renderMode={renderMode}
        isFirstBlockOfMessage={isFirst}
        isLastBlockOfMessage={isLast}
        isFirstItemInGroup={isFirstItemInGroup}
        isLastItemInGroup={isLastItemInGroup}
        toolDisplayName={derivedDisplayName}
        explicitIcon={derivedIcon}
      />
    );
  }

  return null;
});
