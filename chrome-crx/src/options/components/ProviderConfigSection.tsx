import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui';
import { getConfiguredModelMetadata } from '@/constants/models';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_KIND_LABEL,
  emptyConfigSnapshot,
  getModelMetadataCacheStorageKey,
  isProviderComplete,
  loadProviderConfig,
  saveProviderConfig,
  type AiProvider,
  type ProviderConfig,
  type ProviderModelMetadata
} from '@/utils/providerStore';
import { lookupCachedModelMetadata, testProviderConnection } from '@/utils/providerModelCatalog';
import {
  isProviderConfigUsable,
  isProviderReadyForSetup,
  parseProviderConfigSnapshot
} from '@/utils/providerConfigStatus';
import { ProviderEditorModal, type ProviderEditorValue } from './ProviderEditorModal';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  PencilIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  INPUT_MODALITY_ICON,
  PROVIDER_KIND_COLOR,
  type InputModalityItem
} from './providerConfigSection/icons';
import {
  getProviderBadgeText,
  getInputModalitiesFromMetadata,
  getModelMetadata,
  hasInputModalityMetadata,
  type ProviderStatusInfo,
  type SaveNotice
} from './providerConfigSection/metadata';
import { ModelSetupGuide } from './providerConfigSection/ModelSetupGuide';
import { ProviderStatusBadge } from './providerConfigSection/ProviderStatusBadge';

const ProviderConfigSection: React.FC = () => {
  const intl = useIntl();
  const [config, setConfig] = useState<ProviderConfig>(() => emptyConfigSnapshot());
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(emptyConfigSnapshot())
  );
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [dirtyProviderIds, setDirtyProviderIds] = useState<Set<string>>(new Set());
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusOverlay, setStatusOverlay] = useState<Record<string, ProviderStatusInfo>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cachedModelMetadata, setCachedModelMetadata] = useState<
    Record<string, ProviderModelMetadata | null>
  >({});

  const isDirty = useMemo(() => JSON.stringify(config) !== savedSnapshot, [config, savedSnapshot]);
  const hasUsableSavedConfig = useMemo(() => {
    const savedConfig = parseProviderConfigSnapshot(savedSnapshot);
    return savedConfig ? isProviderConfigUsable(savedConfig) : false;
  }, [savedSnapshot]);
  const shouldShowSetupGuide = isConfigLoaded && !hasUsableSavedConfig;
  const providerMetadataRequests = useMemo(
    () =>
      config.providers
        .map((provider) => {
          const modelId = provider.modelId.trim();
          if (!modelId) return null;
          return {
            cacheKey: `${getModelMetadataCacheStorageKey(provider)}:${modelId}`,
            modelId,
            provider
          };
        })
        .filter(
          (request): request is { cacheKey: string; modelId: string; provider: AiProvider } =>
            request !== null
        ),
    [config.providers]
  );
  const inputModalityLabels = useMemo(
    () => ({
      text: intl.formatMessage({ id: 'input_modality_text', defaultMessage: '文本' }),
      image: intl.formatMessage({ id: 'input_modality_image', defaultMessage: '图片' }),
      video: intl.formatMessage({ id: 'input_modality_video', defaultMessage: '视频' }),
      audio: intl.formatMessage({ id: 'input_modality_audio', defaultMessage: '音频' }),
      file: intl.formatMessage({ id: 'input_modality_file', defaultMessage: '文件' })
    }),
    [intl]
  );

  useEffect(() => {
    void (async () => {
      const loaded = await loadProviderConfig();
      setConfig(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
      setIsConfigLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const missingRequests = providerMetadataRequests.filter((request) => {
      const configured = getConfiguredModelMetadata(request.modelId);
      return !hasInputModalityMetadata(configured) && !(request.cacheKey in cachedModelMetadata);
    });
    if (missingRequests.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missingRequests.map(async (request): Promise<[string, ProviderModelMetadata | null]> => {
        try {
          return [
            request.cacheKey,
            (await lookupCachedModelMetadata(request.provider, request.modelId)) ?? null
          ];
        } catch {
          return [request.cacheKey, null];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setCachedModelMetadata((previous) => {
        const next = { ...previous };
        for (const [modelId, metadata] of entries) {
          next[modelId] = metadata;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cachedModelMetadata, providerMetadataRequests]);

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
        contextLength: value.contextLength,
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
      return { ...previous, providers: nextProviders };
    });
    markDirty(value.id);
    setEditorOpen(false);
    setEditingProvider(null);
  };

  const handleDeleteProvider = (providerId: string) => {
    setConfig((previous) => ({
      ...previous,
      providers: previous.providers.filter((entry) => entry.id !== providerId)
    }));
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
    setIsConfigLoaded(true);
    setDirtyProviderIds(new Set());
    setSaveError(null);
    setSaveNotice(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveNotice(null);

    const readyProviders = config.providers.filter(isProviderReadyForSetup);
    if (readyProviders.length === 0) {
      setSaveError(
        intl.formatMessage({
          id: 'save_validation_no_usable_provider',
          defaultMessage: '保存前请至少添加一个可用的模型（含 API Key、模型 ID 且测试通过）'
        })
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

  const renderProviderCard = (provider: AiProvider) => {
    const overlay = statusOverlay[provider.id];
    const effectiveStatus: AiProvider['status'] = overlay?.status ?? provider.status;
    const errorMessage = overlay?.message ?? provider.errorMessage;
    const dirty = dirtyProviderIds.has(provider.id);
    const trimmedModelId = provider.modelId.trim();
    const cacheKey = `${getModelMetadataCacheStorageKey(provider)}:${trimmedModelId}`;
    const hasCachedMetadata = cacheKey in cachedModelMetadata;
    const metadata = getModelMetadata(trimmedModelId, cacheKey, cachedModelMetadata);
    const configuredMetadata = getConfiguredModelMetadata(trimmedModelId);
    const isLoadingModalities =
      trimmedModelId.length > 0 &&
      !hasInputModalityMetadata(configuredMetadata) &&
      !hasCachedMetadata;
    const inputModalities = getInputModalitiesFromMetadata(metadata);
    const inputModalityItems: InputModalityItem[] = inputModalities.map((modality) => {
      const label = inputModalityLabels[modality as keyof typeof inputModalityLabels] ?? modality;
      return {
        key: modality,
        label,
        title: intl.formatMessage(
          { id: 'input_modality_icon_title', defaultMessage: '可读取{modality}' },
          { modality: label }
        ),
        icon: INPUT_MODALITY_ICON[modality] ?? CircleHelp
      };
    });
    const unavailableLabel = intl.formatMessage({
      id: 'input_modalities_hint_unavailable',
      defaultMessage: '没有找到输入模态信息。'
    });
    const inputModalitiesLabel = intl.formatMessage({
      id: 'input_modalities_label',
      defaultMessage: '输入模态'
    });
    const inputModalitiesDetectingLabel = intl.formatMessage({
      id: 'input_modalities_detecting',
      defaultMessage: '正在读取模型能力...'
    });

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
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-text-400 font-base-sm">
                <span className="truncate">
                  {PROVIDER_KIND_LABEL[provider.kind]}
                  {provider.modelId ? ` · ${provider.modelId}` : ''}
                </span>
                {trimmedModelId && (
                  <span
                    className="flex shrink-0 items-center gap-1 text-text-300"
                    aria-label={inputModalitiesLabel}
                  >
                    {isLoadingModalities ? (
                      <span
                        title={inputModalitiesDetectingLabel}
                        aria-label={inputModalitiesDetectingLabel}
                        className="inline-flex size-5 items-center justify-center rounded text-text-500"
                      >
                        <SpinnerIcon aria-hidden size={14} className="animate-spin" />
                      </span>
                    ) : inputModalityItems.length > 0 ? (
                      inputModalityItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <span
                            key={item.key}
                            title={item.title}
                            aria-label={item.title}
                            className="inline-flex size-5 items-center justify-center rounded text-text-300 transition-colors hover:bg-bg-100 hover:text-text-100"
                          >
                            <Icon aria-hidden size={15} />
                            <span className="sr-only">{item.label}</span>
                          </span>
                        );
                      })
                    ) : (
                      <span
                        title={unavailableLabel}
                        aria-label={unavailableLabel}
                        className="inline-flex size-5 items-center justify-center rounded text-text-500"
                      >
                        <CircleHelp aria-hidden size={15} />
                      </span>
                    )}
                  </span>
                )}
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

      {shouldShowSetupGuide && (
        <ModelSetupGuide
          config={config}
          isDirty={isDirty}
          isSaving={isSaving}
          onAddProvider={openAddProvider}
          onEditProvider={openEditProvider}
          onSave={() => void handleSave()}
        />
      )}

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

export { ProviderConfigSection };
