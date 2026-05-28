import { describe, expect, it, vi, afterEach } from 'vitest';
import { createOpenAIRuntime } from './providerRuntime';

const OPENAI_MOCKS = vi.hoisted(() => ({
  responsesCreate: vi.fn()
}));

vi.mock('openai', () => {
  const OpenAI = vi.fn().mockImplementation(function () {
    return {
      responses: { create: OPENAI_MOCKS.responsesCreate }
    };
  });
  return { default: OpenAI };
});

describe('createOpenAIRuntime', () => {
  afterEach(() => {
    OPENAI_MOCKS.responsesCreate.mockReset();
  });

  async function createResponsesInputForToolUseId(
    toolUseId: string
  ): Promise<Array<Record<string, unknown>>> {
    OPENAI_MOCKS.responsesCreate.mockResolvedValue({
      id: 'resp_1',
      type: 'response',
      model: 'gpt-5.4',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'done' }]
        }
      ],
      usage: { input_tokens: 1, output_tokens: 1 }
    });

    const runtime = createOpenAIRuntime({
      apiKey: 'sk-test',
      baseURL: 'https://example.com/v1',
      protocol: 'responses'
    });

    await runtime.create({
      model: 'gpt-5.4',
      max_tokens: 128,
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: toolUseId,
              name: 'browser_snapshot',
              input: { verbose: false }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: 'snapshot result'
            }
          ]
        }
      ]
    });

    const request = OPENAI_MOCKS.responsesCreate.mock.calls[0]?.[0] as
      | { input?: Array<Record<string, unknown>> }
      | undefined;
    return request?.input ?? [];
  }

  it('replays Responses function calls with fc item ids and original call ids', async () => {
    const input = await createResponsesInputForToolUseId('call_P2hNiH5l7C1qRdQOOOGEXvYq');

    expect(OPENAI_MOCKS.responsesCreate).toHaveBeenCalledWith({
      model: 'gpt-5.4',
      instructions: '',
      input,
      max_output_tokens: 128,
      tools: undefined
    });
    expect(input).toEqual([
      {
        type: 'function_call',
        id: 'fc_P2hNiH5l7C1qRdQOOOGEXvYq',
        call_id: 'call_P2hNiH5l7C1qRdQOOOGEXvYq',
        name: 'browser_snapshot',
        arguments: JSON.stringify({ verbose: false })
      },
      {
        type: 'function_call_output',
        call_id: 'call_P2hNiH5l7C1qRdQOOOGEXvYq',
        output: 'snapshot result'
      }
    ]);
  });

  it('does not double-convert existing Responses fc item ids', async () => {
    const input = await createResponsesInputForToolUseId('fc_existingCall');

    expect(input[0]).toMatchObject({
      type: 'function_call',
      id: 'fc_existingCall',
      call_id: 'fc_existingCall'
    });
  });

  it('prefixes non-call tool ids for Responses function call item ids', async () => {
    const input = await createResponsesInputForToolUseId('toolu_existingCall');

    expect(input[0]).toMatchObject({
      type: 'function_call',
      id: 'fc_toolu_existingCall',
      call_id: 'toolu_existingCall'
    });
  });
});
