import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { createLucideIcon } from 'lucide-react';
import { Button, SimpleSelect } from '@/components/ui';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_KIND_LABEL,
  TIER_DESCRIPTION,
  TIER_LABEL,
  emptyConfigSnapshot,
  isProviderComplete,
  loadProviderConfig,
  saveProviderConfig,
  testProviderConnection,
  type AiProvider,
  type ModelMappingV2,
  type ProviderConfig,
  type ProviderKind,
  type Tier
} from '@/utils/providerStore';
import { ProviderEditorModal, type ProviderEditorValue } from './ProviderEditorModal';

const TIER_ORDER: Tier[] = ['deep', 'smart', 'flash'];

const DeepIcon = createLucideIcon('layers', [
  [
    'path',
    {
      d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
      key: 'zw3jo'
    }
  ],
  ['path', { d: 'm22 12.18-9.17 4.16a2 2 0 0 1-1.66 0L2 12.18', key: 'cx5j5d' }],
  ['path', { d: 'm22 17.18-9.17 4.16a2 2 0 0 1-1.66 0L2 17.18', key: 'g8sj7r' }]
]);

const SmartIcon = createLucideIcon('sparkles', [
  [
    'path',
    {
      d: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z',
      key: '4pj2yx'
    }
  ]
]);

const FlashIcon = createLucideIcon('zap', [
  [
    'path',
    {
      d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
      key: 'wphs9q'
    }
  ]
]);

const PlusIcon = createLucideIcon('plus', [
  ['path', { d: 'M5 12h14', key: '1ays0h' }],
  ['path', { d: 'M12 5v14', key: 's699le' }]
]);

const TrashIcon = createLucideIcon('trash', [
  ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
  ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', key: '4alrt4' }],
  ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', key: 'v07s0e' }]
]);

const PencilIcon = createLucideIcon('pencil', [
  [
    'path',
    {
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z',
      key: 'ymcmye'
    }
  ],
  ['path', { d: 'm15 5 4 4', key: '1s1alb' }]
]);

const CheckCircleIcon = createLucideIcon('circle-check', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'e4b067' }],
  ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }]
]);

const AlertCircleIcon = createLucideIcon('circle-alert', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'e4b067' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12', key: '1pkeuh' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16', key: '4dfq90' }]
]);

const SpinnerIcon = createLucideIcon('loader', [
  ['path', { d: 'M12 2v4', key: '4jgjns' }],
  ['path', { d: 'm16.2 7.8 2.9-2.9', key: 'r700ao' }],
  ['path', { d: 'M18 12h4', key: 'wj9ykh' }],
  ['path', { d: 'm16.2 16.2 2.9 2.9', key: '1bxg5t' }],
  ['path', { d: 'M12 18v4', key: 'jadmvz' }],
  ['path', { d: 'm4.9 19.1 2.9-2.9', key: 'bwix9q' }],
  ['path', { d: 'M2 12h4', key: 'j09sii' }],
  ['path', { d: 'm4.9 4.9 2.9 2.9', key: 'giyufr' }]
]);

const TIER_ICON: Record<Tier, React.ComponentType<{ className?: string; size?: number }>> = {
  deep: DeepIcon,
  smart: SmartIcon,
  flash: FlashIcon
};

const PROVIDER_KIND_COLOR: Record<ProviderKind, string> = {
  anthropic: 'bg-[#d97757] text-white',
  openai: 'bg-emerald-600 text-white',
  gemini: 'bg-blue-600 text-white',
  'openai-compatible': 'bg-emerald-600 text-white'
};

function getProviderBadgeText(provider: AiProvider): string {
  return provider.name.trim().charAt(0).toUpperCase() || '?';
}

interface ProviderStatusInfo {
  status: AiProvider['status'];
  message?: string;
}

interface SaveNotice {
  id: number;
  message: string;
  tone: 'success' | 'warning';
}

const ProviderConfigSection: React.FC = () => {
  const intl = useIntl();
  const [config, setConfig] = useState<ProviderConfig>(() => emptyConfigSnapshot());
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(emptyConfigSnapshot())
  );
  const [dirtyProviderIds, setDirtyProviderIds] = useState<Set<string>>(new Set());
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusOverlay, setStatusOverlay] = useState<Record<string, ProviderStatusInfo>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(config) !== savedSnapshot, [config, savedSnapshot]);

  useEffect(() => {
    void (async () => {
      const loaded = await loadProviderConfig();
      setConfig(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
    })();
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    setSaveNotice(null);
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(
      () => setSaveNotice((current) => (current?.id === saveNotice.id ? null : current)),
      saveNotice.tone === 'warning' ? 5000 : 3000
    );
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  const markDirty = useCallback((providerId?: string) => {
    if (providerId) {
      setDirtyProviderIds((prev) => {
        const next = new Set(prev);
        next.add(providerId);
        return next;
      });
    }
  }, []);

  const providerOptions = useMemo(
    () => config.providers.map((provider) => ({ value: provider.id, label: provider.name })),
    [config.providers]
  );

  const openAddProvider = () => {
    setEditingProvider(null);
    setEditorOpen(true);
  };

  const openEditProvider = (provider: AiProvider) => {
    setEditingProvider(provider);
    setEditorOpen(true);
  };

  const handleSaveProvider = (value: ProviderEditorValue) => {
    setConfig((previous) => {
      const existingIndex = previous.providers.findIndex((entry) => entry.id === value.id);
      const nextProvider: AiProvider = {
        id: value.id,
        kind: value.kind,
        name: value.name,
        modelId: value.modelId,
        apiKey: value.apiKey,
        baseURL: value.baseURL,
        status:
          existingIndex >= 0
            ? previous.providers[existingIndex].apiKey === value.apiKey &&
              previous.providers[existingIndex].baseURL === value.baseURL &&
              previous.providers[existingIndex].kind === value.kind &&
              previous.providers[existingIndex].modelId === value.modelId
              ? previous.providers[existingIndex].status
              : 'unknown'
            : 'unknown',
        lastTestedAt:
          existingIndex >= 0 ? previous.providers[existingIndex].lastTestedAt : undefined,
        errorMessage: undefined
      };
      const nextProviders =
        existingIndex >= 0
          ? previous.providers.map((entry, index) =>
              index === existingIndex ? nextProvider : entry
            )
          : [...previous.providers, nextProvider];
      const nextMapping = { ...previous.mapping } as ModelMappingV2;
      TIER_ORDER.forEach((tier) => {
        if (nextMapping[tier]?.providerId === nextProvider.id) {
          nextMapping[tier] = { providerId: nextProvider.id, modelId: nextProvider.modelId };
        }
      });
      return { ...previous, providers: nextProviders, mapping: nextMapping };
    });
    markDirty(value.id);
    setEditorOpen(false);
    setEditingProvider(null);
  };

  const handleDeleteProvider = (providerId: string) => {
    setConfig((previous) => {
      const nextMapping = { ...previous.mapping } as ModelMappingV2;
      TIER_ORDER.forEach((tier) => {
        if (nextMapping[tier]?.providerId === providerId) nextMapping[tier] = null;
      });
      return {
        ...previous,
        providers: previous.providers.filter((entry) => entry.id !== providerId),
        mapping: nextMapping
      };
    });
  };

  const handleTestProvider = useCallback(
    async (provider: AiProvider) => {
      setStatusOverlay((prev) => ({ ...prev, [provider.id]: { status: 'testing' } }));
      const result = await testProviderConnection(provider);
      const lastTestedAt = Date.now();

      const computeNextConfig = (previous: ProviderConfig): ProviderConfig => ({
        ...previous,
        providers: previous.providers.map((entry) =>
          entry.id === provider.id
            ? {
                ...entry,
                status: result.ok ? 'active' : 'error',
                lastTestedAt,
                errorMessage: result.ok ? undefined : result.error
              }
            : entry
        )
      });

      let resolvedConfig: ProviderConfig | null = null;
      setConfig((previous) => {
        resolvedConfig = computeNextConfig(previous);
        return resolvedConfig;
      });

      if (!isDirty && resolvedConfig) {
        await saveProviderConfig(resolvedConfig);
        setSavedSnapshot(JSON.stringify(resolvedConfig));
      }

      setStatusOverlay((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
      setDirtyProviderIds((prev) => {
        const next = new Set(prev);
        next.delete(provider.id);
        return next;
      });
    },
    [isDirty]
  );

  const handleTierProviderChange = (tier: Tier, providerId: string) => {
    setConfig((previous) => {
      const provider = previous.providers.find((p) => p.id === providerId);
      return {
        ...previous,
        mapping: {
          ...previous.mapping,
          [tier]: providerId && provider ? { providerId, modelId: provider.modelId } : null
        }
      };
    });
  };

  const handleDiscard = useCallback(async () => {
    try {
      const loaded = await loadProviderConfig(true);
      setConfig(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
    } catch {
      const empty = emptyConfigSnapshot();
      setConfig(empty);
      setSavedSnapshot(JSON.stringify(empty));
    }
    setDirtyProviderIds(new Set());
    setSaveError(null);
    setSaveNotice(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveNotice(null);

    const missingTiers: string[] = [];
    const invalidTiers: string[] = [];
    for (const tier of TIER_ORDER) {
      const binding = config.mapping[tier];
      if (!binding) {
        missingTiers.push(TIER_LABEL[tier]);
        continue;
      }
      const provider = config.providers.find((p) => p.id === binding.providerId);
      if (!provider || (!binding.modelId && !provider.modelId)) {
        invalidTiers.push(TIER_LABEL[tier]);
      }
    }

    if (missingTiers.length > 0) {
      setSaveError(
        intl.formatMessage(
          {
            id: 'save_validation_missing_tiers',
            defaultMessage: '保存前请绑定以下档位: {tiers}'
          },
          { tiers: missingTiers.join(', ') }
        )
      );
      return;
    }

    if (invalidTiers.length > 0) {
      setSaveError(
        intl.formatMessage(
          {
            id: 'save_validation_invalid_tiers',
            defaultMessage: '以下档位绑定无效（缺少模型ID）: {tiers}'
          },
          { tiers: invalidTiers.join(', ') }
        )
      );
      return;
    }

    setIsSaving(true);
    try {
      setStatusOverlay((prev) => {
        const next = { ...prev };
        dirtyProviderIds.forEach((providerId) => {
          delete next[providerId];
        });
        return next;
      });
      const updatedProviders = await Promise.all(
        config.providers.map(async (provider) => {
          if (!dirtyProviderIds.has(provider.id) || !isProviderComplete(provider)) return provider;
          const result = await testProviderConnection(provider);
          return result.ok
            ? {
                ...provider,
                status: 'active' as const,
                lastTestedAt: Date.now(),
                errorMessage: undefined
              }
            : {
                ...provider,
                status: 'error' as const,
                lastTestedAt: Date.now(),
                errorMessage: result.error
              };
        })
      );

      const nextConfig: ProviderConfig = { ...config, providers: updatedProviders };
      await saveProviderConfig(nextConfig);

      // Re-load to ensure we have the exact canonical state that was saved
      const finalConfig = await loadProviderConfig(true);
      setConfig(finalConfig);
      setSavedSnapshot(JSON.stringify(finalConfig));

      try {
        await chrome.runtime.sendMessage({ type: PROVIDER_CONFIG_BROADCAST });
      } catch {
        // listeners also watch chrome.storage.onChanged directly
      }
      setDirtyProviderIds(new Set());

      const failed = updatedProviders.filter((provider) => provider.status === 'error');
      setSaveNotice({
        id: Date.now(),
        tone: failed.length > 0 ? 'warning' : 'success',
        message:
          failed.length > 0
            ? intl.formatMessage(
                {
                  id: 'saved_with_warnings',
                  defaultMessage: '已保存。有 {count} 个供应商连接测试失败。'
                },
                { count: failed.length }
              )
            : intl.formatMessage({ id: 'saved_success', defaultMessage: '配置已保存并生效。' })
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }, [config, dirtyProviderIds, intl]);

  const renderTierRow = (tier: Tier) => {
    const Icon = TIER_ICON[tier];
    const binding = config.mapping[tier];
    return (
      <div
        key={tier}
        className="flex items-center justify-between py-4 border-b border-border-300 last:border-b-0"
      >
        <div className="flex items-center gap-4 min-w-0 pr-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-200 text-text-200">
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex items-baseline gap-2">
            <span className="font-large text-text-100 truncate">{TIER_LABEL[tier]}</span>
            <span className="text-text-400 font-base-sm">·</span>
            <span className="text-text-400 font-base-sm truncate">{TIER_DESCRIPTION[tier]}</span>
          </div>
        </div>
        <div className="w-56 shrink-0">
          <SimpleSelect
            value={binding?.providerId ?? ''}
            onChange={(value) => handleTierProviderChange(tier, value)}
            options={[
              {
                value: '',
                label: intl.formatMessage({
                  id: 'select_custom_model',
                  defaultMessage: '— 选择模型 —'
                })
              },
              ...providerOptions
            ]}
          />
        </div>
      </div>
    );
  };

  const renderProviderCard = (provider: AiProvider) => {
    const overlay = statusOverlay[provider.id];
    const effectiveStatus: AiProvider['status'] = overlay?.status ?? provider.status;
    const errorMessage = overlay?.message ?? provider.errorMessage;
    const dirty = dirtyProviderIds.has(provider.id);
    return (
      <div
        key={provider.id}
        className="flex flex-col gap-3 rounded-xl border border-border-300 bg-bg-000 p-4 transition-all hover:border-border-400"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-base-bold text-sm ${PROVIDER_KIND_COLOR[provider.kind]}`}
            >
              {getProviderBadgeText(provider)}
            </span>
            <div className="min-w-0">
              <div className="font-large text-text-100 truncate flex items-center gap-2">
                {provider.name}
                <ProviderStatusBadge
                  status={effectiveStatus}
                  message={errorMessage}
                  dirty={dirty}
                />
              </div>
              <div className="text-text-400 font-base-sm truncate mt-0.5">
                {PROVIDER_KIND_LABEL[provider.kind]}
                {provider.modelId ? ` · ${provider.modelId}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleTestProvider(provider)}
              disabled={!isProviderComplete(provider)}
              className="text-text-300 hover:text-text-100"
            >
              <FormattedMessage id="test" defaultMessage="测试" />
            </Button>
            <Button
              variant="ghost"
              size="icon_sm"
              onClick={() => openEditProvider(provider)}
              className="text-text-300 hover:text-text-100"
            >
              <PencilIcon size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon_sm"
              onClick={() => handleDeleteProvider(provider.id)}
              className="text-text-300 hover:text-danger-000"
            >
              <TrashIcon size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-bg-100 border border-border-300 rounded-xl px-6 pt-6 pb-6 md:px-8 md:pt-8 md:pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-text-100 font-xl-bold">
            <FormattedMessage id="infrastructure_management" defaultMessage="模型配置" />
          </h3>
        </div>
        {(isDirty || isSaving) && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDiscard}
              disabled={isSaving}
              className="px-3 py-1.5 text-text-200 hover:text-text-100 font-base-sm rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FormattedMessage id="discard" defaultMessage="丢弃" />
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="px-4 py-1.5 bg-accent-main-100 text-oncolor-100 rounded-lg font-base-sm hover:bg-accent-main-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <FormattedMessage id="saving" defaultMessage="保存中..." />
              ) : (
                <FormattedMessage id="save" defaultMessage="保存" />
              )}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="mt-4 rounded-lg border border-danger-000/30 bg-danger-000/10 px-4 py-3 text-danger-000 font-base-sm">
          {saveError}
        </div>
      )}
      {saveNotice && !isDirty && <SaveNoticeToast notice={saveNotice} />}

      <div className="mt-8">
        <h4 className="text-text-100 font-large mb-1">
          <FormattedMessage id="global_model_mapping" defaultMessage="模型映射" />
        </h4>
        <div className="mt-4 bg-bg-000 rounded-xl border border-border-300 px-4">
          {TIER_ORDER.map(renderTierRow)}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-text-100 font-large mb-1">
              <FormattedMessage id="custom_models" defaultMessage="模型" />
            </h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            prepend={<PlusIcon size={14} />}
            onClick={openAddProvider}
          >
            <FormattedMessage id="add" defaultMessage="添加" />
          </Button>
        </div>

        {config.providers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-300 bg-bg-50 px-6 py-10 text-center text-text-400 font-base-sm">
            <FormattedMessage id="no_custom_models" defaultMessage="暂无模型" />
          </div>
        ) : (
          <div className="space-y-3">{config.providers.map(renderProviderCard)}</div>
        )}
      </div>

      <ProviderEditorModal
        isOpen={editorOpen}
        provider={editingProvider}
        onCancel={() => {
          setEditorOpen(false);
          setEditingProvider(null);
        }}
        onSave={handleSaveProvider}
      />
    </div>
  );
};

const SaveNoticeToast: React.FC<{ notice: SaveNotice }> = ({ notice }) => {
  const isWarning = notice.tone === 'warning';
  return (
    <div className="fixed right-6 top-6 z-toast flex max-w-sm items-center gap-2 rounded-lg border border-border-300 bg-bg-000 px-4 py-3 text-text-200 shadow-lg animate-toast-slide-in">
      {isWarning ? (
        <AlertCircleIcon size={16} className="text-danger-000" />
      ) : (
        <CheckCircleIcon size={16} className="text-success-100" />
      )}
      <span className="font-base-sm">{notice.message}</span>
    </div>
  );
};

const ProviderStatusBadge: React.FC<{
  status: AiProvider['status'];
  message?: string;
  dirty: boolean;
}> = ({ status, message, dirty }) => {
  if (dirty && status === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bg-200 px-2 py-0.5 text-text-400 font-base-sm">
        <FormattedMessage id="unsaved" defaultMessage="未保存" />
      </span>
    );
  }
  if (status === 'testing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-bg-200 px-2 py-0.5 text-text-300 font-base-sm">
        <SpinnerIcon size={12} className="animate-spin" />
        <FormattedMessage id="testing" defaultMessage="测试中" />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-100/15 px-2 py-0.5 text-success-100 font-base-sm">
        <CheckCircleIcon size={12} />
        <FormattedMessage id="active" defaultMessage="正常" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-danger-000/15 px-2 py-0.5 text-danger-000 font-base-sm"
        title={message}
      >
        <AlertCircleIcon size={12} />
        <FormattedMessage id="error" defaultMessage="错误" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-bg-200 px-2 py-0.5 text-text-400 font-base-sm">
      <FormattedMessage id="not_tested" defaultMessage="未测试" />
    </span>
  );
};

export { ProviderConfigSection };
