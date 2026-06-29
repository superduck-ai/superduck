import { useEffect } from 'react';
import { StorageKeys, getStorageValue } from '../../extensionServices';
import { getToolSchemasForMcp } from '../../mcpRuntime';
import type { ToolProviderSchema } from '../../mcpRuntime/pageToolsSupport/types';
import type { NotificationPreference } from '../types';

export interface UseInitializationProps {
  setToolSchemas: (schemas: ToolProviderSchema[]) => void;
  notificationsEnabledRef: React.MutableRefObject<NotificationPreference>;
  setNotificationsEnabled: (enabled: NotificationPreference) => void;
  queryTabId: number | undefined;
  setCurrentPageUrl: (url: string) => void;
  setCurrentPageTitle: (title: string) => void;
  setHasMicrophonePermission: (has: boolean) => void;
  setVersionState: (updater: (prev: any) => any) => void;
  notificationsEnabled: NotificationPreference;
  setAttachmentCount: (count: number) => void;
  pendingAttachments: any[];
  setShowNotificationBanner: (show: boolean) => void;
  notificationBannerTimerRef: React.MutableRefObject<number | null>;
  parseNotificationPreference: (value: unknown) => NotificationPreference;
  announcementConfig: { id?: string; enabled?: boolean; text?: string };
  setAnnouncementDismissed: (dismissed: boolean) => void;
}

/**
 * useInitialization — 初始化 effects
 * 封装工具 schema 加载、通知偏好、页面信息、麦克风权限、版本检查等初始化逻辑
 */
export function useInitialization({
  setToolSchemas,
  notificationsEnabledRef,
  setNotificationsEnabled,
  queryTabId,
  setCurrentPageUrl,
  setCurrentPageTitle,
  setHasMicrophonePermission,
  setVersionState,
  notificationsEnabled,
  setAttachmentCount,
  pendingAttachments,
  setShowNotificationBanner,
  notificationBannerTimerRef,
  parseNotificationPreference,
  announcementConfig,
  setAnnouncementDismissed
}: UseInitializationProps) {
  // Load tool schemas
  useEffect(() => {
    (async () => {
      try {
        const schemas = await getToolSchemasForMcp();
        setToolSchemas(Array.isArray(schemas) ? (schemas as ToolProviderSchema[]) : []);
      } catch {
        setToolSchemas([]);
      }
    })();
  }, [setToolSchemas]);

  // Load notification preference
  useEffect(() => {
    let cancelled = false;

    const applyNotificationPreference = (value: unknown) => {
      if (cancelled) return;
      const preference = parseNotificationPreference(value);
      notificationsEnabledRef.current = preference;
      setNotificationsEnabled(preference);
    };

    void getStorageValue(StorageKeys.NOTIFICATIONS_ENABLED)
      .then(applyNotificationPreference)
      .catch(() => applyNotificationPreference(undefined));

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local' || !(StorageKeys.NOTIFICATIONS_ENABLED in changes)) return;
      applyNotificationPreference(changes[StorageKeys.NOTIFICATIONS_ENABLED].newValue);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [parseNotificationPreference, notificationsEnabledRef, setNotificationsEnabled]);

  // Initialize page info for workflow modal
  useEffect(() => {
    if (queryTabId) {
      chrome.tabs.get(queryTabId, (tab) => {
        if (tab) {
          setCurrentPageUrl(tab.url || '');
          setCurrentPageTitle(tab.title || '');
        }
      });
    }
  }, [queryTabId, setCurrentPageUrl, setCurrentPageTitle]);

  // Check microphone permission
  useEffect(() => {
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((result) => {
        setHasMicrophonePermission(result.state === 'granted');
        result.onchange = () => {
          setHasMicrophonePermission(result.state === 'granted');
        };
      })
      .catch(() => {
        setHasMicrophonePermission(false);
      });
  }, [setHasMicrophonePermission]);

  // Initialize version state
  useEffect(() => {
    const currentVersion = chrome.runtime.getManifest().version;
    setVersionState((prev: any) => ({ ...prev, currentVersion }));
    (async () => {
      const hasUpdate = await getStorageValue(StorageKeys.UPDATE_AVAILABLE, false);
      setVersionState((prev: any) => ({ ...prev, hasUpdate: hasUpdate === true }));
    })();
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local' || !(StorageKeys.UPDATE_AVAILABLE in changes)) return;
      setVersionState((prev: any) => ({
        ...prev,
        hasUpdate: changes[StorageKeys.UPDATE_AVAILABLE].newValue === true
      }));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [setVersionState]);

  // Sync notification ref
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled, notificationsEnabledRef]);

  // Sync attachment count
  useEffect(() => {
    setAttachmentCount(pendingAttachments.length);
  }, [pendingAttachments, setAttachmentCount]);

  // Hide notification banner when preference changes
  useEffect(() => {
    if (notificationsEnabled !== undefined) {
      setShowNotificationBanner(false);
      if (notificationBannerTimerRef.current) {
        window.clearTimeout(notificationBannerTimerRef.current);
        notificationBannerTimerRef.current = null;
      }
    }
  }, [notificationsEnabled, setShowNotificationBanner, notificationBannerTimerRef]);

  // Announcement dismissal
  useEffect(() => {
    const announcementId = announcementConfig.id || '';
    if (!announcementId) {
      setAnnouncementDismissed(true);
      return;
    }
    let active = true;
    (async () => {
      const dismissedId = await getStorageValue(StorageKeys.ANNOUNCEMENT_DISMISSED, '');
      if (!active) return;
      setAnnouncementDismissed(dismissedId === announcementId);
    })();
    return () => {
      active = false;
    };
  }, [announcementConfig.id, setAnnouncementDismissed]);
}
