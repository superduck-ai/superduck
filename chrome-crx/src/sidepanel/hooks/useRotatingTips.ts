import { useMemo } from 'react';
import type { IntlShape } from 'react-intl';

export interface UseRotatingTipsProps {
  intl: IntlShape;
}

/**
 * useRotatingTips — 轮播提示
 * 生成空输入占位符的轮播提示
 */
export function useRotatingTips({ intl }: UseRotatingTipsProps) {
  return useMemo(
    () => [
      intl.formatMessage({
        id: 'tip_type_message_or_shortcut',
        defaultMessage: '输入消息，或使用 / 快捷操作'
      })
    ],
    [intl]
  );
}

export interface UseNormalizedModelOptionsProps {
  providerConfig: any;
}

/**
 * useNormalizedModelOptions — 标准化模型选项
 * 从 providerConfig 生成标准化的模型选项列表
 */
export function useNormalizedModelOptions({ providerConfig }: UseNormalizedModelOptionsProps) {
  return useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    const pushProvider = (provider: { id: string; name: string; modelId: string }) => {
      const id = provider.id.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const trimmedName = provider.name.trim();
      const label = trimmedName || provider.modelId.trim() || id;
      options.push({ value: id, label });
    };

    for (const provider of providerConfig.providers) {
      pushProvider(provider);
    }

    return options;
  }, [providerConfig]);
}
