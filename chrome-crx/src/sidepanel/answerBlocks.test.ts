import { describe, expect, it } from 'vitest';
import type { ApiMessageBlock } from '../messageTypes';
import { splitAnswerBlocks } from './answerBlocks';

const text = (t: string): ApiMessageBlock =>
  ({ type: 'text', text: t }) as unknown as ApiMessageBlock;
const toolUse = (name: string, id = name): ApiMessageBlock =>
  ({ type: 'tool_use', id, name, input: {} }) as unknown as ApiMessageBlock;

describe('splitAnswerBlocks', () => {
  it('splits at turn_answer_start when the marker is present', () => {
    const blocks = [
      toolUse('navigate', 't1'),
      toolUse('click', 't2'),
      toolUse('turn_answer_start', 'ans'),
      text('Final answer')
    ];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(true);
    // The marker itself is dropped from both sides.
    expect(blocksBeforeAnswer).toHaveLength(2);
    expect(blocksBeforeAnswer.map((b) => (b as { name: string }).name)).toEqual([
      'navigate',
      'click'
    ]);
    expect(blocksAfterAnswer).toHaveLength(1);
    expect((blocksAfterAnswer[0] as { text: string }).text).toBe('Final answer');
  });

  it('falls back to trailing blocks after the last tool_use when the marker is missing', () => {
    // Reproduces the "final answer sometimes gets collapsed" scenario: the
    // model did not emit turn_answer_start, but produced a text answer after
    // several tool calls.
    const blocks = [
      toolUse('navigate', 't1'),
      toolUse('click', 't2'),
      toolUse('read_page', 't3'),
      text('Final answer')
    ];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(true);
    // The last tool_use stays with the steps (it is a step), only what follows
    // is the answer — so the answer is never folded away with the steps.
    expect(blocksBeforeAnswer).toHaveLength(3);
    expect(blocksAfterAnswer).toHaveLength(1);
    expect((blocksAfterAnswer[0] as { text: string }).text).toBe('Final answer');
  });

  it('keeps intermediate progress text folded into steps, only trailing text is the answer', () => {
    const blocks = [
      text('Let me check...'),
      toolUse('navigate', 't1'),
      text('Found it, clicking...'),
      toolUse('click', 't2'),
      text('Final answer')
    ];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(true);
    expect(blocksBeforeAnswer).toHaveLength(4); // incl. intermediate text + last tool_use
    expect(blocksAfterAnswer).toHaveLength(1);
    expect((blocksAfterAnswer[0] as { text: string }).text).toBe('Final answer');
  });

  it('reports no final answer when there are tool blocks but nothing after them', () => {
    const blocks = [toolUse('navigate', 't1'), toolUse('click', 't2')];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(false);
    expect(blocksBeforeAnswer).toBe(blocks);
    expect(blocksAfterAnswer).toEqual([]);
  });

  it('reports no final answer for a pure-text message with no tool blocks', () => {
    const blocks = [text('Hello'), text('World')];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(false);
    expect(blocksBeforeAnswer).toBe(blocks);
    expect(blocksAfterAnswer).toEqual([]);
  });

  it('treats tool_result blocks as non-boundary (user-message content via extractTextFromContent)', () => {
    // tool_result is intentionally NOT a step boundary. A user message whose
    // content is [text, tool_result, text] has no tool_use, so there is no
    // answer boundary and the whole content is returned as-is.
    const blocks = [
      text('q'),
      { type: 'tool_result', tool_use_id: 't1', content: [] } as unknown as ApiMessageBlock,
      text('more')
    ];
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks(blocks);
    expect(hasFinalAnswer).toBe(false);
    expect(blocksBeforeAnswer).toBe(blocks);
    expect(blocksAfterAnswer).toEqual([]);
  });

  it('handles an empty block list', () => {
    const { blocksBeforeAnswer, blocksAfterAnswer, hasFinalAnswer } = splitAnswerBlocks([]);
    expect(hasFinalAnswer).toBe(false);
    expect(blocksBeforeAnswer).toEqual([]);
    expect(blocksAfterAnswer).toEqual([]);
  });
});
