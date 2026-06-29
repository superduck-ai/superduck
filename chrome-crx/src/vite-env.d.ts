declare module '*.svg' {
  const src: string;
  export default src;
}

/* eslint-disable no-var */

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.ttf?url' {
  const src: string;
  export default src;
}

// Side-effect CSS imports (e.g. `import 'katex/dist/katex.min.css'`) — no exports.
declare module '*.css';

// Web Speech API (not in default lib.dom for older lib targets)
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}
declare var SpeechRecognition: { new (): SpeechRecognition } | undefined;
declare let webkitSpeechRecognition: { new (): SpeechRecognition } | undefined;

// CDP global state (initialized by src/mcpRuntime/cdp/)
declare var __cdpDebuggerListenerRegistered: boolean;
declare var __cdpConsoleMessagesByTab: Map<number, unknown>;
declare var __cdpNetworkRequestsByTab: Map<number, unknown>;
declare var __cdpNetworkTrackingEnabled: Set<number>;
declare var __cdpConsoleTrackingEnabled: Set<number>;
declare var __cdpWindowOpenEventsByTab: Map<number, unknown[]>;
declare var __cdpDebuggerEventHandler:
  | ((source: chrome.debugger.Debuggee, method: string, params: unknown) => void)
  | undefined;
