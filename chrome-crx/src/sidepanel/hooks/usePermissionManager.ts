import { useCallback, useRef } from 'react';
import { PermissionManager } from '@/permissions/PermissionManager';
import type { PermissionMode } from '../sidepanelUtils';

export interface UsePermissionManagerProps {
  permissionMode: PermissionMode;
}

/**
 * usePermissionManager — PermissionManager 实例
 * 创建并返回 PermissionManager 实例
 */
export function usePermissionManager({ permissionMode }: UsePermissionManagerProps) {
  const permissionModeRef = useRef<PermissionMode>(permissionMode);
  permissionModeRef.current = permissionMode;
  const permissionManagerRef = useRef<PermissionManager | null>(null);

  const getPermissionManager = useCallback(() => {
    if (!permissionManagerRef.current) {
      permissionManagerRef.current = new PermissionManager(
        () => permissionModeRef.current === 'skip_all_permission_checks'
      );
    }
    return permissionManagerRef.current;
  }, []);

  return { getPermissionManager, permissionManagerRef, permissionModeRef };
}
