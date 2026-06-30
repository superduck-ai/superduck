import { useMemo } from 'react';
import { PERMISSION_MODE_OPTIONS } from '@/sidepanel/components/PermissionModeMenu';

export interface UsePermissionModeMenuOptionsProps {
  shouldDisableSkipPermissions: boolean;
}

/**
 * usePermissionModeMenuOptions — 权限模式菜单选项
 * 根据 shouldDisableSkipPermissions 过滤权限模式选项
 */
export function usePermissionModeMenuOptions({
  shouldDisableSkipPermissions
}: UsePermissionModeMenuOptionsProps) {
  return useMemo(
    () =>
      PERMISSION_MODE_OPTIONS.filter(
        (option) => !(shouldDisableSkipPermissions && option.value === 'skip_all_permission_checks')
      ),
    [shouldDisableSkipPermissions]
  );
}
