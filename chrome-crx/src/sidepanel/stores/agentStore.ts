import { create } from 'zustand';
import type { BlockedTabInfo, PairingPromptState, PendingPromptPayload } from '../types';

// =============================================================================
// Agent Store — Agent 执行状态
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - isAgentRunning
// - hasInteractiveTools
// - currentStatus
// - isCompacting
// - isConvertingToTask
// - lastStopReason
// - tokensSaved
// - pairingPrompt
// - pairingName
// - pendingPrompt
// - runtimeError
// - blockedCategory
// - blockedTabInfo
// =============================================================================

interface LastStopReason {
  reason: string;
  messageId?: string;
}

interface AgentState {
  // Agent 执行状态
  isAgentRunning: boolean;
  hasInteractiveTools: boolean;
  currentStatus: string;
  isCompacting: boolean;
  isConvertingToTask: boolean;
  lastStopReason: LastStopReason | null;
  tokensSaved: number | null;

  // Pairing / prompts / errors
  pairingPrompt: PairingPromptState | null;
  pairingName: string;
  pendingPrompt: PendingPromptPayload | null;
  runtimeError: string | null;
  blockedCategory: string | null;
  blockedTabInfo: {
    isMainTabBlocked: boolean;
    blockedTabs: BlockedTabInfo[];
  };

  // Actions
  setIsAgentRunning: (running: boolean) => void;
  setHasInteractiveTools: (has: boolean) => void;
  setCurrentStatus: (status: string) => void;
  setIsCompacting: (compacting: boolean) => void;
  setIsConvertingToTask: (converting: boolean) => void;
  setLastStopReason: (reason: LastStopReason | null) => void;
  setTokensSaved: (tokens: number | null) => void;
  setPairingPrompt: (state: PairingPromptState | null) => void;
  setPairingName: (name: string) => void;
  setPendingPrompt: (payload: PendingPromptPayload | null) => void;
  setRuntimeError: (error: string | null) => void;
  setBlockedCategory: (category: string | null) => void;
  setBlockedTabInfo: (info: { isMainTabBlocked: boolean; blockedTabs: BlockedTabInfo[] }) => void;
  resetAgentState: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  isAgentRunning: false,
  hasInteractiveTools: false,
  currentStatus: '',
  isCompacting: false,
  isConvertingToTask: false,
  lastStopReason: null,
  tokensSaved: null,
  pairingPrompt: null,
  pairingName: '',
  pendingPrompt: null,
  runtimeError: null,
  blockedCategory: null,
  blockedTabInfo: { isMainTabBlocked: true, blockedTabs: [] },

  setIsAgentRunning: (isAgentRunning) => set({ isAgentRunning }),
  setHasInteractiveTools: (hasInteractiveTools) => set({ hasInteractiveTools }),
  setCurrentStatus: (currentStatus) => set({ currentStatus }),
  setIsCompacting: (isCompacting) => set({ isCompacting }),
  setIsConvertingToTask: (isConvertingToTask) => set({ isConvertingToTask }),
  setLastStopReason: (lastStopReason) => set({ lastStopReason }),
  setTokensSaved: (tokensSaved) => set({ tokensSaved }),
  setPairingPrompt: (pairingPrompt) => set({ pairingPrompt }),
  setPairingName: (pairingName) => set({ pairingName }),
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
  setRuntimeError: (runtimeError) => set({ runtimeError }),
  setBlockedCategory: (blockedCategory) => set({ blockedCategory }),
  setBlockedTabInfo: (blockedTabInfo) => set({ blockedTabInfo }),

  resetAgentState: () =>
    set({
      isAgentRunning: false,
      hasInteractiveTools: false,
      currentStatus: '',
      isCompacting: false,
      isConvertingToTask: false,
      lastStopReason: null,
      tokensSaved: null,
      pairingPrompt: null,
      pairingName: '',
      pendingPrompt: null,
      runtimeError: null,
      blockedCategory: null,
      blockedTabInfo: { isMainTabBlocked: true, blockedTabs: [] }
    })
}));
