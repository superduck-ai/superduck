import { isToolUseContentBlock } from '../messageTypes';
import type { ApiMessageBlock } from '../messageTypes';

/**
 * The single source of truth for "where does the final answer start" within a
 * message's content blocks. Shared by the renderer (collapse/expand), the Copy
 * button, and `extractTextFromContent` (notifications / persistence / restore)
 * so every surface agrees on what counts as the answer.
 *
 * Primary boundary: the model's explicit `turn_answer_start` tool call (a
 * marker emitted right before the natural-language answer). When the model
 * omits that marker — which happens occasionally — fall back to treating the
 * trailing non-tool blocks after the last `tool_use` as the answer. Without
 * this fallback, a missing marker causes the answer text to be folded away
 * together with the steps (the "final answer sometimes gets collapsed" bug).
 *
 * Only `tool_use` is treated as a step boundary. `tool_result` blocks live in
 * user messages and are never passed here from the renderer; for user-message
 * content (via `extractTextFromContent`) treating `tool_result` as a boundary
 * would surprise, so it is intentionally NOT a boundary — such content has no
 * `tool_use`, so it falls through to "no boundary" and all text is returned.
 */
export function splitAnswerBlocks(blocks: ApiMessageBlock[]): {
  blocksBeforeAnswer: ApiMessageBlock[];
  blocksAfterAnswer: ApiMessageBlock[];
  hasFinalAnswer: boolean;
  /**
   * The answer's real start index in the original `blocks` array
   * (`blocks.length - blocksAfterAnswer.length`). It is identical whether the
   * boundary came from the dropped `turn_answer_start` marker or the
   * trailing-text fallback, so callers can use it as a stable React key base
   * that does not shift when the boundary flips between the two mid-stream.
   */
  answerStartIndex: number;
} {
  // 1. Explicit `turn_answer_start` marker — the marker itself is dropped.
  const markerIdx = blocks.findIndex(
    (block) => isToolUseContentBlock(block) && block.name === 'turn_answer_start'
  );
  if (markerIdx !== -1) {
    return {
      blocksBeforeAnswer: blocks.slice(0, markerIdx),
      blocksAfterAnswer: blocks.slice(markerIdx + 1),
      hasFinalAnswer: true,
      answerStartIndex: markerIdx + 1
    };
  }

  // 2. Fallback: the answer is the trailing non-tool run after the last
  //    tool_use. The last tool_use itself stays with the steps (it is a
  //    step), only what follows is the answer.
  let lastToolIdx = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (isToolUseContentBlock(blocks[i])) {
      lastToolIdx = i;
      break;
    }
  }
  if (lastToolIdx !== -1 && lastToolIdx < blocks.length - 1) {
    return {
      blocksBeforeAnswer: blocks.slice(0, lastToolIdx + 1),
      blocksAfterAnswer: blocks.slice(lastToolIdx + 1),
      hasFinalAnswer: true,
      answerStartIndex: lastToolIdx + 1
    };
  }

  // 3. No answer boundary detectable.
  return {
    blocksBeforeAnswer: blocks,
    blocksAfterAnswer: [],
    hasFinalAnswer: false,
    answerStartIndex: blocks.length
  };
}
