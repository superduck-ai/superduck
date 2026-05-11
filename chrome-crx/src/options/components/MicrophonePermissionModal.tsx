import React, { useCallback, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { CloseIconAlt as XIcon } from '@/components/icons/CloseIconAlt';
import { MicrophoneIcon } from '@/components/icons/MicrophoneIcon';

interface MicrophonePermissionModalProps {
  isOpen: boolean;
  returnTabId: number | undefined;
  onClose: () => void;
}

const MicrophonePermissionModal: React.FC<MicrophonePermissionModalProps> = ({
  isOpen,
  returnTabId,
  onClose
}) => {
  const intl = useIntl();
  const [permissionState, setPermissionState] = useState<string>('unknown');
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const closeAndReturn = useCallback(() => {
    setIsClosing(true);
    if (returnTabId) {
      chrome.tabs.update(returnTabId, { active: true }, () => {
        chrome.tabs.getCurrent((tab) => {
          if (tab?.id) chrome.tabs.remove(tab.id);
        });
      });
    } else {
      chrome.tabs.getCurrent((tab) => {
        if (tab?.id) chrome.tabs.remove(tab.id);
      });
    }
  }, [returnTabId]);

  const checkPermission = useCallback(async () => {
    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName
      });
      setPermissionState(status.state);
      status.addEventListener('change', () => {
        const nextState = status.state;
        setPermissionState(nextState);
        if (nextState === 'granted') {
          closeAndReturn();
        }
      });
    } catch {
      setPermissionState('unknown');
    }
  }, [closeAndReturn]);

  useEffect(() => {
    if (isOpen) {
      void checkPermission();
    }
  }, [checkPermission, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
    >
      <div
        className={`bg-bg-000 rounded-2xl shadow-xl max-w-md w-full mx-4 transform transition-all duration-200 ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="w-8" />
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-200 transition-colors"
            aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
          >
            <XIcon size={16} className="text-text-300" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-2 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-main-100/10 flex items-center justify-center">
            <MicrophoneIcon size={32} weight="fill" className="text-accent-main-100" />
          </div>

          <h2 className="font-xl-bold text-text-100 mb-2">
            <FormattedMessage
              defaultMessage="Enable microphone access"
              id="enable_microphone_access"
            />
          </h2>

          <p className="text-text-300 font-base mb-6">
            <FormattedMessage
              defaultMessage="SuperDuck needs microphone access to hear your voice narration while you demonstrate workflows. When prompted, select <strong>Allow while visiting the site</strong> to enable voice narration."
              id="superduck_needs_microphone_access_to_hear_your_voice"
              values={{
                strong: (chunks: React.ReactNode) => (
                  <span className="font-semibold text-text-200">{chunks}</span>
                )
              }}
            />
          </p>

          {permissionState === 'granted' ? (
            <div className="mb-6 p-4 bg-success-100/10 border border-success-100/20 rounded-xl">
              <div className="flex items-center justify-center gap-2 text-success-100">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-large">
                  <FormattedMessage
                    defaultMessage="Microphone access granted"
                    id="microphone_access_granted"
                  />
                </span>
              </div>
              <p className="text-text-300 font-base-sm mt-2">
                <FormattedMessage
                  defaultMessage="Returning to your workflow..."
                  id="returning_to_your_workflow"
                />
              </p>
            </div>
          ) : permissionState === 'denied' ? (
            <div className="mb-6 p-4 bg-danger-000/10 border border-danger-000/20 rounded-xl">
              <p className="font-base text-danger-000">
                <FormattedMessage
                  defaultMessage="Microphone access was denied. You can either try again or <link>open Chrome settings</link> to enable microphone access."
                  id="microphone_access_was_denied_you_can_either_try"
                  values={{
                    link: (chunks: React.ReactNode) => (
                      <button
                        onClick={() => {
                          const url = `chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2F${chrome.runtime.id}%2F`;
                          chrome.tabs.create({ url });
                        }}
                        className="underline hover:no-underline"
                      >
                        {chunks}
                      </button>
                    )
                  }}
                />
              </p>
            </div>
          ) : null}

          {error && (
            <div className="mb-6 p-4 bg-danger-000/10 border border-danger-000/20 rounded-xl">
              <p className="font-base text-danger-000">{error}</p>
            </div>
          )}

          {permissionState !== 'granted' && permissionState !== 'denied' && (
            <button
              onClick={async () => {
                setIsRequesting(true);
                setError(null);
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  stream.getTracks().forEach((track) => track.stop());
                  const result = await navigator.permissions.query({
                    name: 'microphone' as PermissionName
                  });
                  if (result.state === 'granted') {
                    closeAndReturn();
                  } else {
                    setIsRequesting(false);
                    setError(
                      intl.formatMessage({
                        id: 'allow_this_time_warning',
                        defaultMessage:
                          'You selected "Allow this time" which doesn\'t persist. Please click the button again and select "Allow while visiting the site" to enable voice narration.'
                      })
                    );
                  }
                } catch (err: unknown) {
                  setIsRequesting(false);
                  if (err instanceof DOMException) {
                    if (err.name === 'NotAllowedError') {
                      await checkPermission();
                    } else if (err.name === 'NotFoundError') {
                      setError(
                        intl.formatMessage({
                          id: 'no_microphone_found_please_connect_a_microphone_and',
                          defaultMessage:
                            'No microphone found. Please connect a microphone and try again.'
                        })
                      );
                    } else {
                      setError(`Error: ${err.message}`);
                    }
                  } else if (err instanceof Error) {
                    setError(`Error: ${err.message}`);
                  } else {
                    setError(
                      intl.formatMessage({
                        id: 'an_unknown_error_occurred',
                        defaultMessage: 'An unknown error occurred'
                      })
                    );
                  }
                }
              }}
              disabled={isRequesting}
              className="w-full px-6 py-3 bg-accent-main-100 text-oncolor-100 rounded-xl hover:bg-accent-main-100/90 transition-all font-large disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <MicrophoneIcon size={20} weight="fill" />
              {isRequesting ? (
                <FormattedMessage defaultMessage="Requesting access..." id="requesting_access" />
              ) : (
                <FormattedMessage
                  defaultMessage="Allow microphone access"
                  id="allow_microphone_access"
                />
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="mt-4 text-text-300 hover:text-text-200 font-base-sm transition-colors"
          >
            <FormattedMessage defaultMessage="Skip for now" id="skip_for_now" />
          </button>
        </div>
      </div>
    </div>
  );
};

export { MicrophonePermissionModal };
