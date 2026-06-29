import { useCallback } from 'react';
import { trackEvent } from '../../mcpRuntime';
import { useAttachmentStore } from '../stores/attachmentStore';
import { useAgentStore } from '../stores/agentStore';
import type { PromptAttachmentPayload } from '../sidepanelUtils';
import { readFileAsBase64, createId } from '../sidepanelUtils';
import { getErrorMessage } from '../conversation/messageProcessing';

export interface UseAttachmentActionsProps {
  inputRef: React.RefObject<any>;
  setIsActionsMenuOpen: (open: boolean) => void;
  screenshotActivationTabIdsRef: React.MutableRefObject<Set<number>>;
  screenshotActivationSuppressionTokenRef: React.MutableRefObject<number>;
  preservedTranscriptTabId: number | undefined;
  queryTabId: number | undefined;
}

/**
 * useAttachmentActions — 附件相关操作
 * 封装 removeAttachment, handleFileSelection, handlePaste, captureCurrentTabScreenshot
 */
export function useAttachmentActions({
  inputRef,
  setIsActionsMenuOpen,
  screenshotActivationTabIdsRef,
  screenshotActivationSuppressionTokenRef,
  preservedTranscriptTabId,
  queryTabId
}: UseAttachmentActionsProps) {
  const setPendingAttachments = useAttachmentStore((s) => s.setPendingAttachments);
  const setAttachmentCount = useAttachmentStore((s) => s.setAttachmentCount);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const setRuntimeError = useAgentStore((s) => s.setRuntimeError);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const next = prev.filter((item) => item.id !== id);
      setAttachmentCount(next.length);
      if (next.length === 0) setPreviewAttachmentImage(null);
      return next;
    });
  }, []);

  const handleFileSelection = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextAttachments: PromptAttachmentPayload[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const base64 = await readFileAsBase64(file);
        nextAttachments.push({
          id: createId(),
          base64,
          mediaType: file.type || 'image/png',
          fileName: file.name || `image-${Date.now()}.png`
        });
      } catch {
        // ignore single-file read errors
      }
    }
    if (nextAttachments.length === 0) return;
    setPendingAttachments((prev) => {
      const merged = [...prev, ...nextAttachments];
      setAttachmentCount(merged.length);
      return merged;
    });
    setIsActionsMenuOpen(false);
    if (!inputRef.current) return;
    inputRef.current.focus();
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length === 0) return;
      event.preventDefault();
      void trackEvent('superduck.sidebar.image_pasted', {});
      const dataTransfer = new DataTransfer();
      imageFiles.forEach((f) => dataTransfer.items.add(f));
      void handleFileSelection(dataTransfer.files);
    },
    [handleFileSelection]
  );

  const captureCurrentTabScreenshot = useCallback(async () => {
    let previousActiveTabId: number | undefined;
    let shouldRestoreActiveTab = false;
    let activationSuppressionToken: number | undefined;

    try {
      const targetTabId = preservedTranscriptTabId ?? queryTabId;
      let captureWindowId: number | undefined;
      if (typeof targetTabId === 'number') {
        const targetTab = await chrome.tabs.get(targetTabId);
        if (typeof targetTab.windowId !== 'number') {
          throw new Error('No active tab found.');
        }
        captureWindowId = targetTab.windowId;
        if (!targetTab.active) {
          const activeTabs = await chrome.tabs.query({
            active: true,
            windowId: targetTab.windowId
          });
          previousActiveTabId = activeTabs[0]?.id;
          shouldRestoreActiveTab =
            typeof previousActiveTabId === 'number' && previousActiveTabId !== targetTabId;
          screenshotActivationTabIdsRef.current.add(targetTabId);
          if (typeof previousActiveTabId === 'number') {
            screenshotActivationTabIdsRef.current.add(previousActiveTabId);
          }
          activationSuppressionToken = ++screenshotActivationSuppressionTokenRef.current;
          await chrome.tabs.update(targetTabId, { active: true });
        }
      } else {
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        captureWindowId = activeTabs[0]?.windowId;
      }
      if (typeof captureWindowId !== 'number') {
        throw new Error('No active tab found.');
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(captureWindowId, { format: 'png' });
      const marker = 'base64,';
      const markerIndex = dataUrl.indexOf(marker);
      if (markerIndex < 0) {
        throw new Error('Invalid screenshot data.');
      }
      const base64 = dataUrl.slice(markerIndex + marker.length);
      setPendingAttachments((prev) => {
        const next = [
          ...prev,
          {
            id: createId(),
            base64,
            mediaType: 'image/png',
            fileName: `screenshot-${Date.now()}.png`
          }
        ];
        setAttachmentCount(next.length);
        return next;
      });
      setIsActionsMenuOpen(false);
      inputRef.current?.focus();
      void trackEvent('superduck.sidebar.screenshot_captured', {});
    } catch (error) {
      setRuntimeError(`Unable to capture screenshot: ${getErrorMessage(error)}`);
    } finally {
      if (shouldRestoreActiveTab && typeof previousActiveTabId === 'number') {
        await chrome.tabs.update(previousActiveTabId, { active: true }).catch(() => {});
      }
      if (typeof activationSuppressionToken === 'number') {
        setTimeout(() => {
          if (screenshotActivationSuppressionTokenRef.current === activationSuppressionToken) {
            screenshotActivationTabIdsRef.current.clear();
          }
        }, 1000);
      }
    }
  }, [preservedTranscriptTabId, queryTabId]);

  return { removeAttachment, handleFileSelection, handlePaste, captureCurrentTabScreenshot };
}
