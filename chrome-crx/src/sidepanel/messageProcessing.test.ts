import { describe, expect, it } from 'vitest';
import { INTERRUPTED_TOOL_RESULT_CONTENT } from '../utils/conversationProtocol';
import { prepareMessagesForApi } from './messageProcessing';

describe('prepareMessagesForApi', () => {
  it('adds an error tool result for an interrupted assistant tool use', () => {
    const prepared = prepareMessagesForApi([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'computer:45',
            name: 'computer',
            input: { action: 'screenshot' }
          }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'continue' }]
      }
    ]);

    expect(prepared).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'computer:45',
            name: 'computer',
            input: { action: 'screenshot' },
            cache_control: { type: 'ephemeral' }
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'computer:45',
            content: INTERRUPTED_TOOL_RESULT_CONTENT,
            is_error: true
          }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'continue' }]
      }
    ]);
  });
});
