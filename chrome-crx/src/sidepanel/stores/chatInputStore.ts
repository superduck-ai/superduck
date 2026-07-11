import { create } from 'zustand';
import type { RefObject } from 'react';
import type { ScrollContainerHandle } from '@/sidepanel/components/MessageScroller';
import type { PermissionModeOption } from '@/sidepanel/components/PermissionModeMenu';
import type { RichTextInputHandle } from '@/sidepanel/components/RichTextInput';
import type { WorkflowStep } from '../workflowRecording/types';

/**
 * chatInputStore — 存储 ChatInputArea 需要的所有状态和 refs
 * 完全消除 prop drilling
 */

export interface ScrollRefs {
  lastAssistantMessage: RefObject<HTMLDivElement | null>;
  lastHumanMessage: RefObject<HTMLDivElement | null>;
  extras: RefObject<HTMLDivElement | null>;
  extraSpace: RefObject<HTMLDivElement | null>;
  chatInput: RefObject<HTMLDivElement | null>;
}

export interface ChatInputState {
  // Refs
  scrollRefs: ScrollRefs;
  autoScrollRef: RefObject<ScrollContainerHandle | null>;
  inputRef: RefObject<RichTextInputHandle | null>;
  sentinelElement: HTMLDivElement | null;

  // State
  chatInputSurfaceClass: string;
  recordingState: {
    isRecording: boolean;
    isPaused: boolean;
    steps: WorkflowStep[];
    startTime: number | null;
  };
  debugMode: boolean;
  contextDebugInfo: {
    percentUsed: number;
    totalUsed: number;
    remaining: number;
    hasUsage: boolean;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
  } | null;

  // Flags
  shouldDisableSkipPermissions: boolean;

  // Config
  rotatingTips: string[];
  permissionModeMenuOptions: PermissionModeOption[];
}

interface ChatInputStore extends ChatInputState {
  setState: (state: Partial<ChatInputState>) => void;
}

export const useChatInputStore = create<ChatInputStore>((set) => ({
  scrollRefs: {
    lastAssistantMessage: { current: null },
    lastHumanMessage: { current: null },
    extras: { current: null },
    extraSpace: { current: null },
    chatInput: { current: null }
  },
  autoScrollRef: { current: null },
  inputRef: { current: null },
  sentinelElement: null,
  chatInputSurfaceClass: '',
  recordingState: {
    isRecording: false,
    isPaused: false,
    steps: [],
    startTime: null
  },
  debugMode: false,
  contextDebugInfo: null,
  shouldDisableSkipPermissions: false,
  rotatingTips: [],
  permissionModeMenuOptions: [],
  setState: (state) => set(state)
}));
