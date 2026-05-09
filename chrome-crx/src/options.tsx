import './styles/index.css';
import './styles/scheduling.css';
import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import ReactDOM from 'react-dom/client';
import { useIntl, FormattedMessage } from 'react-intl';
import { createLucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnalytics, useAuth, Spinner, AnalyticsContext, AuthContext } from './components/SchedulingFields';
import { PermissionManager, initSentry, initHoneycomb } from './PermissionManager';
import {
  CloseIconAlt as XIcon,
  MicrophoneIcon,
  useStorageState
} from '@/components/useStorageState';
import { StorageKeys, getStorageValue, loginWithProvider, FeatureProvider } from './SavedPromptsService';
import { T as TasksTab } from '@/components/TasksTab';
import { IntlMessageLoaderProvider } from './index-react-dom-intl';
import { MODEL_MAPPING_KEYS } from './utils/modelMapping';

const CUSTOM_API_URL_KEY = 'customApiUrl';
const CUSTOM_API_KEY_KEY = 'customApiKey';

// =============================================================================
// Lucide Icons
// =============================================================================

const LogOutIcon = createLucideIcon('log-out', [
  ['path', { d: 'm16 17 5-5-5-5', key: '1bji2h' }],
  ['path', { d: 'M21 12H9', key: 'dn1m92' }],
  ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', key: '1uf3rs' }]
]);

const UserIcon = createLucideIcon('user', [
  [
    'path',
    {
      d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2',
      key: '975kel'
    }
  ],
  ['circle', { cx: '12', cy: '7', r: '4', key: '17ys0d' }]
]);

// =============================================================================
// MicrophonePermissionModal
// =============================================================================

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
        const newState = status.state;
        setPermissionState(newState);
        if (newState === 'granted') {
          closeAndReturn();
        }
      });
    } catch {
      setPermissionState('unknown');
    }
  }, [closeAndReturn]);

  useEffect(() => {
    if (isOpen) checkPermission();
  }, [isOpen, checkPermission]);

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
    >
      <div
        className={`bg-bg-000 rounded-2xl shadow-xl max-w-md w-full mx-4 transform transition-all duration-200 ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="w-8" />{' '}
          <button
            onClick={handleSkip}
            className="p-2 rounded-lg hover:bg-bg-200 transition-colors"
            aria-label={intl.formatMessage({
              defaultMessage: 'Close',
              id: 'close'
            })}
          >
            <XIcon size={16} className="text-text-300" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-2 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-main-100/10 flex items-center justify-center">
            <MicrophoneIcon size={32} weight="fill" className="text-accent-main-100" />
          </div>

          <h2 className="font-xl-bold text-text-100 mb-2">
            <FormattedMessage defaultMessage="Enable microphone access" id="enable_microphone_access" />
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
                  <FormattedMessage defaultMessage="Microphone access granted" id="microphone_access_granted" />
                </span>
              </div>
              <p className="text-text-300 font-base-sm mt-2">
                <FormattedMessage defaultMessage="Returning to your workflow..." id="returning_to_your_workflow" />
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
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true
                  });
                  stream.getTracks().forEach((t) => t.stop());
                  const result = await navigator.permissions.query({
                    name: 'microphone' as PermissionName
                  });
                  if (result.state === 'granted') {
                    closeAndReturn();
                  } else {
                    setIsRequesting(false);
                    setError(
                      intl.formatMessage({ id: 'allow_this_time_warning', defaultMessage: 'You selected "Allow this time" which doesn\'t persist. Please click the button again and select "Allow while visiting the site" to enable voice narration.' })
                    );
                  }
                } catch (err: any) {
                  setIsRequesting(false);
                  if (err instanceof DOMException) {
                    if (err.name === 'NotAllowedError') {
                      await checkPermission();
                    } else if (err.name === 'NotFoundError') {
                      setError(intl.formatMessage({ id: 'no_microphone_found_please_connect_a_microphone_and', defaultMessage: 'No microphone found. Please connect a microphone and try again.' }));
                    } else {
                      setError(`Error: ${err.message}`);
                    }
                  } else if (err instanceof Error) {
                    setError(`Error: ${err.message}`);
                  } else {
                    setError(intl.formatMessage({ id: 'an_unknown_error_occurred', defaultMessage: 'An unknown error occurred' }));
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
                <FormattedMessage defaultMessage="Allow microphone access" id="allow_microphone_access" />
              )}
            </button>
          )}

          <button
            onClick={handleSkip}
            className="mt-4 text-text-300 hover:text-text-200 font-base-sm transition-colors"
          >
            <FormattedMessage defaultMessage="Skip for now" id="skip_for_now" />
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// PageContent
// =============================================================================

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}

const PageContent: React.FC<PageContentProps> = ({ children, className, narrow }) => (
  <main
    className={cn(
      'mx-auto mt-4 w-full flex-1 px-4 md:pl-8 lg:mt-6',
      narrow ? 'max-w-4xl' : 'max-w-7xl',
      className
    )}
  >
    {children}
  </main>
);

// =============================================================================
// PageHeader
// =============================================================================

interface PageHeaderProps {
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  sticky?: boolean;
  fixed?: boolean;
  mdTitle?: string;
  large?: boolean;
  narrow?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  children,
  className,
  contentClassName,
  sticky,
  fixed,
  mdTitle,
  large,
  narrow
}) => {
  const intl = useIntl();
  const isEmpty = !children && !mdTitle;
  const isLarge = large;

  return (
    <header
      className={cn(
        'flex w-full bg-bg-100',
        sticky && 'sticky top-0 z-header',
        fixed && 'fixed top-0 z-header',
        'h-12',
        isLarge && ['mx-auto md:h-24 md:items-end', narrow ? 'max-w-4xl' : 'max-w-7xl'],
        className
      )}
      aria-hidden={isEmpty}
    >
      <div
        className={cn(
          'flex w-full items-center justify-between gap-4',
          'pl-11 lg:pl-8',
          contentClassName,
          isLarge ? 'px-4 md:pl-8' : 'pr-3'
        )}
      >
        {mdTitle ? (
          <>
            <h1
              className={cn(
                'text-text-200 flex items-center gap-2 max-md:hidden min-w-0',
                'font-heading',
                isLarge ? 'text-2xl' : 'text-lg'
              )}
            >
              <span className="truncate">{mdTitle === 'Settings' ? intl.formatMessage({ id: 'settings', defaultMessage: 'Settings' }) : mdTitle}</span>
            </h1>
            <div />
            {children}
          </>
        ) : (
          children
        )}
      </div>
    </header>
  );
};

// =============================================================================
// MicrophoneSettings
// =============================================================================

interface MicrophoneSettingsProps {
  analytics?: any;
}

const MicrophoneSettings: React.FC<MicrophoneSettingsProps> = ({ analytics }) => {
  const intl = useIntl();
  const [permissionState, setPermissionState] = useState<string>('unknown');
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkPermission = useCallback(async () => {
    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName
      });
      setPermissionState(status.state);
      status.addEventListener('change', () => {
        setPermissionState(status.state);
      });
    } catch {
      setPermissionState('unknown');
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const openChromeSettings = () => {
    chrome.tabs.create({
      url: `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}`
    });
  };

  return (
    <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
      <h3 className="text-text-100 font-xl-bold">
        <FormattedMessage defaultMessage="Microphone" id="microphone" />
      </h3>
      <p className="text-text-300 font-base mt-2 mb-6">
        <FormattedMessage
          defaultMessage="Enable microphone access to use your browser's speech-to-text functionality for voice narration during workflow recording"
          id="enable_microphone_access_to_use_your_browsers_speechtotext"
        />
      </p>

      <div className="py-4">
        {(permissionState === 'prompt' || permissionState === 'unknown') && (
          <div>
            <button
              onClick={async () => {
                setIsRequesting(true);
                setError(null);
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true
                  });
                  stream.getTracks().forEach((t) => t.stop());
                  await checkPermission();
                  analytics?.track('superduck.settings.microphone_enabled', {
                    timestamp: Date.now()
                  });
                } catch (err: any) {
                  if (err instanceof DOMException) {
                    if (err.name === 'NotAllowedError') {
                      setError(
                        intl.formatMessage({
                          defaultMessage:
                            'Permission denied. You can change this in your browser settings.',
                          id: 'permission_denied_you_can_change_this'
                        })
                      );
                    } else if (err.name === 'NotFoundError') {
                      setError(
                        intl.formatMessage({
                          defaultMessage:
                            'No microphone found. Please connect a microphone and try again.',
                          id: 'no_microphone_found_please_connect_a'
                        })
                      );
                    } else {
                      setError(
                        intl.formatMessage(
                          {
                            defaultMessage: 'Error: {errorMessage}',
                            id: 'error'
                          },
                          { errorMessage: err.message }
                        )
                      );
                    }
                  } else if (err instanceof Error) {
                    setError(
                      intl.formatMessage(
                        {
                          defaultMessage: 'Error: {errorMessage}',
                          id: 'error'
                        },
                        { errorMessage: err.message }
                      )
                    );
                  } else {
                    setError(
                      intl.formatMessage({
                        defaultMessage: 'An unknown error occurred',
                        id: 'an_unknown_error_occurred'
                      })
                    );
                  }
                  await checkPermission();
                } finally {
                  setIsRequesting(false);
                }
              }}
              disabled={isRequesting}
              className="px-6 py-2.5 bg-accent-main-100 text-oncolor-100 rounded-lg hover:bg-accent-main-100/90 transition-all font-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRequesting ? (
                <FormattedMessage defaultMessage="Requesting..." id="requesting" />
              ) : (
                <FormattedMessage defaultMessage="Allow Microphone Access" id="allow_microphone_access_2" />
              )}
            </button>
            {error && (
              <div className="mt-3 px-4 py-3 bg-danger-000/10 border border-danger-000/20 rounded-lg">
                <p className="font-base text-danger-000">{error}</p>
              </div>
            )}
          </div>
        )}

        {permissionState === 'granted' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-success-100 flex items-center justify-center mt-0.5">
              <svg
                className="w-3 h-3 text-oncolor-100"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="font-large text-text-100">
                <FormattedMessage defaultMessage="Microphone access granted" id="microphone_access_granted" />
              </div>
              <div className="text-text-400 font-base-sm mt-1">
                <FormattedMessage
                  defaultMessage="You can now use voice narration when recording workflows. To disable, go to {chromeSettingsLink}."
                  id="you_can_now_use_voice_narration_when_recording"
                  values={{
                    chromeSettingsLink: (
                      <button
                        onClick={openChromeSettings}
                        className="text-accent-main-100 hover:underline cursor-pointer"
                      >
                        <FormattedMessage defaultMessage="Chrome settings" id="chrome_settings" />
                      </button>
                    )
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {permissionState === 'denied' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-danger-200 flex items-center justify-center mt-0.5">
              <svg
                className="w-3 h-3 text-danger-000"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <div className="font-large text-text-100">
                <FormattedMessage defaultMessage="Microphone access blocked" id="microphone_access_blocked" />
              </div>
              <div className="text-text-400 font-base-sm mt-1">
                <FormattedMessage
                  defaultMessage="Microphone access has been denied. To enable, change Microphone to 'Allow' in {chromeSettingsLink}."
                  id="microphone_access_has_been_denied_to"
                  values={{
                    chromeSettingsLink: (
                      <button
                        onClick={openChromeSettings}
                        className="text-accent-main-100 hover:underline cursor-pointer"
                      >
                        <FormattedMessage defaultMessage="Chrome settings" id="chrome_settings" />
                      </button>
                    )
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// PermissionsTab
// =============================================================================

interface PermissionsByScope {
  netloc: any[];
  domain_transition: any[];
}

const PermissionsTab: React.FC = () => {
  const intl = useIntl();
  const [permissions, setPermissions] = useState<PermissionsByScope>();
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useStorageState<
    'enabled' | 'disabled' | undefined
  >(StorageKeys.NOTIFICATIONS_ENABLED, undefined);
  const [debugMode, setDebugMode] = useStorageState<boolean>(
    StorageKeys.DEBUG_MODE,
    false
  );
  const [customApiUrl, setCustomApiUrl] = useStorageState<string>(CUSTOM_API_URL_KEY, '');
  const [customApiKey, setCustomApiKey] = useStorageState<string>(CUSTOM_API_KEY_KEY, '');
  const [modelMappingHaiku, setModelMappingHaiku] = useStorageState<string>(MODEL_MAPPING_KEYS.HAIKU, '');
  const [modelMappingSonnet, setModelMappingSonnet] = useStorageState<string>(MODEL_MAPPING_KEYS.SONNET, '');
  const [modelMappingOpus, setModelMappingOpus] = useStorageState<string>(MODEL_MAPPING_KEYS.OPUS, '');
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [haikuModelInput, setHaikuModelInput] = useState('');
  const [sonnetModelInput, setSonnetModelInput] = useState('');
  const [opusModelInput, setOpusModelInput] = useState('');
  const [apiSaveStatus, setApiSaveStatus] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { analytics } = useAnalytics();

  const permissionManager = useMemo(() => new PermissionManager(() => false), []);

  const loadPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      await permissionManager.loadPermissions();
      const byScope = permissionManager.getPermissionsByScope();
      setPermissions({
        netloc: byScope.netloc.filter((p: any) => !p.toolUseId),
        domain_transition: byScope.domain_transition.filter((p: any) => !p.toolUseId)
      });
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [permissionManager]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    setApiUrlInput(customApiUrl || '');
  }, [customApiUrl]);

  useEffect(() => {
    setApiKeyInput(customApiKey || '');
  }, [customApiKey]);

  useEffect(() => {
    setHaikuModelInput(modelMappingHaiku || '');
  }, [modelMappingHaiku]);

  useEffect(() => {
    setSonnetModelInput(modelMappingSonnet || '');
  }, [modelMappingSonnet]);

  useEffect(() => {
    setOpusModelInput(modelMappingOpus || '');
  }, [modelMappingOpus]);

  const handleRevoke = async (id: string) => {
    await permissionManager.revokePermission(id);
    loadPermissions();
  };

  const formatScope = (permission: any): string => {
    if (permission.scope.type === 'domain_transition') {
      return `${permission.scope.fromDomain} → ${permission.scope.toDomain}`;
    }
    return (
      permission.scope.netloc ||
      intl.formatMessage({
        defaultMessage: 'Unknown domain',
        id: 'unknown_domain'
      })
    );
  };

  const handleSaveCustomApi = async () => {
    const normalizedUrl = apiUrlInput.trim().replace(/\/+$/, '');
    // Atomic write to avoid racing between sidepanel listeners
    await chrome.storage.local.set({
      [CUSTOM_API_URL_KEY]: normalizedUrl,
      [CUSTOM_API_KEY_KEY]: apiKeyInput.trim(),
      [MODEL_MAPPING_KEYS.HAIKU]: haikuModelInput.trim(),
      [MODEL_MAPPING_KEYS.SONNET]: sonnetModelInput.trim(),
      [MODEL_MAPPING_KEYS.OPUS]: opusModelInput.trim()
    });
    setApiSaveStatus(intl.formatMessage({ id: 'saved_reopen_sidepanel', defaultMessage: 'Saved. Reopen sidepanel to apply.' }));
  };

  const handleClearCustomApi = async () => {
    await chrome.storage.local.set({
      [CUSTOM_API_URL_KEY]: '',
      [CUSTOM_API_KEY_KEY]: '',
      [MODEL_MAPPING_KEYS.HAIKU]: '',
      [MODEL_MAPPING_KEYS.SONNET]: '',
      [MODEL_MAPPING_KEYS.OPUS]: ''
    });
    setApiSaveStatus(intl.formatMessage({ id: 'cleared_status', defaultMessage: 'Cleared.' }));
  };

  if (isLoading) {
    return (
      <div className="p-6 text-text-200">
        <FormattedMessage defaultMessage="Loading permissions..." id="loading_permissions" />
      </div>
    );
  }

  return (
    <div className="permissions-tab">
      <div className="space-y-6">
        {/* Custom API */}
        <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
          <h3 className="text-text-100 font-xl-bold"><FormattedMessage id="custom_api_endpoint" defaultMessage="Custom API Endpoint" /></h3>
          <p className="text-text-300 font-base mt-2 mb-6">
            <FormattedMessage id="configure_api_url_and_api_key" defaultMessage="Configure api_url and api_key used by sidepanel so it can run without the Sign in page." />
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-text-200 font-base-sm mb-1"><FormattedMessage id="api_url_label" defaultMessage="API URL" /></label>
              <input
                type="text"
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="https://your-api-host.com"
                className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
              />
            </div>
            <div>
              <label className="block text-text-200 font-base-sm mb-1"><FormattedMessage id="api_key_label" defaultMessage="API Key" /></label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="your_api_key"
                  className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 pr-10 text-sm text-text-100"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-300 hover:text-text-100 transition-colors"
                  aria-label={intl.formatMessage({ id: showApiKey ? 'hide_api_key' : 'show_api_key', defaultMessage: showApiKey ? 'Hide API key' : 'Show API key' })}
                >
                  {showApiKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Advanced Configuration */}
            <div className="border-t border-border-300 pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-text-200 hover:text-text-100 font-base-sm transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <FormattedMessage id="advanced_configuration" defaultMessage="Advanced Configuration" />
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 pl-6">
                  <div className="text-text-300 font-base-sm mb-4">
                    <p className="font-semibold text-text-200 mb-1"><FormattedMessage id="model_mapping" defaultMessage="Model Mapping" /></p>
                    <p><FormattedMessage id="model_mapping_description" defaultMessage="If the provider natively supports the default models, no configuration is usually needed. Only fill in when you need to map requests to different model names." /></p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-text-200 font-base-sm mb-1"><FormattedMessage id="opus_default_model" defaultMessage="Deep Default Model" /></label>
                      <input
                        type="text"
                        value={opusModelInput}
                        onChange={(e) => setOpusModelInput(e.target.value)}
                        placeholder={intl.formatMessage({ id: 'model_placeholder', defaultMessage: 'e.g.: kimi-k2.5' })}
                        className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
                      />
                    </div>

                    <div>
                      <label className="block text-text-200 font-base-sm mb-1"><FormattedMessage id="sonnet_default_model" defaultMessage="Auto Default Model" /></label>
                      <input
                        type="text"
                        value={sonnetModelInput}
                        onChange={(e) => setSonnetModelInput(e.target.value)}
                        placeholder={intl.formatMessage({ id: 'model_placeholder', defaultMessage: 'e.g.: kimi-k2.5' })}
                        className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
                      />
                    </div>

                    <div>
                      <label className="block text-text-200 font-base-sm mb-1"><FormattedMessage id="haiku_default_model" defaultMessage="Flash Default Model" /></label>
                      <input
                        type="text"
                        value={haikuModelInput}
                        onChange={(e) => setHaikuModelInput(e.target.value)}
                        placeholder={intl.formatMessage({ id: 'model_placeholder', defaultMessage: 'e.g.: kimi-k2.5' })}
                        className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={() => void handleSaveCustomApi()}
              className="px-4 py-2 bg-accent-main-100 text-oncolor-100 rounded-lg font-base-sm hover:bg-accent-main-200 transition-colors"
            >
              <FormattedMessage id="save" defaultMessage="Save" />
            </button>
            <button
              onClick={() => void handleClearCustomApi()}
              className="px-4 py-2 border border-border-300 text-text-200 rounded-lg font-base-sm hover:bg-bg-200 transition-colors"
            >
              <FormattedMessage id="clear" defaultMessage="Clear" />
            </button>
          </div>

          {apiSaveStatus ? (
            <p className="text-text-300 font-base-sm mt-3">{apiSaveStatus}</p>
          ) : null}
        </div>

        {/* Notifications */}
        <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
          <h3 className="text-text-100 font-xl-bold">
            <FormattedMessage defaultMessage="Notifications" id="notifications" />
          </h3>
          <p className="text-text-300 font-base mt-2 mb-6">
            <FormattedMessage
              defaultMessage="Get notified when tasks complete or need your input"
              id="get_notified_when_tasks_complete_or_need_your"
            />
          </p>
          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <div className="font-large text-text-100">
                <FormattedMessage defaultMessage="Task completion notifications" id="task_completion_notifications" />
              </div>
              <div className="text-text-400 font-base-sm mt-1">
                {notificationsEnabled === 'enabled' ? (
                  <FormattedMessage
                    defaultMessage="You'll receive notifications when tasks finish"
                    id="youll_receive_notifications_when_tasks_finish"
                  />
                ) : notificationsEnabled === 'disabled' ? (
                  <FormattedMessage defaultMessage="Notifications are turned off" id="notifications_are_turned_off" />
                ) : (
                  <FormattedMessage
                    defaultMessage="You haven't set your notification preference yet"
                    id="you_havent_set_your_notification_preference_yet"
                  />
                )}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notificationsEnabled === 'enabled'}
                onChange={(e) => {
                  const value = e.target.checked ? 'enabled' : 'disabled';
                  setNotificationsEnabled(value);
                }}
              />
              <div className="w-11 h-6 bg-bg-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-secondary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-secondary-100" />
            </label>
          </div>
        </div>

        {/* Debug Mode */}
        <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
          <h3 className="text-text-100 font-xl-bold">
            <FormattedMessage defaultMessage="Debug Mode" id="debug_mode" />
          </h3>
          <p className="text-text-300 font-base mt-2 mb-6">
            <FormattedMessage
              defaultMessage="Show context window usage and token information above the chat input"
              id="debug_mode_description"
            />
          </p>
          <div className="flex items-center justify-between py-4">
            <div className="flex-1">
              <div className="font-large text-text-100">
                <FormattedMessage defaultMessage="Show context debug info" id="show_context_debug_info" />
              </div>
              <div className="text-text-400 font-base-sm mt-1">
                {debugMode ? (
                  <FormattedMessage
                    defaultMessage="Context window usage will be shown above the chat input"
                    id="debug_mode_enabled_description"
                  />
                ) : (
                  <FormattedMessage
                    defaultMessage="Context debug info is hidden"
                    id="debug_mode_disabled_description"
                  />
                )}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!!debugMode}
                onChange={(e) => {
                  setDebugMode(e.target.checked);
                }}
              />
              <div className="w-11 h-6 bg-bg-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-secondary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-secondary-100" />
            </label>
          </div>
        </div>

        {/* Microphone */}
        <MicrophoneSettings analytics={analytics} />

        {/* Approved Sites */}
        <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-2 md:px-8 md:pt-8 md:pb-3">
          <h3 className="text-text-100 font-xl-bold">
            <FormattedMessage defaultMessage="Your approved sites" id="your_approved_sites" />
          </h3>
          <p className="text-text-300 font-base mt-2 mb-6">
            <FormattedMessage
              defaultMessage="You have allowed SuperDuck to take all actions (browse, click, type) on these sites."
              id="you_have_allowed_superduck_to_take_all_actions"
            />
          </p>
          {permissions?.netloc && permissions.netloc.length > 0 ? (
            <PermissionList
              permissions={permissions.netloc}
              onRevoke={handleRevoke}
              formatScope={formatScope}
            />
          ) : (
            <div className="text-text-400 font-base-sm pb-5">
              <FormattedMessage defaultMessage="No sites have been approved yet" id="no_sites_have_been_approved_yet" />
            </div>
          )}
        </div>

        {/* Domain Transitions */}
        {permissions?.domain_transition && permissions.domain_transition.length > 0 && (
          <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-2 md:px-8 md:pt-8 md:pb-3">
            <h3 className="text-text-100 font-xl-bold">
              <FormattedMessage defaultMessage="Domain Transitions" id="domain_transitions" />
            </h3>
            <p className="text-text-300 font-base mt-2 mb-6">
              <FormattedMessage
                defaultMessage="Permissions for navigating between different domains."
                id="permissions_for_navigating_between_different_domains"
              />
            </p>
            <DomainTransitionList
              permissions={permissions.domain_transition}
              onRevoke={handleRevoke}
              formatScope={formatScope}
            />
          </div>
        )}

        {false}
      </div>
    </div>
  );
};

// =============================================================================
// PermissionList
// =============================================================================

interface PermissionListProps {
  permissions: any[];
  onRevoke: (id: string) => void;
  formatScope: (permission: any) => string;
}

const PermissionList: React.FC<PermissionListProps> = ({ permissions, onRevoke, formatScope }) => (
  <div>
    {permissions.map((permission, index) => (
      <Fragment key={permission.id}>
        <div className="py-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="font-large text-text-100">{formatScope(permission)}</div>
            {permission.lastUsed && (
              <div className="text-xs text-text-400 mt-1">
                <FormattedMessage
                  defaultMessage="Last used: {date}"
                  id="last_used"
                  values={{
                    date: new Date(permission.lastUsed).toLocaleString()
                  }}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => onRevoke(permission.id)}
            className="ml-4 px-4 py-2 text-danger-000 hover:bg-danger-000/10 rounded-lg transition-all font-base"
          >
            <FormattedMessage defaultMessage="Revoke" id="revoke" />
          </button>
        </div>
        {index < permissions.length - 1 && <div className="border-b border-border-400" />}
      </Fragment>
    ))}
  </div>
);

// =============================================================================
// DomainTransitionList
// =============================================================================

const DomainTransitionList: React.FC<PermissionListProps> = ({
  permissions,
  onRevoke,
  formatScope
}) => (
  <div>
    {permissions.map((permission, index) => (
      <Fragment key={permission.id}>
        <div className="py-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="font-large text-text-100">{formatScope(permission)}</div>
            {permission.lastUsed && (
              <div className="text-xs text-text-400 mt-1">
                <FormattedMessage
                  defaultMessage="Last used: {date}"
                  id="last_used"
                  values={{
                    date: new Date(permission.lastUsed).toLocaleString()
                  }}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => onRevoke(permission.id)}
            className="ml-4 px-4 py-2 text-danger-000 hover:bg-danger-000/10 rounded-lg transition-all font-base"
          >
            <FormattedMessage defaultMessage="Revoke" id="revoke" />
          </button>
        </div>
        {index < permissions.length - 1 && <div className="border-b border-border-400" />}
      </Fragment>
    ))}
  </div>
);

// =============================================================================
// NavItem
// =============================================================================

interface NavItemProps {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  href?: string;
}

const NavItem: React.FC<NavItemProps> = ({ children, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'block w-full text-left whitespace-nowrap transition-all ease-in-out active:scale-95 cursor-pointer',
      'font-base rounded-lg px-3 py-3',
      isActive
        ? 'bg-bg-300 font-medium text-text-000'
        : 'text-text-200 hover:bg-bg-200 hover:text-text-100'
    )}
  >
    {children}
  </button>
);

// =============================================================================
// OptionsPage (main component)
// =============================================================================

function OptionsPage() {
  const intl = useIntl();
  // DEV: stub auth/analytics when providers are not available
  const userProfile = null as { email: string } | null;
  const isAuthenticated = false as boolean;
  const resetAnalytics = async () => {};
  const showInternal = false;
  const [apiKey, setApiKey] = useState('dev-mode');
  const [activeTab, setActiveTab] = useState<string>('permissions');
  const [showMicModal, setShowMicModal] = useState(false);
  const [returnTabId, setReturnTabId] = useState<number>();

  useEffect(() => {
    getStorageValue(StorageKeys.API_KEY).then((value) => {
      if (value) setApiKey(value);
    });
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      const [section, queryString] = hash.split('?');
      const tab = ['permissions', 'prompts', 'internal'].includes(section)
        ? section
        : 'permissions';

      let tabId: number | undefined;
      let requestMicrophone = false;

      if (queryString) {
        const params = new URLSearchParams(queryString);
        requestMicrophone = params.get('requestMicrophone') === 'true';
        const returnTab = params.get('returnTabId');
        if (returnTab) {
          tabId = parseInt(returnTab, 10);
        }
      }

      setActiveTab(tab);
      if (requestMicrophone) {
        setShowMicModal(true);
        setReturnTabId(tabId);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTab = (tab: string) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen bg-bg-100">
      <PageHeader large mdTitle="Settings">
        {isAuthenticated && userProfile && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-text-300 font-base-sm">
              <UserIcon className="w-4 h-4" />
              <span>{userProfile.email}</span>
            </div>
          </div>
        )}
        {!isAuthenticated && !apiKey && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-text-300 font-base-sm">
              <FormattedMessage defaultMessage="Not logged in" id="not_logged_in" />
            </div>
            <button
              onClick={async () => {
                try {
                  await loginWithProvider();
                } catch {
                  // ignore
                }
              }}
              className="px-3 py-2 bg-accent-main-100 text-oncolor-100 rounded-lg font-base-sm hover:bg-accent-main-200 transition-colors"
            >
              <FormattedMessage defaultMessage="Login" id="login" />
            </button>
          </div>
        )}
      </PageHeader>

      <PageContent>
        <div className="mb-4 md:hidden pl-3">
          <h1 className="font-heading text-text-200 flex items-center gap-1.5">
            <FormattedMessage defaultMessage="Settings" id="settings" />
          </h1>
        </div>

        {isAuthenticated || apiKey ? (
          <div className="grid md:grid-cols-[220px_minmax(0px,_1fr)] gap-x-8 w-full max-w-6xl my-4 md:my-8">
            <nav className="w-full overflow-x-auto -m-2 p-2 self-start md:sticky md:top-4 relative z-10 mb-4 md:mb-0">
              <ul className="flex gap-1 md:flex-col mb-0">
                <li>
                  <NavItem
                    href="/settings/permissions"
                    isActive={activeTab === 'permissions'}
                    onClick={() => navigateTab('permissions')}
                  >
                    <FormattedMessage defaultMessage="Permissions" id="permissions" />
                  </NavItem>
                </li>
                <li>
                  <NavItem
                    href="/settings/prompts"
                    isActive={activeTab === 'prompts'}
                    onClick={() => navigateTab('prompts')}
                  >
                    <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
                  </NavItem>
                </li>
                {showInternal}
              </ul>

              {isAuthenticated && (
                <div className="mt-8 pt-8 border-t-[0.5px] border-border-300">
                  <button
                    onClick={async () => {
                      try {
                        await chrome.runtime.sendMessage({ type: 'logout' });
                        await resetAnalytics();
                        window.location.reload();
                      } catch {
                        alert(intl.formatMessage({ id: 'failed_to_logout', defaultMessage: 'Failed to logout. Please try again.' }));
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-3 text-danger-000 hover:bg-danger-000/10 rounded-lg transition-all font-base"
                  >
                    <LogOutIcon className="w-4 h-4" />
                    <FormattedMessage defaultMessage="Log out" id="log_out" />
                  </button>
                </div>
              )}
            </nav>

            <div>
              {activeTab === 'permissions' && <PermissionsTab />}
              {activeTab === 'prompts' && <TasksTab />}
              {activeTab === 'internal' && showInternal}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Spinner />
          </div>
        )}
      </PageContent>

      <MicrophonePermissionModal
        isOpen={showMicModal}
        returnTabId={returnTabId}
        onClose={() => setShowMicModal(false)}
      />
    </div>
  );
}

// =============================================================================
// Bootstrap
// =============================================================================

// initSentry();
// initHoneycomb();

// DEV: bypass auth — wrap with minimal providers only

const DevAppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'superduck');
  }, []);
  return (
    <IntlMessageLoaderProvider>
      <FeatureProvider>
        <AuthContext.Provider value={{ userProfile: null, isAuthenticated: false, isLoading: false }}>
          <AnalyticsContext.Provider value={{ analytics: null, resetAnalytics: async () => {} }}>
            {children}
          </AnalyticsContext.Provider>
        </AuthContext.Provider>
      </FeatureProvider>
    </IntlMessageLoaderProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DevAppWrapper>
      <OptionsPage />
    </DevAppWrapper>
  </React.StrictMode>
);
