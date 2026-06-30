import React from 'react';
import { MemoizedFormattedMessage } from '../../index-react-dom-intl';
import type { SupportedLocale } from '../../index-react-dom-intl';
import { useUIStore } from '../stores/uiStore';
import { useAgentStore } from '../stores/agentStore';
import { useAttachmentStore } from '../stores/attachmentStore';
import { useChatStore } from '../stores/chatStore';
import { useTabStore } from '../stores/tabStore';
import { CreateShortcutModal } from '../shortcutsMenu/CreateShortcutModal';
import { generateShortcutName } from '../session';
import { ImagePreviewModal, ScreenshotLightbox } from '@/sidepanel/components/MessageViews';
import { WorkflowModeSelectionModal } from '../workflowRecording/WorkflowModeSelectionModal';

import type { ModelRequest } from '../session';

export interface ModalsLayerProps {
  // Callbacks that require business logic
  handleStartWorkflowRecording: () => void;
  confirmLocaleChange: () => void;
  invokeSessionModel: (request: ModelRequest) => Promise<any>;
  selectedModel: string;
  hasMicrophonePermission: boolean;
  intl: {
    locale: string;
    formatMessage: (
      descriptor: { id: string; defaultMessage?: string },
      values?: Record<string, string | number | boolean | null | undefined>
    ) => string;
  };
  trackEvent: (event: string, properties?: Record<string, unknown>) => void;
}

/**
 * ModalsLayer — 所有模态框和浮层的统一出口
 * 从 stores 直接读取状态，消除 prop drilling
 */
export function ModalsLayer({
  handleStartWorkflowRecording,
  confirmLocaleChange,
  invokeSessionModel,
  selectedModel,
  hasMicrophonePermission,
  intl,
  trackEvent
}: ModalsLayerProps) {
  // ─── Read state from Zustand stores (no prop drilling) ───────────────────
  const showWorkflowModeSelectionModal = useUIStore((s) => s.showWorkflowModeSelectionModal);
  const setShowWorkflowModeSelectionModal = useUIStore((s) => s.setShowWorkflowModeSelectionModal);
  const pendingLocale = useUIStore((s) => s.pendingLocale);
  const setPendingLocale = useUIStore((s) => s.setPendingLocale);
  const pairingPrompt = useAgentStore((s) => s.pairingPrompt);
  const setPairingPrompt = useAgentStore((s) => s.setPairingPrompt);
  const pairingName = useAgentStore((s) => s.pairingName);
  const setPairingName = useAgentStore((s) => s.setPairingName);
  const promptToSave = useUIStore((s) => s.promptToSave);
  const setPromptToSave = useUIStore((s) => s.setPromptToSave);
  const promptToEdit = useUIStore((s) => s.promptToEdit);
  const setPromptToEdit = useUIStore((s) => s.setPromptToEdit);
  const screenshotPreviewUrl = useUIStore((s) => s.screenshotPreviewUrl);
  const setScreenshotPreviewUrl = useUIStore((s) => s.setScreenshotPreviewUrl);
  const previewAttachmentImage = useAttachmentStore((s) => s.previewAttachmentImage);
  const setPreviewAttachmentImage = useAttachmentStore((s) => s.setPreviewAttachmentImage);
  const setShowCommandMenu = useUIStore((s) => s.setShowCommandMenu);
  const setCommandSearchTerm = useUIStore((s) => s.setCommandSearchTerm);
  const setInput = useChatStore((s) => s.setInput);
  const currentPageUrl = useTabStore((s) => s.currentPageUrl);
  const currentPageTitle = useTabStore((s) => s.currentPageTitle);

  return (
    <>
      {/* Workflow Mode Selection Modal */}
      {showWorkflowModeSelectionModal && (
        <WorkflowModeSelectionModal
          isOpen={showWorkflowModeSelectionModal}
          onVoiceOver={handleStartWorkflowRecording}
          onClose={() => setShowWorkflowModeSelectionModal(false)}
          currentUrl={currentPageUrl}
          pageTitle={currentPageTitle}
          hasMicrophonePermission={hasMicrophonePermission}
        />
      )}

      {/* Pending Locale confirmation dialog */}
      {pendingLocale ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-sm rounded-2xl border border-border-300 bg-bg-100 p-4">
            <h3 className="text-base font-medium text-text-100">
              <MemoizedFormattedMessage defaultMessage="Change language" id="change_language" />
            </h3>
            <p className="text-sm text-text-300 mt-4">
              <MemoizedFormattedMessage
                defaultMessage="Changing the language will start a new chat."
                id="changing_the_language_will_start_a_new_chat"
              />
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-border-300 text-sm text-text-200 hover:bg-bg-200 transition-colors"
                onClick={() => setPendingLocale(null)}
              >
                <MemoizedFormattedMessage defaultMessage="Cancel" id="cancel" />
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-text-100 text-bg-100 text-sm hover:bg-text-200 transition-colors"
                onClick={confirmLocaleChange}
              >
                <MemoizedFormattedMessage defaultMessage="Continue" id="continue" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pairing prompt overlay */}
      {pairingPrompt ? (
        <div className="fixed inset-0 bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-md rounded-xl border border-border-300 bg-bg-000 p-4">
            <h3 className="text-base font-medium text-text-100 mb-2">
              <MemoizedFormattedMessage
                id="wants_to_connect"
                defaultMessage="{clientLabel} wants to connect"
                values={{
                  clientLabel: pairingPrompt.clientType.toLowerCase().includes('code')
                    ? 'Code Client'
                    : 'Desktop Client'
                }}
              />
            </h3>
            <p className="text-sm text-text-300 mb-3">
              <MemoizedFormattedMessage
                id="name_this_browser_so_you_can_identify_it"
                defaultMessage="Name this browser so you can identify it later."
              />
            </p>
            <input
              type="text"
              value={pairingName}
              onChange={(event) => setPairingName(event.target.value)}
              placeholder={intl.formatMessage({
                id: 'eg_work_laptop_personal_chrome',
                defaultMessage: 'e.g., "Work laptop", "Personal Chrome"'
              })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border-300 bg-bg-100 text-text-100"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={async () => {
                  await chrome.runtime.sendMessage({
                    type: 'pairing_dismissed',
                    request_id: pairingPrompt.requestId
                  });
                  void trackEvent('superduck.sidebar.pairing_dismissed', {});
                  setPairingPrompt(null);
                  setPairingName('');
                }}
                className="px-3 py-2 text-sm rounded-lg border border-border-300 text-text-200"
              >
                <MemoizedFormattedMessage id="ignore" defaultMessage="Ignore" />
              </button>
              <button
                type="button"
                disabled={!pairingName.trim()}
                onClick={async () => {
                  await chrome.runtime.sendMessage({
                    type: 'pairing_confirmed',
                    request_id: pairingPrompt.requestId,
                    name: pairingName.trim()
                  });
                  void trackEvent('superduck.sidebar.pairing_confirmed', {});
                  setPairingPrompt(null);
                  setPairingName('');
                }}
                className="px-3 py-2 text-sm rounded-lg bg-accent-main-100 text-oncolor-100 disabled:opacity-50"
              >
                <MemoizedFormattedMessage id="connect" defaultMessage="Connect" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create Shortcut Modal */}
      {(promptToSave !== null || promptToEdit !== null) && (
        <CreateShortcutModal
          prompt={promptToEdit || promptToSave || undefined}
          currentModel={selectedModel}
          onClose={() => {
            setPromptToSave(null);
            setPromptToEdit(null);
          }}
          onSave={(commandName) => {
            if (promptToSave) {
              setPromptToSave(null);
              setInput(`/${commandName}`);
              setShowCommandMenu(true);
              setCommandSearchTerm(commandName);
            } else {
              setPromptToEdit(null);
            }
          }}
          onDelete={() => setPromptToEdit(null)}
          generateName={async (prompt) => {
            try {
              return await generateShortcutName(
                prompt,
                invokeSessionModel,
                intl.locale as SupportedLocale
              );
            } catch {
              return '';
            }
          }}
        />
      )}

      {/* Screenshot preview */}
      {screenshotPreviewUrl && (
        <ScreenshotLightbox
          imageUrl={screenshotPreviewUrl}
          onClose={() => setScreenshotPreviewUrl(null)}
        />
      )}

      {/* Attachment image preview */}
      <ImagePreviewModal
        imageUrl={previewAttachmentImage}
        onClose={() => setPreviewAttachmentImage(null)}
      />
    </>
  );
}
