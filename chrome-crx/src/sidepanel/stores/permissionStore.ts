import { create } from 'zustand';
import type { PermissionMode } from '../sidepanelUtils';
import type { PermissionPromptData } from '../types';

// =============================================================================
// Permission Store — 权限管理
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - permissionMode
// - permissionPrompt
// - hasBrowserControlPermissionAccepted
// - hasApprovedPlan (从 ref 迁移)
// =============================================================================

interface PermissionState {
  permissionMode: PermissionMode;
  permissionPrompt: PermissionPromptData | null;
  hasBrowserControlPermissionAccepted: boolean | null;
  hasApprovedPlan: boolean;

  // Actions
  setPermissionMode: (mode: PermissionMode) => void;
  setPermissionPrompt: (prompt: PermissionPromptData | null) => void;
  setHasBrowserControlPermissionAccepted: (accepted: boolean | null) => void;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  // 默认值与 SidepanelApp 中的初始值保持一致
  permissionMode: 'skip_all_permission_checks',
  permissionPrompt: null,
  hasBrowserControlPermissionAccepted: null,
  hasApprovedPlan: false,

  setPermissionMode: (permissionMode) => set({ permissionMode }),
  setPermissionPrompt: (permissionPrompt) => set({ permissionPrompt }),
  setHasBrowserControlPermissionAccepted: (hasBrowserControlPermissionAccepted) =>
    set({ hasBrowserControlPermissionAccepted })
}));
