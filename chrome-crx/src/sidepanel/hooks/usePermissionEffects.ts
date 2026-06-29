import { useEffect, useRef } from 'react';
import { StorageKeys, getStorageValue, setStorageValue } from '../../extensionServices';
import type { PermissionMode } from '../sidepanelUtils';
import { isPermissionMode } from '../sidepanelUtils';
import type { PermissionManager } from '@/permissions/PermissionManager';

export interface UsePermissionEffectsProps {
  querySkipPermissions: boolean | undefined;
  shouldDisableSkipPermissions: boolean;
  setPermissionMode: (mode: PermissionMode) => void;
  permissionMode: PermissionMode;
  permissionResolveRef: React.MutableRefObject<((allowed: boolean) => void) | null>;
  setPermissionPrompt: (prompt: any) => void;
  hasApprovedPlanRef: React.MutableRefObject<boolean>;
  permissionManagerRef: React.MutableRefObject<PermissionManager | null>;
  hasLoadedPermissionPreferenceRef: React.MutableRefObject<boolean>;
  setHasBrowserControlPermissionAccepted: (accepted: boolean) => void;
  blockedCategory: string | null;
}

/**
 * usePermissionEffects — 权限相关 effects
 * 封装浏览器控制权限加载、权限模式切换、阻止域名处理等
 */
export function usePermissionEffects({
  querySkipPermissions,
  shouldDisableSkipPermissions,
  setPermissionMode,
  permissionMode,
  permissionResolveRef,
  setPermissionPrompt,
  hasApprovedPlanRef,
  permissionManagerRef,
  hasLoadedPermissionPreferenceRef,
  setHasBrowserControlPermissionAccepted,
  blockedCategory
}: UsePermissionEffectsProps) {
  // Load browser control permission acceptance
  useEffect(() => {
    let active = true;
    (async () => {
      const accepted = await getStorageValue(
        StorageKeys.BROWSER_CONTROL_PERMISSION_ACCEPTED,
        false
      );
      if (active) setHasBrowserControlPermissionAccepted(accepted === true);
    })();
    return () => {
      active = false;
    };
  }, [setHasBrowserControlPermissionAccepted]);

  // Blocked category forces permission mode change
  useEffect(() => {
    if (
      blockedCategory &&
      blockedCategory !== 'category0' &&
      permissionMode === 'skip_all_permission_checks'
    ) {
      setPermissionMode('follow_a_plan');
    }
  }, [blockedCategory, permissionMode, setPermissionMode]);

  // Live mode-switch handling
  const prevPermissionModeRef = useRef<PermissionMode>(permissionMode);
  useEffect(() => {
    const prev = prevPermissionModeRef.current;
    prevPermissionModeRef.current = permissionMode;
    if (prev === permissionMode) return;

    if (permissionMode === 'skip_all_permission_checks') {
      if (permissionResolveRef.current) {
        permissionResolveRef.current(true);
        permissionResolveRef.current = null;
      }
      setPermissionPrompt(null);
    } else if (permissionMode === 'follow_a_plan') {
      hasApprovedPlanRef.current = false;
      permissionManagerRef.current?.clearTurnApprovedDomains();
    }
  }, [
    permissionMode,
    permissionResolveRef,
    setPermissionPrompt,
    hasApprovedPlanRef,
    permissionManagerRef
  ]);

  // Load permission mode preference
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (querySkipPermissions) {
          if (active) {
            setPermissionMode('skip_all_permission_checks');
          }
          return;
        }
        const savedMode = await getStorageValue(StorageKeys.LAST_PERMISSION_MODE_PREFERENCE);
        if (!active) return;
        if (isPermissionMode(savedMode)) {
          if (shouldDisableSkipPermissions && savedMode === 'skip_all_permission_checks') {
            setPermissionMode('follow_a_plan');
          } else {
            setPermissionMode(savedMode);
          }
        } else {
          setPermissionMode(
            shouldDisableSkipPermissions ? 'follow_a_plan' : 'skip_all_permission_checks'
          );
        }
      } finally {
        if (active) {
          hasLoadedPermissionPreferenceRef.current = true;
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    querySkipPermissions,
    shouldDisableSkipPermissions,
    setPermissionMode,
    hasLoadedPermissionPreferenceRef
  ]);

  // Save permission mode preference
  useEffect(() => {
    if (!hasLoadedPermissionPreferenceRef.current) return;
    void setStorageValue(StorageKeys.LAST_PERMISSION_MODE_PREFERENCE, permissionMode);
  }, [permissionMode]);
}
