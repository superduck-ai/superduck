import { useMemo } from 'react';
import { findProvider } from '../../utils/providerStore';

export interface UseSelectedModelLabelProps {
  normalizedModelOptions: Array<{ value: string; label: string }>;
  effectiveSelectedModel: string;
  providerConfig: any;
}

/**
 * useSelectedModelLabel — 选中的模型标签
 * 从 normalizedModelOptions 和 providerConfig 获取选中的模型标签
 */
export function useSelectedModelLabel({
  normalizedModelOptions,
  effectiveSelectedModel,
  providerConfig
}: UseSelectedModelLabelProps) {
  return useMemo(() => {
    return (
      normalizedModelOptions.find((option) => option.value === effectiveSelectedModel)?.label ||
      findProvider(providerConfig, effectiveSelectedModel)?.name ||
      ''
    );
  }, [normalizedModelOptions, effectiveSelectedModel, providerConfig]);
}
