import type { ApiConversationMessage, ApiToolResultBlock } from '../messageTypes';
import { isToolResultContentBlock, isToolUseContentBlock } from '../messageTypes';

export const INTERRUPTED_TOOL_RESULT_CONTENT =
  'Tool execution was interrupted before a result was recorded.';

function createInterruptedToolResult(toolUseId: string): ApiToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: INTERRUPTED_TOOL_RESULT_CONTENT,
    is_error: true
  };
}

export function ensureToolResultPairs(
  messages: ApiConversationMessage[]
): ApiConversationMessage[] {
  const repaired: ApiConversationMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      repaired.push(message);
      continue;
    }

    repaired.push(message);
    const toolUses = message.content.filter(isToolUseContentBlock);
    if (toolUses.length === 0) continue;

    const nextMessage = messages[index + 1];
    const nextResults =
      nextMessage?.role === 'user' && Array.isArray(nextMessage.content)
        ? nextMessage.content.filter(isToolResultContentBlock)
        : [];
    const resultIds = new Set(nextResults.map((result) => result.tool_use_id));
    const missingResults = toolUses
      .filter((toolUse) => !resultIds.has(toolUse.id))
      .map((toolUse) => createInterruptedToolResult(toolUse.id));
    if (missingResults.length === 0) continue;

    repaired.push({
      role: 'user',
      content: missingResults
    });
  }

  return repaired;
}
