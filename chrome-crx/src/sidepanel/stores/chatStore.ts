import { create } from 'zustand';
import type { ChatMessage } from '../types';
import type { ApiConversationMessage } from '../../messageTypes';

// =============================================================================
// Chat Store — 消息与聊天状态
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - messages (ChatMessage[])
// - apiMessages (ApiConversationMessage[])
// - input (string)
//
// 以及相关 actions：
// - pushMessage, appendVisibleLocalMessages, updateLastAssistantMessage, etc.
// =============================================================================

interface ChatState {
  // 消息列表
  messages: ChatMessage[];
  apiMessages: ApiConversationMessage[];

  // 输入框
  input: string;

  // Actions
  setInput: (input: string) => void;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setApiMessages: (
    messages:
      | ApiConversationMessage[]
      | ((prev: ApiConversationMessage[]) => ApiConversationMessage[])
  ) => void;
  pushMessage: (role: ChatMessage['role'], text: string) => void;
  appendVisibleLocalMessages: (entries: Array<{ role: ChatMessage['role']; text: string }>) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearConversation: () => void;
}

let messageIdCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  apiMessages: [],
  input: '',

  setInput: (input) => set({ input }),

  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === 'function' ? messages(state.messages) : messages
    })),

  setApiMessages: (messages) =>
    set((state) => ({
      apiMessages: typeof messages === 'function' ? messages(state.apiMessages) : messages
    })),

  pushMessage: (role, text) =>
    set((state) => ({
      messages: [...state.messages, { id: `msg-${++messageIdCounter}`, role, text }]
    })),

  appendVisibleLocalMessages: (entries) =>
    set((state) => ({
      messages: [
        ...state.messages,
        ...entries.map((entry) => ({
          id: `msg-${++messageIdCounter}`,
          role: entry.role,
          text: entry.text
        }))
      ]
    })),

  updateLastAssistantMessage: (text) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], text };
          break;
        }
      }
      return { messages };
    }),

  clearConversation: () => set({ messages: [], apiMessages: [], input: '' })
}));
