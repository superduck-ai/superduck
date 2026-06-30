import React, { useCallback, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { PromptService } from '../../extensionServices';
import { isImageContentBlock, isToolResultContentBlock } from '../../messageTypes';
import type {
  ApiConversationMessage,
  ApiMessageBlock,
  ApiTextContentBlock
} from '../../messageTypes';
import { getTextFromBlockContent } from '../sidepanelUtils';
import { ConversationSummary } from '@/sidepanel/components/MessageViews';
import { UserMessageRow } from './UserMessageRow';
import { AssistantMessageRow } from './AssistantMessageRow';
import { StreamingTextBlock } from './StreamingTextBlock';
import type { MessageGroup, StreamingTextStore } from '../types';

export const MessageList = React.memo(function MessageList({
  apiMessages,
  streamingTextStore,
  isAgentRunning,
  scrollRefs
}: {
  apiMessages: ApiConversationMessage[];
  streamingTextStore: StreamingTextStore;
  isAgentRunning: boolean;
  scrollRefs?: {
    lastAssistantMessage: React.RefObject<HTMLDivElement | null>;
    lastHumanMessage: React.RefObject<HTMLDivElement | null>;
  };
}) {
  const setPromptToEdit = useUIStore((state) => state.setPromptToEdit);

  const handleEditShortcut = useCallback(
    async (id: string) => {
      const prompt = await PromptService.getPromptById(id);
      if (prompt) {
        setPromptToEdit({
          id: prompt.id,
          prompt: prompt.prompt,
          command: prompt.command
        });
      }
    },
    [setPromptToEdit]
  );

  const groups = useMemo(() => {
    const result: MessageGroup[] = [];

    for (let i = 0; i < apiMessages.length; i++) {
      const msg = apiMessages[i];

      if (msg.isCompactionMessage || msg.isCompactSummary) {
        if (msg.isCompactSummary) {
          result.push({ type: 'summary', message: msg });
        }
        continue;
      }

      if (msg.role === 'user') {
        const toolResults = Array.isArray(msg.content)
          ? msg.content.filter(isToolResultContentBlock)
          : [];
        const isToolResultOnly = toolResults.length > 0;

        if (!isToolResultOnly) {
          const hasVisibleText = (() => {
            if (typeof msg.content === 'string') {
              return (
                msg.content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
                  .length > 0
              );
            }
            if (Array.isArray(msg.content)) {
              const text = getTextFromBlockContent(msg.content, '')
                .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
                .trim();
              const hasImages = msg.content.some(isImageContentBlock);
              return text.length > 0 || hasImages;
            }
            return false;
          })();

          result.push({
            type: 'conversation',
            userMessage: msg,
            hasVisibleUser: hasVisibleText,
            toolResults: [],
            assistantBlocks: []
          });
        } else {
          if (result.length > 0) {
            const lastGroup = result[result.length - 1];
            if (lastGroup.type === 'conversation') {
              lastGroup.toolResults.push(...toolResults);
            }
          }
        }
      } else if (msg.role === 'assistant' && result.length > 0) {
        const lastGroup = result[result.length - 1];
        if (lastGroup.type === 'conversation') {
          const blocks: ApiMessageBlock[] = Array.isArray(msg.content)
            ? msg.content
            : [{ type: 'text', text: msg.content } as ApiTextContentBlock];
          lastGroup.assistantBlocks.push(...blocks);
        }
      }
    }

    return result;
  }, [apiMessages]);

  const displayGroups = groups;

  let lastUserGroupIndex = -1;
  for (let i = displayGroups.length - 1; i >= 0; i--) {
    const group = displayGroups[i];
    if (group.type === 'conversation' && group.hasVisibleUser) {
      lastUserGroupIndex = i;
      break;
    }
  }

  const beforeGroups =
    lastUserGroupIndex >= 0 ? displayGroups.slice(0, lastUserGroupIndex + 1) : displayGroups;
  const afterGroups = lastUserGroupIndex >= 0 ? displayGroups.slice(lastUserGroupIndex + 1) : [];

  const renderGroup = (group: MessageGroup, index: number, isLastUserGroup: boolean) => {
    if (group.type === 'summary') {
      return <ConversationSummary key={`summary-${index}`} message={group.message} />;
    }

    const isLastGroup = index === displayGroups.length - 1;
    const isStreamingGroup = isLastGroup && isAgentRunning;
    return (
      <div
        key={index}
        className="flex flex-col w-full mb-4"
        ref={isLastUserGroup && scrollRefs ? scrollRefs.lastHumanMessage : undefined}
      >
        {group.hasVisibleUser && (
          <UserMessageRow
            content={group.userMessage.content}
            toolResults={group.toolResults}
            onEditShortcut={handleEditShortcut}
          />
        )}
        {group.assistantBlocks.length > 0 && (
          <AssistantMessageRow
            blocks={group.assistantBlocks}
            isStreaming={isStreamingGroup}
            allMessages={apiMessages}
          />
        )}
        {isStreamingGroup && <StreamingTextBlock store={streamingTextStore} />}
      </div>
    );
  };

  return (
    <>
      {beforeGroups.map((group, index) => renderGroup(group, index, index === lastUserGroupIndex))}
      {afterGroups.length > 0 && (
        <div ref={scrollRefs?.lastAssistantMessage} className="flex flex-col">
          {afterGroups.map((group, index) =>
            renderGroup(group, lastUserGroupIndex + 1 + index, false)
          )}
        </div>
      )}
    </>
  );
});
