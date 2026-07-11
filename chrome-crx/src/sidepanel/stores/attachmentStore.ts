import { create } from 'zustand';
import type { PromptAttachmentPayload } from '../sidepanelUtils';

// =============================================================================
// Attachment Store — 截图与附件
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - pendingAttachments
// - previewAttachmentImage
// - attachmentCount (可以从 pendingAttachments.length 计算，但保留以减少重计算)
// =============================================================================

interface AttachmentState {
  pendingAttachments: PromptAttachmentPayload[];
  previewAttachmentImage: string | null;

  // Computed (derived from pendingAttachments)
  attachmentCount: number;

  // Actions
  removeAttachment: (id: string) => void;
  setPreviewAttachmentImage: (url: string | null) => void;
  // Direct setters for backward compatibility with useState migration
  setAttachmentCount: (count: number) => void;
  setPendingAttachments: (
    attachments:
      | PromptAttachmentPayload[]
      | ((prev: PromptAttachmentPayload[]) => PromptAttachmentPayload[])
  ) => void;
}

export const useAttachmentStore = create<AttachmentState>((set) => ({
  pendingAttachments: [],
  previewAttachmentImage: null,
  attachmentCount: 0,

  removeAttachment: (id) =>
    set((state) => {
      const next = state.pendingAttachments.filter((a) => a.id !== id);
      return {
        pendingAttachments: next,
        attachmentCount: next.length,
        ...(next.length === 0 ? { previewAttachmentImage: null } : {})
      };
    }),

  setPreviewAttachmentImage: (previewAttachmentImage) => set({ previewAttachmentImage }),

  // Direct setters for backward compatibility with useState migration
  setAttachmentCount: (attachmentCount) => set({ attachmentCount }),
  setPendingAttachments: (pendingAttachments) =>
    set((state) => {
      const next =
        typeof pendingAttachments === 'function'
          ? pendingAttachments(state.pendingAttachments)
          : pendingAttachments;
      return { pendingAttachments: next, attachmentCount: next.length };
    })
}));
