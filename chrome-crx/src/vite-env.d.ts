declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.ttf?url" {
  const src: string;
  export default src;
}

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
declare var webkitSpeechRecognition: { new (): SpeechRecognition } | undefined;

// CDP global state (initialized in src/mcpRuntime/cdp.ts)
declare var __cdpDebuggerListenerRegistered: boolean;
declare var __cdpConsoleMessagesByTab: Map<number, unknown>;
declare var __cdpNetworkRequestsByTab: Map<number, unknown>;
declare var __cdpNetworkTrackingEnabled: Set<number>;
declare var __cdpConsoleTrackingEnabled: Set<number>;
declare var __cdpDebuggerEventHandler:
  | ((source: chrome.debugger.Debuggee, method: string, params: unknown) => void)
  | undefined;
