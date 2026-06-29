import { useCallback } from 'react';
import { PromptService } from '../../extensionServices';
import { trackEvent } from '../../mcpRuntime';
import type { PromptAttachmentPayload } from '../sidepanelUtils';

export interface UseSubmitActionsProps {
  input: string;
  setInput: (value: string) => void;
  pendingAttachments: PromptAttachmentPayload[];
  setPendingAttachments: (
    value:
      | PromptAttachmentPayload[]
      | ((prev: PromptAttachmentPayload[]) => PromptAttachmentPayload[])
  ) => void;
  setPreviewAttachmentImage: (image: string | null) => void;
  setAttachmentCount: (count: number) => void;
  setIsPermissionMenuOpen: (open: boolean) => void;
  setIsActionsMenuOpen: (open: boolean) => void;
  effectiveSendPrompt: (prompt: string, options?: any) => void;
  effectiveIsAgentRunning: boolean;
  apiKey: string | null;
  effectiveMessagesClient: any;
  populatedInputTargetTabId: number | undefined;
  setPopulatedInputTargetTabId: (tabId: number | undefined) => void;
  inputRef: React.RefObject<any>;
  selectedModelRef: React.MutableRefObject<string | null>;
  permissionModeRef: React.MutableRefObject<string>;
}

/**
 * useSubmitActions — 提交和快捷方式操作
 * 封装 submit, insertShortcutChip, navigateActiveTabToUrl
 */
export function useSubmitActions({
  input,
  setInput,
  pendingAttachments,
  setPendingAttachments,
  setPreviewAttachmentImage,
  setAttachmentCount,
  setIsPermissionMenuOpen,
  setIsActionsMenuOpen,
  effectiveSendPrompt,
  effectiveIsAgentRunning,
  apiKey,
  effectiveMessagesClient,
  populatedInputTargetTabId,
  setPopulatedInputTargetTabId,
  inputRef,
  selectedModelRef,
  permissionModeRef
}: UseSubmitActionsProps) {
  const submit = useCallback(async () => {
    const hasAttachments = pendingAttachments.length > 0;
    const value = input.trim();
    if ((!value && !hasAttachments) || effectiveIsAgentRunning) return;
    // Must have an API key
    if (!apiKey && !effectiveMessagesClient) return;

    let finalPrompt = value;

    // Handle shortcut commands (starting with /)
    // Instead of resolving prompt here, convert to [[shortcut:id:name]] marker.
    // The marker is displayed as a visual chip in the chat UI, and resolved to
    // the actual prompt content by resolveShortcutMarkersInMessages before API call.
    if (value.startsWith('/')) {
      const commandName = value.slice(1).split(' ')[0];
      const additionalText = value.slice(1 + commandName.length).trim();

      const savedPrompt = await PromptService.getPromptByCommand(commandName);

      if (savedPrompt) {
        // Use [[shortcut:id:name]] marker — displayed as chip, resolved before API call
        finalPrompt = `[[shortcut:${savedPrompt.id}:${savedPrompt.command || commandName}]]`;
        if (additionalText) {
          finalPrompt = finalPrompt + ' ' + additionalText;
        }
      }
    }

    const attachmentsToSend = pendingAttachments;
    void trackEvent('superduck.sidebar.message_sent', {
      input_length: value.length,
      attachment_count: attachmentsToSend.length,
      has_attachment: attachmentsToSend.length > 0,
      is_shortcut: value.startsWith('/'),
      model: selectedModelRef.current || '',
      permission_mode: permissionModeRef.current
    });
    setInput('');
    setPendingAttachments([]);
    setPreviewAttachmentImage(null);
    setAttachmentCount(0);
    setIsPermissionMenuOpen(false);
    setIsActionsMenuOpen(false);
    void effectiveSendPrompt(finalPrompt, {
      attachments: attachmentsToSend,
      isAnnotated: attachmentsToSend.some((item) => item.isAnnotated),
      targetTabId: populatedInputTargetTabId
    });
    setPopulatedInputTargetTabId(undefined);
  }, [
    input,
    pendingAttachments,
    populatedInputTargetTabId,
    effectiveSendPrompt,
    effectiveIsAgentRunning,
    apiKey,
    effectiveMessagesClient,
    setInput,
    setPendingAttachments,
    setPreviewAttachmentImage,
    setAttachmentCount,
    setIsPermissionMenuOpen,
    setIsActionsMenuOpen,
    setPopulatedInputTargetTabId,
    selectedModelRef,
    permissionModeRef
  ]);

  const insertShortcutChip = useCallback(
    (command: string, label?: string) => {
      void trackEvent('superduck.sidebar.shortcut_used', { command });
      inputRef.current?.clear();
      inputRef.current?.insertShortcut(command, label || command);
      inputRef.current?.focus();
    },
    [inputRef]
  );

  const navigateActiveTabToUrl = useCallback(async (url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return;
      }

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (tabs[0]?.id) {
        await chrome.tabs.update(tabs[0].id, {
          url: parsedUrl.toString()
        });
      }
    } catch (error) {
      console.error('Failed to navigate to URL:', error);
    }
  }, []);

  return { submit, insertShortcutChip, navigateActiveTabToUrl };
}
