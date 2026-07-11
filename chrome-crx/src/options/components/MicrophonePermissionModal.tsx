import React, { useCallback, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { CheckCircle2, Mic } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui';

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

  const closeAndReturn = useCallback(() => {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <Mic aria-hidden className="size-8 text-primary" />
          </div>
          <DialogTitle>
            <FormattedMessage
              defaultMessage="Enable microphone access"
              id="enable_microphone_access"
            />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              defaultMessage="SuperDuck needs microphone access to hear your voice narration while you demonstrate workflows. When prompted, select <strong>Allow while visiting the site</strong> to enable voice narration."
              id="superduck_needs_microphone_access_to_hear_your_voice"
              values={{
                strong: (chunks: React.ReactNode) => (
                  <span className="font-semibold text-foreground">{chunks}</span>
                )
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {permissionState === 'granted' ? (
          <Alert>
            <div className="flex items-center justify-center gap-2 text-primary">
              <CheckCircle2 aria-hidden className="size-5" />
              <span className="text-sm font-medium">
                <FormattedMessage
                  defaultMessage="Microphone access granted"
                  id="microphone_access_granted"
                />
              </span>
            </div>
            <AlertDescription className="mt-2 text-center">
              <FormattedMessage
                defaultMessage="Returning to your workflow..."
                id="returning_to_your_workflow"
              />
            </AlertDescription>
          </Alert>
        ) : permissionState === 'denied' ? (
          <Alert variant="destructive">
            <AlertDescription>
              <FormattedMessage
                defaultMessage="Microphone access was denied. You can either try again or <link>open Chrome settings</link> to enable microphone access."
                id="microphone_access_was_denied_you_can_either_try"
                values={{
                  link: (chunks: React.ReactNode) => (
                    <Button
                      variant="link"
                      onClick={() => {
                        const url = `chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2F${chrome.runtime.id}%2F`;
                        chrome.tabs.create({ url });
                      }}
                      className="p-0 h-auto font-normal text-destructive-foreground hover:text-destructive-foreground/80 underline hover:no-underline"
                    >
                      {chunks}
                    </Button>
                  )
                }}
              />
            </AlertDescription>
          </Alert>
        ) : null}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col sm:flex-col sm:justify-start">
          {permissionState !== 'granted' && permissionState !== 'denied' && (
            <Button
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
                      setError(
                        intl.formatMessage(
                          { defaultMessage: 'Error: {errorMessage}', id: 'error' },
                          { errorMessage: err.message }
                        )
                      );
                    }
                  } else if (err instanceof Error) {
                    setError(
                      intl.formatMessage(
                        { defaultMessage: 'Error: {errorMessage}', id: 'error' },
                        { errorMessage: err.message }
                      )
                    );
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
              className="w-full"
              size="lg"
            >
              <Mic data-icon="inline-start" className="size-4" />
              {isRequesting ? (
                <FormattedMessage defaultMessage="Requesting access..." id="requesting_access" />
              ) : (
                <FormattedMessage
                  defaultMessage="Allow microphone access"
                  id="allow_microphone_access"
                />
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <FormattedMessage defaultMessage="Skip for now" id="skip_for_now" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { MicrophonePermissionModal };
