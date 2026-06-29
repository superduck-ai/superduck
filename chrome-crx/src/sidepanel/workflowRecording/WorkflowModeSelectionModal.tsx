import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { GlobeIcon } from '@/sidepanel/components/icons';
import { Button } from '../../components/ui';

// Import the hero image
import recordWorkflowHeroImage from '../assets/recordWorkflowHero.png';

// Microphone icon component
const MicrophoneIcon: React.FC<{ size?: number; weight?: string; className?: string }> = ({
  size = 16,
  weight: _weight = 'regular',
  className = ''
}) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" className={className}>
    <path d="M128,176a48.05,48.05,0,0,0,48-48V64a48,48,0,0,0-96,0v64A48.05,48.05,0,0,0,128,176ZM96,64a32,32,0,0,1,64,0v64a32,32,0,0,1-64,0Zm40,143.6V232a8,8,0,0,1-16,0V207.6A80.11,80.11,0,0,1,48,128a8,8,0,0,1,16,0,64,64,0,0,0,128,0,8,8,0,0,1,16,0A80.11,80.11,0,0,1,136,207.6Z" />
  </svg>
);

// X/Close icon component
const XIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" className={className}>
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </svg>
);

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
    <div data-test-id="workflow-mode-selection-modal" className="flex flex-col h-full bg-bg-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              className="w-4 h-4"
              alt=""
              onError={() => setFaviconError(true)}
            />
          ) : (
            <GlobeIcon size={16} className="text-text-300" />
          )}
          <span className="text-text-200 font-base-sm truncate max-w-[200px]">
            {pageTitle || domain}
          </span>
        </div>
        <button
          data-test-id="workflow-mode-close-button"
          onClick={onClose}
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
        >
          <XIcon size={12} />
        </button>
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
            <h2 className="font-base-bold text-text-100">
              <FormattedMessage
                defaultMessage="Teach SuperDuck your workflow"
                id="teach_superduck_your_workflow"
              />
            </h2>
            <p className="text-text-300 font-base max-w-[280px] mx-auto">
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
      <div className="mx-auto mb-3 max-w-3xl w-full px-3">
        <div
          className="bg-bg-000 border-[0.5px] border-border-300 hover:border-border-200 rounded-[14px] relative z-30 transition-colors focus-within:outline-none"
          style={{ boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.04)', outline: 'none' }}
        >
          <div className="flex flex-col gap-2 px-3 py-3">
            {hasMicrophonePermission ? (
              <Button
                variant="primary"
                size="default"
                onClick={handleStartRecording}
                className="w-full justify-center bg-always-black text-oncolor-100 hover:bg-always-black/90"
              >
                <MicrophoneIcon size={16} weight="fill" className="mr-2" />
                <FormattedMessage defaultMessage="Start recording" id="start_recording" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="default"
                onClick={handleEnableMicrophone}
                className="w-full justify-center bg-always-black text-oncolor-100 hover:bg-always-black/90"
              >
                <MicrophoneIcon size={16} weight="fill" className="mr-2" />
                <FormattedMessage defaultMessage="Enable microphone" id="enable_microphone" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
