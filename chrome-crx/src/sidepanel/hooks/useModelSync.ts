import { useEffect } from 'react';
import { StorageKeys, setStorageValue } from '../../extensionServices';

export interface UseModelSyncProps {
  effectiveSelectedModel: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

/**
 * useModelSync — Model 同步
 * 同步 effectiveSelectedModel 和 selectedModel
 */
export function useModelSync({
  effectiveSelectedModel,
  selectedModel,
  setSelectedModel
}: UseModelSyncProps) {
  useEffect(() => {
    if (!effectiveSelectedModel) return;
    if (selectedModel === effectiveSelectedModel) return;

    setSelectedModel(effectiveSelectedModel);
    void setStorageValue(StorageKeys.SELECTED_MODEL, effectiveSelectedModel);
  }, [effectiveSelectedModel, selectedModel, setSelectedModel]);
}
