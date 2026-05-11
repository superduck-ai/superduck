import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useAnalytics } from '@/components/providers/AppProviders';
import { useStorageState } from '@/hooks/useStorageState';
import { PermissionManager } from '@/PermissionManager';
import { StorageKeys } from '@/extensionServices';
import { MODEL_MAPPING_KEYS } from '@/utils/modelMapping';

const CUSTOM_API_URL_KEY = 'customApiUrl';
const CUSTOM_API_KEY_KEY = 'customApiKey';

type PermissionRecord = ReturnType<PermissionManager['getAllPermissions']>[number];
type PermissionsByScope = ReturnType<PermissionManager['getPermissionsByScope']>;
type AnalyticsClient = ReturnType<typeof useAnalytics>['analytics'];

interface PermissionListProps {
  permissions: PermissionRecord[];
  onRevoke: (id: string) => void;
  formatScope: (permission: PermissionRecord) => string;
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
                  values={{ date: new Date(permission.lastUsed).toLocaleString() }}
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

const DomainTransitionList: React.FC<PermissionListProps> = ({
  permissions,
  onRevoke,
  formatScope
}) => <PermissionList permissions={permissions} onRevoke={onRevoke} formatScope={formatScope} />;

const MicrophoneSettings: React.FC<{ analytics?: AnalyticsClient }> = ({ analytics }) => {
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
    void checkPermission();
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
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  stream.getTracks().forEach((track) => track.stop());
                  await checkPermission();
                  analytics?.track?.('superduck.settings.microphone_enabled', {
                    timestamp: Date.now()
                  });
                } catch (err: unknown) {
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
                <FormattedMessage
                  defaultMessage="Allow Microphone Access"
                  id="allow_microphone_access_2"
                />
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
                <FormattedMessage
                  defaultMessage="Microphone access granted"
                  id="microphone_access_granted"
                />
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
                <FormattedMessage
                  defaultMessage="Microphone access blocked"
                  id="microphone_access_blocked"
                />
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

const PermissionsTab: React.FC = () => {
  const intl = useIntl();
  const [permissions, setPermissions] = useState<PermissionsByScope>();
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useStorageState<
    'enabled' | 'disabled' | undefined
  >(StorageKeys.NOTIFICATIONS_ENABLED, undefined);
  const [debugMode, setDebugMode] = useStorageState<boolean>(StorageKeys.DEBUG_MODE, false);
  const [customApiUrl] = useStorageState<string>(CUSTOM_API_URL_KEY, '');
  const [customApiKey] = useStorageState<string>(CUSTOM_API_KEY_KEY, '');
  const [modelMappingHaiku] = useStorageState<string>(MODEL_MAPPING_KEYS.HAIKU, '');
  const [modelMappingSonnet] = useStorageState<string>(MODEL_MAPPING_KEYS.SONNET, '');
  const [modelMappingOpus] = useStorageState<string>(MODEL_MAPPING_KEYS.OPUS, '');
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
        netloc: byScope.netloc.filter((permission) => !permission.toolUseId),
        domain_transition: byScope.domain_transition.filter((permission) => !permission.toolUseId)
      });
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [permissionManager]);

  useEffect(() => {
    void loadPermissions();
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
    await loadPermissions();
  };

  const formatScope = (permission: PermissionRecord): string => {
    if (permission.scope.type === 'domain_transition') {
      return `${permission.scope.fromDomain} → ${permission.scope.toDomain}`;
    }
    return (
      permission.scope.netloc ||
      intl.formatMessage({ defaultMessage: 'Unknown domain', id: 'unknown_domain' })
    );
  };

  const handleSaveCustomApi = async () => {
    const normalizedUrl = apiUrlInput.trim().replace(/\/+$/, '');
    await chrome.storage.local.set({
      [CUSTOM_API_URL_KEY]: normalizedUrl,
      [CUSTOM_API_KEY_KEY]: apiKeyInput.trim(),
      [MODEL_MAPPING_KEYS.HAIKU]: haikuModelInput.trim(),
      [MODEL_MAPPING_KEYS.SONNET]: sonnetModelInput.trim(),
      [MODEL_MAPPING_KEYS.OPUS]: opusModelInput.trim()
    });
    setApiSaveStatus(
      intl.formatMessage({
        id: 'saved_reopen_sidepanel',
        defaultMessage: 'Saved. Reopen sidepanel to apply.'
      })
    );
  };

  const handleClearCustomApi = async () => {
    await chrome.storage.local.set({
      [CUSTOM_API_URL_KEY]: '',
      [CUSTOM_API_KEY_KEY]: '',
      [MODEL_MAPPING_KEYS.HAIKU]: '',
      [MODEL_MAPPING_KEYS.SONNET]: '',
      [MODEL_MAPPING_KEYS.OPUS]: ''
    });
    setApiSaveStatus(
      intl.formatMessage({ id: 'cleared_status', defaultMessage: 'Cleared.' })
    );
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
        <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
          <h3 className="text-text-100 font-xl-bold">
            <FormattedMessage id="custom_api_endpoint" defaultMessage="Custom API Endpoint" />
          </h3>
          <p className="text-text-300 font-base mt-2 mb-6">
            <FormattedMessage
              id="configure_api_url_and_api_key"
              defaultMessage="Configure api_url and api_key used by sidepanel so it can run without the Sign in page."
            />
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-text-200 font-base-sm mb-1">
                <FormattedMessage id="api_url_label" defaultMessage="API URL" />
              </label>
              <input
                type="text"
                value={apiUrlInput}
                onChange={(event) => setApiUrlInput(event.target.value)}
                placeholder="https://your-api-host.com"
                className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
              />
            </div>
            <div>
              <label className="block text-text-200 font-base-sm mb-1">
                <FormattedMessage id="api_key_label" defaultMessage="API Key" />
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder="your_api_key"
                  className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 pr-10 text-sm text-text-100"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-300 hover:text-text-100 transition-colors"
                  aria-label={intl.formatMessage({
                    id: showApiKey ? 'hide_api_key' : 'show_api_key',
                    defaultMessage: showApiKey ? 'Hide API key' : 'Show API key'
                  })}
                >
                  {showApiKey ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="border-t border-border-300 pt-4">
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
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
                <FormattedMessage
                  id="advanced_configuration"
                  defaultMessage="Advanced Configuration"
                />
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 pl-6">
                  <div className="text-text-300 font-base-sm mb-4">
                    <p className="font-semibold text-text-200 mb-1">
                      <FormattedMessage id="model_mapping" defaultMessage="Model Mapping" />
                    </p>
                    <p>
                      <FormattedMessage
                        id="model_mapping_description"
                        defaultMessage="If the provider natively supports the default models, no configuration is usually needed. Only fill in when you need to map requests to different model names."
                      />
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-text-200 font-base-sm mb-1">
                        <FormattedMessage
                          id="opus_default_model"
                          defaultMessage="Deep Default Model"
                        />
                      </label>
                      <input
                        type="text"
                        value={opusModelInput}
                        onChange={(event) => setOpusModelInput(event.target.value)}
                        placeholder={intl.formatMessage({
                          id: 'model_placeholder',
                          defaultMessage: 'e.g.: kimi-k2.5'
                        })}
                        className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
                      />
                    </div>

                    <div>
                      <label className="block text-text-200 font-base-sm mb-1">
                        <FormattedMessage
                          id="sonnet_default_model"
                          defaultMessage="Auto Default Model"
                        />
                      </label>
                      <input
                        type="text"
                        value={sonnetModelInput}
                        onChange={(event) => setSonnetModelInput(event.target.value)}
                        placeholder={intl.formatMessage({
                          id: 'model_placeholder',
                          defaultMessage: 'e.g.: kimi-k2.5'
                        })}
                        className="w-full rounded-lg border border-border-300 bg-bg-000 px-3 py-2 text-sm text-text-100"
                      />
                    </div>

                    <div>
                      <label className="block text-text-200 font-base-sm mb-1">
                        <FormattedMessage
                          id="haiku_default_model"
                          defaultMessage="Flash Default Model"
                        />
                      </label>
                      <input
                        type="text"
                        value={haikuModelInput}
                        onChange={(event) => setHaikuModelInput(event.target.value)}
                        placeholder={intl.formatMessage({
                          id: 'model_placeholder',
                          defaultMessage: 'e.g.: kimi-k2.5'
                        })}
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
                <FormattedMessage
                  defaultMessage="Task completion notifications"
                  id="task_completion_notifications"
                />
              </div>
              <div className="text-text-400 font-base-sm mt-1">
                {notificationsEnabled === 'enabled' ? (
                  <FormattedMessage
                    defaultMessage="You'll receive notifications when tasks finish"
                    id="youll_receive_notifications_when_tasks_finish"
                  />
                ) : notificationsEnabled === 'disabled' ? (
                  <FormattedMessage
                    defaultMessage="Notifications are turned off"
                    id="notifications_are_turned_off"
                  />
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
                onChange={(event) => {
                  void setNotificationsEnabled(event.target.checked ? 'enabled' : 'disabled');
                }}
              />
              <div className="w-11 h-6 bg-bg-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-secondary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-secondary-100" />
            </label>
          </div>
        </div>

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
                <FormattedMessage
                  defaultMessage="Show context debug info"
                  id="show_context_debug_info"
                />
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
                onChange={(event) => {
                  void setDebugMode(event.target.checked);
                }}
              />
              <div className="w-11 h-6 bg-bg-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-secondary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent-secondary-100" />
            </label>
          </div>
        </div>

        <MicrophoneSettings analytics={analytics} />

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
              <FormattedMessage
                defaultMessage="No sites have been approved yet"
                id="no_sites_have_been_approved_yet"
              />
            </div>
          )}
        </div>

        {permissions?.domain_transition && permissions.domain_transition.length > 0 && (
          <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-2 md:px-8 md:pt-8 md:pb-3">
            <h3 className="text-text-100 font-xl-bold">
              <FormattedMessage
                defaultMessage="Domain Transitions"
                id="domain_transitions"
              />
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
      </div>
    </div>
  );
};

export { PermissionsTab };
