import { create } from 'zustand';

/**
 * chatActionsStore — 存储 ChatInputArea 需要的所有回调函数
 * 避免通过 props 逐层传递 callbacks
 */

type Noop = () => void;
type NoopAsync = () => Promise<void>;

const noop: Noop = () => {};
const noopAsync: NoopAsync = async () => {};

export interface ChatActions {
  // Core actions
  submit: Noop;
  handlePaste: (event: React.ClipboardEvent) => void;
  handleFileSelection: (files: FileList | null) => Promise<void>;
  captureCurrentTabScreenshot: NoopAsync;
  effectiveCancel: Noop;
  sendPrompt: (text: string, options?: any) => Promise<void>;
  effectiveSendPrompt: (text: string, options?: any) => Promise<void>;
  insertShortcutChip: (command: string, label?: string) => void;
  navigateActiveTabToUrl: (url: string) => Promise<void>;
  effectiveClearError: Noop;
}

interface ChatActionsStore extends ChatActions {
  setActions: (actions: Partial<ChatActions>) => void;
}

export const useChatActionsStore = create<ChatActionsStore>((set) => ({
  // Default no-op implementations
  submit: noop,
  handlePaste: noop,
  handleFileSelection: noopAsync,
  captureCurrentTabScreenshot: noopAsync,
  effectiveCancel: noop,
  sendPrompt: noopAsync,
  effectiveSendPrompt: noopAsync,
  insertShortcutChip: noop,
  navigateActiveTabToUrl: noopAsync,
  effectiveClearError: noop,

  // Update actions
  setActions: (actions) => set(actions)
}));
