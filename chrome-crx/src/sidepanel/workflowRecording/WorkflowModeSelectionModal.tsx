import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Mic, X } from 'lucide-react';
import { GlobeIcon } from '@/sidepanel/components/icons';
import { Button } from '../../components/ui';

// Import the hero image
import recordWorkflowHeroImage from '../assets/recordWorkflowHero.png';

interface WorkflowModeSelectionModalProps {
  isOpen: boolean;
  onVoiceOver: () => void;
  onClose: () => void;
  currentUrl?: string;
  pageTitle?: string;
  hasMicrophonePermission: boolean;
}

export function WorkflowModeSelectionModal({
  isOpen,
  onVoiceOver,
  onClose,
  currentUrl,
  pageTitle,
  hasMicrophonePermission: initialHasMicrophonePermission
}: WorkflowModeSelectionModalProps) {
  const intl = useIntl();

  // Extract domain from URL
  const domain = useMemo(() => {
    if (!currentUrl) return '';
    try {
      return new URL(currentUrl).hostname;
    } catch {
      return '';
    }
  }, [currentUrl]);

  // Get high-quality favicon from active tab
  const [faviconUrl, setFaviconUrl] = useState('');
  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (
        tab?.favIconUrl &&
        !tab.favIconUrl.startsWith('chrome://') &&
        !tab.favIconUrl.startsWith('edge://') &&
        !tab.favIconUrl.startsWith('brave://')
      ) {
        setFaviconUrl(tab.favIconUrl);
      } else if (domain) {
        setFaviconUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
      }
    });
  }, [isOpen, domain]);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(
    initialHasMicrophonePermission
  );

  // Check microphone permission when modal opens
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'microphone' as PermissionName
        });
        setHasMicrophonePermission(permissionStatus.state === 'granted');

        permissionStatus.onchange = () => {
          setHasMicrophonePermission(permissionStatus.state === 'granted');
        };
      } catch {
        setHasMicrophonePermission(initialHasMicrophonePermission);
      }
    })();
  }, [isOpen, initialHasMicrophonePermission]);

  // Handle enable microphone click - open options page to request permission
  const handleEnableMicrophone = useCallback(async () => {
    const currentTab = await chrome.tabs.getCurrent();
    const returnTabId = currentTab?.id;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id || returnTabId;
    const url = chrome.runtime.getURL(
      `options.html#permissions?requestMicrophone=true&returnTabId=${tabId}`
    );
    chrome.tabs.create({ url });
  }, []);

  // Handle start recording click
  const handleStartRecording = useCallback(() => {
    onVoiceOver();
  }, [onVoiceOver]);

  if (!isOpen) return null;

  return (
    <div
      data-test-id="workflow-mode-selection-modal"
      className="flex flex-col h-full bg-background text-foreground"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              className="w-4 h-4 rounded-sm"
              alt=""
              onError={() => setFaviconError(true)}
            />
          ) : (
            <GlobeIcon size={16} className="text-muted-foreground" />
          )}
          <span className="text-muted-foreground text-xs truncate max-w-[200px]">
            {pageTitle || domain}
          </span>
        </div>
        <Button
          data-test-id="workflow-mode-close-button"
          onClick={onClose}
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
        >
          <X size={14} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
          {/* Hero Image */}
          <div className="w-full flex items-center justify-center">
            <img
              src={recordWorkflowHeroImage}
              alt={intl.formatMessage({
                defaultMessage: 'Teach SuperDuck your workflow',
                id: 'teach_superduck_your_workflow'
              })}
              className="w-[360px] h-auto"
            />
          </div>

          {/* Text Content */}
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              <FormattedMessage
                defaultMessage="Teach SuperDuck your workflow"
                id="teach_superduck_your_workflow"
              />
            </h2>
            <p className="text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
              {hasMicrophonePermission ? (
                <FormattedMessage
                  defaultMessage="Go through the steps as if you're teaching a new teammate. SuperDuck will learn the process and repeat it for you."
                  id="go_through_the_steps_as_if_youre_teaching"
                />
              ) : (
                <FormattedMessage
                  defaultMessage="Enable your microphone to narrate as you demonstrate the workflow. SuperDuck will learn the process and repeat it for you."
                  id="enable_your_microphone_to_narrate_as_you_demonstrate"
                />
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mx-auto mb-4 max-w-3xl w-full px-4">
        <div
          className="bg-card border border-border hover:border-border/85 rounded-2xl relative z-30 transition-colors focus-within:outline-none"
          style={{ boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.04)', outline: 'none' }}
        >
          <div className="flex flex-col gap-2 px-3 py-3">
            {hasMicrophonePermission ? (
              <Button
                variant="default"
                size="default"
                onClick={handleStartRecording}
                className="w-full justify-center"
              >
                <Mic size={14} className="mr-2 shrink-0" />
                <FormattedMessage defaultMessage="Start recording" id="start_recording" />
              </Button>
            ) : (
              <Button
                variant="default"
                size="default"
                onClick={handleEnableMicrophone}
                className="w-full justify-center"
              >
                <Mic size={14} className="mr-2 shrink-0" />
                <FormattedMessage defaultMessage="Enable microphone" id="enable_microphone" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
