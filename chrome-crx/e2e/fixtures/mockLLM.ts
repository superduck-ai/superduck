import type { Page } from "@playwright/test";

export interface MockLLMMessage {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
}

export interface MockLLMScript {
  responses: MockLLMMessage[];
}

/**
 * Inject a streaming mock LLM into the sidepanel page that intercepts fetch
 * to the provider API and returns scripted SSE responses.
 * Must be called AFTER the sidepanel page is opened.
 */
export async function mockLLMStreaming(page: Page, script: MockLLMScript): Promise<void> {
  await page.evaluate(async (scriptData) => {
    const win = window as any;
    win.__mockLLMIndex = 0;
    win.__mockLLMScript = scriptData;
    win.__originalFetch = win.__originalFetch || window.fetch;

    window.fetch = async (url: any, init?: any) => {
      const urlStr = typeof url === "string" ? url : url?.url || url?.href || String(url);
      const isLLMCall =
        urlStr.includes("/v1/messages") ||
        urlStr.includes("/chat/completions") ||
        urlStr.includes("/v1/responses");

      if (!isLLMCall) {
        return win.__originalFetch(url, init);
      }

      const responses = win.__mockLLMScript.responses as any[];
      const idx = win.__mockLLMIndex;
      win.__mockLLMIndex = Math.min(idx + 1, responses.length - 1);
      const mockResponse = responses[idx] || responses[responses.length - 1];

      const events: string[] = [];
      events.push(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: `msg_mock_${idx}`, type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [], usage: { input_tokens: 100, output_tokens: 0 } } })}\n\n`);

      for (let i = 0; i < mockResponse.content.length; i++) {
        const block = mockResponse.content[i];
        if (block.type === "text") {
          events.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: i, content_block: { type: "text", text: "" } })}\n\n`);
          const chunks = block.text.match(/.{1,50}/gs) || [block.text];
          for (const chunk of chunks) {
            events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "text_delta", text: chunk } })}\n\n`);
          }
          events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: i })}\n\n`);
        } else if (block.type === "tool_use") {
          events.push(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: i, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } })}\n\n`);
          const inputStr = JSON.stringify(block.input);
          events.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: inputStr } })}\n\n`);
          events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: i })}\n\n`);
        }
      }

      events.push(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: mockResponse.stop_reason }, usage: { output_tokens: 50 } })}\n\n`);
      events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

      const sseBody = events.join("");
      const encoder = new TextEncoder();
      const signal = init?.signal;
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const stream = new ReadableStream({
        start(controller) {
          const bytes = encoder.encode(sseBody);
          let offset = 0;
          const chunkSize = 256;
          let aborted = false;

          signal?.addEventListener?.(
            "abort",
            () => {
              aborted = true;
              controller.error(new DOMException("Aborted", "AbortError"));
            },
            { once: true }
          );

          function push() {
            if (aborted) return;
            if (offset >= bytes.length) {
              controller.close();
              return;
            }
            const end = Math.min(offset + chunkSize, bytes.length);
            controller.enqueue(bytes.slice(offset, end));
            offset = end;
            setTimeout(push, 5);
          }
          push();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    };
  }, script);
}

/**
 * Inject a mock that returns HTTP errors on the sidepanel page.
 */
export async function mockLLMError(page: Page, statusCode: number, errorMessage: string): Promise<void> {
  await page.evaluate(async ({ statusCode, errorMessage }) => {
    const win = window as any;
    win.__originalFetch = win.__originalFetch || window.fetch;

    window.fetch = async (url: any, init?: any) => {
      const urlStr = typeof url === "string" ? url : url?.url || url?.href || String(url);
      const isLLMCall =
        urlStr.includes("/v1/messages") ||
        urlStr.includes("/chat/completions") ||
        urlStr.includes("/v1/responses");

      if (!isLLMCall) {
        return win.__originalFetch(url, init);
      }

      return new Response(JSON.stringify({ type: "error", error: { type: "error", message: errorMessage } }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    };
  }, { statusCode, errorMessage });
}

/**
 * Reset mock LLM on the sidepanel page.
 */
export async function resetLLMMock(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const win = window as any;
    if (win.__originalFetch) {
      window.fetch = win.__originalFetch;
    }
    delete win.__mockLLMIndex;
    delete win.__mockLLMScript;
  });
}
