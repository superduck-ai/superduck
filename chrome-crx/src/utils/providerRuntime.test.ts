import { describe, expect, it, vi, afterEach } from 'vitest';
import { createOpenAIRuntime } from './providerRuntime';

const openAIMocks = vi.hoisted(() => ({
  responsesCreate: vi.fn()
}));

vi.mock('openai', () => {
  const OpenAI = vi.fn().mockImplementation(function () {
    return {
      responses: { create: openAIMocks.responsesCreate }
    };
  });
  return { default: OpenAI };
});

describe('createOpenAIRuntime', () => {
  afterEach(() => {
    openAIMocks.responsesCreate.mockReset();
  });

  it('replays Responses function calls with fc item ids and original call ids', async () => {
    openAIMocks.responsesCreate.mockResolvedValue({
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
              id: 'call_P2hNiH5l7C1qRdQOOOGEXvYq',
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
              tool_use_id: 'call_P2hNiH5l7C1qRdQOOOGEXvYq',
              content: 'snapshot result'
            }
          ]
        }
      ]
    });

    expect(openAIMocks.responsesCreate).toHaveBeenCalledWith({
      model: 'gpt-5.4',
      instructions: '',
      input: [
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
      ],
      max_output_tokens: 128,
      tools: undefined
    });
  });
});
