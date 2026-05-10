import { useCallback } from 'react';
import { getStorageValue, setStorageValue, StorageKeys } from '../../extensionServices';

const FAST_MODEL_TAG_PATTERN = /^(.+)\[fast\]$/;

export function parseModelTag(model: string): {
  baseModel: string;
  hasFastTag: boolean;
} {
  const match = model.match(FAST_MODEL_TAG_PATTERN);
  return { baseModel: match ? match[1] : model, hasFastTag: Boolean(match) };
}

export function getBaseModel(model: string): string {
  return parseModelTag(model).baseModel;
}

function getStickyModelStorageKey(isQuickMode: boolean): StorageKeys {
  return isQuickMode ? StorageKeys.SELECTED_MODEL_QUICK_MODE : StorageKeys.SELECTED_MODEL;
}

export interface ModelOptionLike {
  model: string;
}

export function useStickyModelSelection() {
  const loadStickyModel = useCallback(
    async (availableModels: ModelOptionLike[], isQuickMode = false): Promise<string | null> => {
      try {
        const storageKey = getStickyModelStorageKey(isQuickMode);
        const stored = await getStorageValue(storageKey);
        if (!stored) return null;

        const exists = availableModels.some((entry) => entry.model === stored);
        if (!exists) return null;

        if (!isQuickMode && parseModelTag(stored).hasFastTag) return null;

        return stored;
      } catch {
        return null;
      }
    },
    []
  );

  const setStickyModel = useCallback(async (model: string | null, isQuickMode = false) => {
    try {
      const storageKey = getStickyModelStorageKey(isQuickMode);
      await setStorageValue(storageKey, model);
    } catch {
      // noop
    }
  }, []);

  return { loadStickyModel, setStickyModel };
}
