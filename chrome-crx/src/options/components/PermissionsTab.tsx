import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ExternalLink } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Switch,
  Skeleton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui';
import { useStorageState } from '@/hooks/useStorageState';
import { PermissionManager } from '@/permissions/PermissionManager';
import { StorageKeys } from '@/extensionServices';
import { trackEvent } from '@/mcpRuntime/analytics';
import { ProviderConfigSection } from './ProviderConfigSection';
import {
  SettingsPage,
  SettingsRow,
  SettingsRowActions,
  SettingsRowContent,
  SettingsRowDescription,
  SettingsRowTitle,
  SettingsSection,
  SettingsSeparator,
  StatusBadge
} from './SettingsLayout';

type PermissionRecord = ReturnType<PermissionManager['getAllPermissions']>[number];
type PermissionsByScope = ReturnType<PermissionManager['getPermissionsByScope']>;

interface PermissionListProps {
  permissions: PermissionRecord[];
  onRevoke: (id: string) => void;
  formatScope: (permission: PermissionRecord) => string;
}

const PermissionList: React.FC<PermissionListProps> = ({ permissions, onRevoke, formatScope }) => (
  <div>
    {permissions.map((permission, index) => (
      <React.Fragment key={permission.id}>
        <SettingsRow className="px-6 py-3.5">
          <SettingsRowContent>
            <SettingsRowTitle className="truncate">{formatScope(permission)}</SettingsRowTitle>
            {permission.lastUsed && (
              <SettingsRowDescription>
                <FormattedMessage
                  defaultMessage="Last used: {date}"
                  id="last_used"
                  values={{ date: new Date(permission.lastUsed).toLocaleString() }}
                />
              </SettingsRowDescription>
            )}
          </SettingsRowContent>
          <SettingsRowActions>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevoke(permission.id)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-3 rounded-md"
            >
              <FormattedMessage defaultMessage="Revoke" id="revoke" />
            </Button>
          </SettingsRowActions>
        </SettingsRow>
        {index < permissions.length - 1 && <SettingsSeparator />}
      </React.Fragment>
    ))}
  </div>
);

const DomainTransitionList: React.FC<PermissionListProps> = ({
  permissions,
  onRevoke,
  formatScope
}) => <PermissionList permissions={permissions} onRevoke={onRevoke} formatScope={formatScope} />;

const MicrophoneSettings: React.FC = () => {
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

  const requestMicrophone = async () => {
    setIsRequesting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await checkPermission();
      void trackEvent('superduck.settings.microphone_enabled', {
        timestamp: Date.now()
      });
    } catch (err: unknown) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError(
            intl.formatMessage({
              defaultMessage: 'Permission denied. You can change this in your browser settings.',
              id: 'permission_denied_you_can_change_this'
            })
          );
        } else if (err.name === 'NotFoundError') {
          setError(
            intl.formatMessage({
              defaultMessage: 'No microphone found. Please connect a microphone and try again.',
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
  };

  return (
    <>
      <SettingsRow>
        <SettingsRowContent>
          <SettingsRowTitle>
            <FormattedMessage defaultMessage="Microphone" id="microphone" />
          </SettingsRowTitle>
          <SettingsRowDescription>
            <FormattedMessage
              defaultMessage="Enable microphone access to use your browser's speech-to-text functionality for voice narration during workflow recording"
              id="enable_microphone_access_to_use_your_browsers_speechtotext"
            />
          </SettingsRowDescription>
        </SettingsRowContent>
        <SettingsRowActions>
          {(permissionState === 'prompt' || permissionState === 'unknown') && (
            <Button variant="outline" size="sm" onClick={requestMicrophone} disabled={isRequesting}>
              {isRequesting ? (
                <FormattedMessage defaultMessage="Requesting..." id="requesting" />
              ) : (
                <FormattedMessage defaultMessage="Allow" id="allow" />
              )}
            </Button>
          )}
          {permissionState === 'granted' && (
            <>
              <StatusBadge tone="success">
                <FormattedMessage defaultMessage="Allowed" id="microphone_allowed" />
              </StatusBadge>
              <Button
                variant="ghost"
                size="sm"
                onClick={openChromeSettings}
                className="gap-1 px-3.5 h-8"
              >
                <FormattedMessage defaultMessage="Manage" id="manage" />
                <ExternalLink aria-hidden data-icon="inline-end" size={13} />
              </Button>
            </>
          )}
          {permissionState === 'denied' && (
            <>
              <StatusBadge tone="destructive">
                <FormattedMessage defaultMessage="Blocked" id="microphone_blocked" />
              </StatusBadge>
              <Button
                variant="outline"
                size="sm"
                onClick={openChromeSettings}
                className="gap-1 px-3.5 h-8"
              >
                <FormattedMessage defaultMessage="Open settings" id="open_settings" />
                <ExternalLink aria-hidden data-icon="inline-end" size={13} />
              </Button>
            </>
          )}
        </SettingsRowActions>
      </SettingsRow>
      {error && (
        <div className="px-6 pb-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
};

const BrowserSettingsSection: React.FC<{
  notificationsEnabled: 'enabled' | 'disabled' | undefined;
  setNotificationsEnabled: (value: 'enabled' | 'disabled') => void | Promise<void>;
  debugMode: boolean;
  setDebugMode: (value: boolean) => void | Promise<void>;
}> = ({ notificationsEnabled, setNotificationsEnabled, debugMode, setDebugMode }) => (
  <SettingsSection
    title={<FormattedMessage defaultMessage="Browser Settings" id="browser_settings" />}
    description={
      <FormattedMessage
        defaultMessage="Control notifications, debug output, and browser device access."
        id="browser_settings_description"
      />
    }
  >
    <SettingsRow>
      <SettingsRowContent>
        <SettingsRowTitle>
          <FormattedMessage
            defaultMessage="Task completion notifications"
            id="task_completion_notifications"
          />
        </SettingsRowTitle>
        <SettingsRowDescription>
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
        </SettingsRowDescription>
      </SettingsRowContent>
      <SettingsRowActions>
        <Switch
          checked={notificationsEnabled === 'enabled'}
          onCheckedChange={(checked) => {
            void setNotificationsEnabled(checked ? 'enabled' : 'disabled');
          }}
        />
      </SettingsRowActions>
    </SettingsRow>
    <SettingsSeparator />
    <SettingsRow>
      <SettingsRowContent>
        <SettingsRowTitle>
          <FormattedMessage defaultMessage="Show context debug info" id="show_context_debug_info" />
        </SettingsRowTitle>
        <SettingsRowDescription>
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
        </SettingsRowDescription>
      </SettingsRowContent>
      <SettingsRowActions>
        <Switch
          checked={!!debugMode}
          onCheckedChange={(checked) => {
            void setDebugMode(checked);
          }}
        />
      </SettingsRowActions>
    </SettingsRow>
    <SettingsSeparator />
    <MicrophoneSettings />
  </SettingsSection>
);

const PermissionGroup: React.FC<{
  title: React.ReactNode;
  description: React.ReactNode;
  empty: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, description, empty, children }) => (
  <div>
    <div className="border-b border-border px-6 py-4">
      <h3 className="text-sm font-medium leading-5 text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
    {children || <div className="px-6 py-4 text-xs text-muted-foreground">{empty}</div>}
  </div>
);

const PermissionsSection: React.FC<{
  permissions: PermissionsByScope | undefined;
  onRevoke: (id: string) => void;
  formatScope: (permission: PermissionRecord) => string;
}> = ({ permissions, onRevoke, formatScope }) => {
  const hasApprovedSites = Boolean(permissions?.netloc && permissions.netloc.length > 0);
  const hasDomainTransitions = Boolean(
    permissions?.domain_transition && permissions.domain_transition.length > 0
  );

  return (
    <SettingsSection
      title={<FormattedMessage defaultMessage="Permissions" id="permissions_section" />}
      description={
        <FormattedMessage
          defaultMessage="Review browser access SuperDuck can use while completing tasks."
          id="permissions_section_description"
        />
      }
    >
      <PermissionGroup
        title={<FormattedMessage defaultMessage="Approved sites" id="your_approved_sites" />}
        description={
          <FormattedMessage
            defaultMessage="Sites where SuperDuck can browse, click, and type."
            id="approved_sites_description_compact"
          />
        }
        empty={<FormattedMessage defaultMessage="No permissions yet" id="no_permissions_yet" />}
      >
        {hasApprovedSites && (
          <PermissionList
            permissions={permissions?.netloc ?? []}
            onRevoke={onRevoke}
            formatScope={formatScope}
          />
        )}
      </PermissionGroup>
      <SettingsSeparator />
      <PermissionGroup
        title={<FormattedMessage defaultMessage="Domain transitions" id="domain_transitions" />}
        description={
          <FormattedMessage
            defaultMessage="Allowed navigation between different domains."
            id="domain_transitions_description_compact"
          />
        }
        empty={<FormattedMessage defaultMessage="No permissions yet" id="no_permissions_yet" />}
      >
        {hasDomainTransitions && (
          <DomainTransitionList
            permissions={permissions?.domain_transition ?? []}
            onRevoke={onRevoke}
            formatScope={formatScope}
          />
        )}
      </PermissionGroup>
    </SettingsSection>
  );
};

const PermissionsTab: React.FC = () => {
  const intl = useIntl();
  const [permissions, setPermissions] = useState<PermissionsByScope>();
  const [isLoading, setIsLoading] = useState(true);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useStorageState<
    'enabled' | 'disabled' | undefined
  >(StorageKeys.NOTIFICATIONS_ENABLED, undefined);
  const [debugMode, setDebugMode] = useStorageState<boolean>(StorageKeys.DEBUG_MODE, false);
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

  const handleRevoke = async (id: string) => {
    await permissionManager.revokePermission(id);
    await loadPermissions();
    setRevokeConfirmId(null);
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

  if (isLoading) {
    return (
      <SettingsPage>
        <SettingsSection
          title={<Skeleton className="h-5 w-32" />}
          description={<Skeleton className="h-4 w-72 mt-1" />}
        >
          <div className="space-y-4 px-6 py-5 md:px-8">
            <div className="flex items-center justify-between py-1">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
            <SettingsSeparator />
            <div className="flex items-center justify-between py-1">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title={<Skeleton className="h-5 w-36" />}
          description={<Skeleton className="h-4 w-80 mt-1" />}
        >
          <div className="space-y-4 px-6 py-5 md:px-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
            <SettingsSeparator />
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </div>
        </SettingsSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage>
      <ProviderConfigSection />
      <BrowserSettingsSection
        notificationsEnabled={notificationsEnabled}
        setNotificationsEnabled={setNotificationsEnabled}
        debugMode={!!debugMode}
        setDebugMode={setDebugMode}
      />
      <PermissionsSection
        permissions={permissions}
        onRevoke={setRevokeConfirmId}
        formatScope={formatScope}
      />

      <Dialog open={!!revokeConfirmId} onOpenChange={(open) => !open && setRevokeConfirmId(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage defaultMessage="Revoke permission" id="revoke_permission_title" />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                defaultMessage="Are you sure you want to revoke this site permission? SuperDuck will no longer be able to browse or perform actions on this site."
                id="revoke_permission_confirm_description"
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeConfirmId(null)}>
              <FormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (revokeConfirmId) {
                  void handleRevoke(revokeConfirmId);
                }
              }}
            >
              <FormattedMessage defaultMessage="Revoke" id="revoke" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
};

export { PermissionsTab };
