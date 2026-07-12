import React from 'react';
import { FormattedMessage } from 'react-intl';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input
} from '@/components/ui';

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
      <Dialog open={!!pendingLocale} onOpenChange={(open) => !open && setPendingLocale(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              <MemoizedFormattedMessage defaultMessage="Change language" id="change_language" />
            </DialogTitle>
            <DialogDescription>
              <MemoizedFormattedMessage
                defaultMessage="Changing the language will start a new chat."
                id="changing_the_language_will_start_a_new_chat"
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingLocale(null)}>
              <MemoizedFormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button variant="default" size="sm" onClick={confirmLocaleChange}>
              <MemoizedFormattedMessage defaultMessage="Continue" id="continue" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pairing prompt overlay */}
      <Dialog
        open={!!pairingPrompt}
        onOpenChange={async (open) => {
          if (!open && pairingPrompt) {
            await chrome.runtime.sendMessage({
              type: 'pairing_dismissed',
              request_id: pairingPrompt.requestId
            });
            void trackEvent('superduck.sidebar.pairing_dismissed', {});
            setPairingPrompt(null);
            setPairingName('');
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage
                id="wants_to_connect"
                defaultMessage="{clientLabel} wants to connect"
                values={{
                  clientLabel: pairingPrompt?.clientType.toLowerCase().includes('code')
                    ? 'Code Client'
                    : 'Desktop Client'
                }}
              />
            </DialogTitle>
            <DialogDescription>
              <MemoizedFormattedMessage
                id="name_this_browser_so_you_can_identify_it"
                defaultMessage="Name this browser so you can identify it later."
              />
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="text"
              value={pairingName}
              onChange={(event) => setPairingName(event.target.value)}
              placeholder={intl.formatMessage({
                id: 'eg_work_laptop_personal_chrome',
                defaultMessage: 'e.g., "Work laptop", "Personal Chrome"'
              })}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (pairingPrompt) {
                  await chrome.runtime.sendMessage({
                    type: 'pairing_dismissed',
                    request_id: pairingPrompt.requestId
                  });
                  void trackEvent('superduck.sidebar.pairing_dismissed', {});
                  setPairingPrompt(null);
                  setPairingName('');
                }
              }}
            >
              <MemoizedFormattedMessage id="ignore" defaultMessage="Ignore" />
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!pairingName.trim()}
              onClick={async () => {
                if (pairingPrompt) {
                  await chrome.runtime.sendMessage({
                    type: 'pairing_confirmed',
                    request_id: pairingPrompt.requestId,
                    name: pairingName.trim()
                  });
                  void trackEvent('superduck.sidebar.pairing_confirmed', {});
                  setPairingPrompt(null);
                  setPairingName('');
                }
              }}
            >
              <MemoizedFormattedMessage id="connect" defaultMessage="Connect" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
