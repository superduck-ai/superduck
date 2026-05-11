interface SSEMessage {
  data: string;
  event: string;
  id: string;
  retry?: number;
}

function createSSEParser(onMessage: (line: Uint8Array, fieldLength: number) => void) {
  let buffer: Uint8Array | undefined;
  let position = 0;
  let fieldLength = -1;
  let discardTrailingNewline = false;

  return function push(chunk: Uint8Array) {
    if (buffer === undefined) {
      buffer = chunk;
      position = 0;
      fieldLength = -1;
    } else {
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer);
      merged.set(chunk, buffer.length);
      buffer = merged;
    }

    const length = buffer.length;
    let lineStart = 0;
    for (; position < length; ) {
      if (discardTrailingNewline) {
        if (buffer[position] === 10) lineStart = ++position;
        discardTrailingNewline = false;
      }

      let lineEnd = -1;
      for (; position < length && lineEnd === -1; ++position) {
        switch (buffer[position]) {
          case 58:
            if (fieldLength === -1) fieldLength = position - lineStart;
            break;
          case 13:
          case 10:
            discardTrailingNewline = buffer[position] === 13;
            lineEnd = position;
            break;
        }
      }
      if (lineEnd === -1) break;
      onMessage(buffer.subarray(lineStart, lineEnd), fieldLength);
      lineStart = position;
      fieldLength = -1;
    }

    if (lineStart === length) {
      buffer = undefined;
    } else if (lineStart !== 0) {
      buffer = buffer.subarray(lineStart);
      position -= lineStart;
    }
  };
}

const SSE_CONTENT_TYPE = 'text/event-stream';
const LAST_EVENT_ID_HEADER = 'last-event-id';

export interface FetchEventSourceOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onopen?: (response: Response) => Promise<void> | void;
  onmessage?: (message: SSEMessage) => void;
  onclose?: () => void;
  onerror?: (error: unknown) => number | void;
  openWhenHidden?: boolean;
  fetch?: typeof globalThis.fetch;
  method?: string;
  body?: string;
  [key: string]: unknown;
}

function getRetryDelay(delay: number | void, fallbackDelay: number): number {
  return typeof delay === 'number' && Number.isFinite(delay) && delay >= 0 ? delay : fallbackDelay;
}

function defaultOnOpen(response: Response): void {
  const contentType = response.headers.get('content-type');
  if (!contentType?.startsWith(SSE_CONTENT_TYPE)) {
    throw new Error(`Expected content-type to be ${SSE_CONTENT_TYPE}, Actual: ${contentType}`);
  }
}

export function fetchEventSource(url: string, options: FetchEventSourceOptions): Promise<void> {
  const {
    signal,
    headers: inputHeaders,
    onopen,
    onmessage,
    onclose,
    onerror,
    openWhenHidden,
    fetch: customFetch,
    ...rest
  } = options;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...inputHeaders };
    let controller: AbortController | null = null;

    function onVisibilityChange() {
      controller?.abort();
      if (!document.hidden) connect();
    }

    if (!headers.accept) headers.accept = SSE_CONTENT_TYPE;
    if (!openWhenHidden) {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    let retryMs = 1000;
    let retryTimer = 0;

    function dispose() {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(retryTimer);
      controller?.abort();
    }

    signal?.addEventListener('abort', () => {
      dispose();
      resolve();
    });

    const fetchFn = customFetch ?? window.fetch;
    const openHandler = onopen ?? defaultOnOpen;

	    async function connect() {
	      controller = new AbortController();
	      try {
        const response = await fetchFn(url, {
          ...rest,
          headers,
          signal: controller.signal
	        });
	        await openHandler(response);
	        if (!response.body) {
	          throw new Error('Expected event stream response to include a body');
	        }

	        const decoder = new TextDecoder();
        let message: SSEMessage = {
          data: '',
          event: '',
          id: '',
          retry: undefined
        };
        const parser = createSSEParser((line, fieldLen) => {
          if (line.length === 0) {
            onmessage?.(message);
            message = { data: '', event: '', id: '', retry: undefined };
          } else if (fieldLen > 0) {
            const field = decoder.decode(line.subarray(0, fieldLen));
            const valueStart = fieldLen + (line[fieldLen + 1] === 32 ? 2 : 1);
            const value = decoder.decode(line.subarray(valueStart));
            switch (field) {
              case 'data':
                message.data = message.data ? `${message.data}\n${value}` : value;
                break;
              case 'event':
                message.event = value;
                break;
              case 'id':
                message.id = value;
                if (value) headers[LAST_EVENT_ID_HEADER] = value;
                else delete headers[LAST_EVENT_ID_HEADER];
                break;
              case 'retry': {
                const retryValue = parseInt(value, 10);
                if (!Number.isNaN(retryValue)) {
                  message.retry = retryValue;
                  retryMs = retryValue;
                }
                break;
              }
            }
          }
        });

	        const reader = response.body.getReader();
	        let result: ReadableStreamReadResult<Uint8Array>;
	        while (!(result = await reader.read()).done) {
	          parser(result.value);
        }

        onclose?.();
        dispose();
        resolve();
      } catch (err) {
	        if (!controller.signal.aborted) {
	          try {
	            const delay = onerror?.(err) ?? retryMs;
	            const retryDelay = getRetryDelay(delay, retryMs);
	            window.clearTimeout(retryTimer);
	            retryTimer = window.setTimeout(connect, retryDelay);
	          } catch (fatalErr) {
	            dispose();
	            reject(fatalErr);
          }
        }
      }
    }

    connect();
  });
}
