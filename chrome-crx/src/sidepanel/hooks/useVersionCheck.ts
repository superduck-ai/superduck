import { useEffect } from 'react';
import { compareVersions } from '../conversation/messageProcessing';
import type { VersionInfoFeatureValue } from '../../extensionServices';

export interface UseVersionCheckProps {
  versionInfo: VersionInfoFeatureValue;
  setVersionState: (updater: (prev: any) => any) => void;
}

/**
 * useVersionCheck — 版本检查
 * 检查当前版本是否被阻止
 */
export function useVersionCheck({ versionInfo, setVersionState }: UseVersionCheckProps) {
  useEffect(() => {
    const minSupportedVersion =
      typeof versionInfo.min_supported_version === 'string'
        ? versionInfo.min_supported_version
        : '';
    setVersionState((prev: any) => {
      const isBlocked =
        !!minSupportedVersion &&
        !!prev.currentVersion &&
        compareVersions(prev.currentVersion, minSupportedVersion) < 0;
      if (prev.minSupportedVersion === minSupportedVersion && prev.isBlocked === isBlocked) {
        return prev;
      }
      return {
        ...prev,
        minSupportedVersion,
        isBlocked
      };
    });
  }, [versionInfo, setVersionState]);
}
