import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  AudioLines,
  CircleHelp,
  FileText,
  Image,
  Type,
  Video,
  createLucideIcon,
  type LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui';
import { getConfiguredModelMetadata } from '@/constants/models';
import {
  PROVIDER_CONFIG_BROADCAST,
  PROVIDER_KIND_LABEL,
  emptyConfigSnapshot,
  getModelMetadataCacheStorageKey,
  isProviderComplete,
  loadProviderConfig,
  lookupCachedModelMetadata,
  saveProviderConfig,
  testProviderConnection,
  type AiProvider,
  type ProviderConfig,
  type ProviderModelMetadata,
  type ProviderKind
} from '@/utils/providerStore';
import {
  getFirstUsableProvider,
  isProviderConfigUsable,
  isProviderReadyForSetup,
  parseProviderConfigSnapshot
} from '@/utils/providerConfigStatus';
import { ProviderEditorModal, type ProviderEditorValue } from './ProviderEditorModal';

const PlusIcon = createLucideIcon('plus', [
  ['path', { d: 'M5 12h14', key: '1ays0h' }],
  ['path', { d: 'M12 5v14', key: 's699le' }]
]);

const TrashIcon = createLucideIcon('trash', [
  ['path', { d: 'M3 6h18', key: 'd0wm0j' }],
  ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', key: '4alrt4' }],
  ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', key: 'v07s9e' }]
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

const PROVIDER_KIND_COLOR: Record<ProviderKind, string> = {
  anthropic: 'bg-[#d97757] text-white',
  openai: 'bg-emerald-600 text-white',
  gemini: 'bg-blue-600 text-white',
  'openai-compatible': 'bg-emerald-600 text-white'
};
const INPUT_MODALITY_ORDER = ['text', 'image', 'video', 'audio', 'file'];
const INPUT_MODALITY_ICON: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  video: Video,
  audio: AudioLines,
  file: FileText
};

function getProviderBadgeText(provider: AiProvider): string {
  return provider.name.trim().charAt(0).toUpperCase() || '?';
}

function normalizeInputModality(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^input[_-]?/, '');
  if (!normalized) return '';
  if (normalized.includes('image')) return 'image';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('audio') || normalized.includes('sound')) return 'audio';
  if (
    normalized.includes('file') ||
    normalized.includes('document') ||
    normalized.includes('pdf')
  ) {
    return 'file';
  }
  if (normalized.includes('text')) return 'text';
  return normalized;
}

function getInputModalitiesFromMetadata(metadata: ProviderModelMetadata | undefined): string[] {
  if (!metadata) return [];
  const explicit = metadata.inputModalities ?? [];
  const parsedFromModality = metadata.modality
    ? (metadata.modality.split('->')[0]?.split('+') ?? [])
    : [];
  const values = explicit.length > 0 ? explicit : parsedFromModality;
  return Array.from(
    new Set(values.map(normalizeInputModality).filter((value) => value.trim().length > 0))
  ).sort((a, b) => {
    const aIndex = INPUT_MODALITY_ORDER.indexOf(a);
    const bIndex = INPUT_MODALITY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function hasInputModalityMetadata(metadata: ProviderModelMetadata | undefined): boolean {
  return getInputModalitiesFromMetadata(metadata).length > 0;
}

function getModelMetadata(
  modelId: string,
  cacheKey: string,
  cachedModelMetadata: Record<string, ProviderModelMetadata | null>
): ProviderModelMetadata | undefined {
  const trimmedModelId = modelId.trim();
  if (!trimmedModelId) return undefined;
  const configured = getConfiguredModelMetadata(trimmedModelId);
  const cached = cachedModelMetadata[cacheKey] ?? undefined;
  if (!configured) return cached;
  if (!cached || hasInputModalityMetadata(configured)) return configured;
  return {
    ...cached,
    ...configured,
    modality: configured.modality ?? cached.modality,
    inputModalities: configured.inputModalities ?? cached.inputModalities
  };
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

interface InputModalityItem {
  key: string;
  label: string;
  title: string;
  icon: LucideIcon;
}

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

interface ModelSetupGuideProps {
  config: ProviderConfig;
  isDirty: boolean;
  isSaving: boolean;
  onAddProvider: () => void;
  onEditProvider: (provider: AiProvider) => void;
  onSave: () => void;
}

const ModelSetupGuide: React.FC<ModelSetupGuideProps> = ({
  config,
  isDirty,
  isSaving,
  onAddProvider,
  onEditProvider,
  onSave
}) => {
  const firstProvider = config.providers[0];
  const firstReadyProvider = getFirstUsableProvider(config);
  const hasProvider = config.providers.length > 0;
  const hasReadyProvider = Boolean(firstReadyProvider);
  const hasCurrentUsableConfig = isProviderConfigUsable(config);
  const needsSave = hasCurrentUsableConfig && isDirty;

  const action = (() => {
    if (!hasProvider) {
      return (
        <Button size="sm" prepend={<PlusIcon size={14} />} onClick={onAddProvider}>
          <FormattedMessage id="setup_guide_add_model" defaultMessage="添加模型" />
        </Button>
      );
    }

    if (!hasReadyProvider && firstProvider) {
      return (
        <Button size="sm" onClick={() => onEditProvider(firstProvider)}>
          <FormattedMessage id="setup_guide_complete_model" defaultMessage="完善模型信息" />
        </Button>
      );
    }

    if (needsSave) {
      return (
        <Button size="sm" loading={isSaving} onClick={onSave}>
          <FormattedMessage id="setup_guide_save_config" defaultMessage="保存配置" />
        </Button>
      );
    }

    return null;
  })();

  return (
    <div className="mt-6 rounded-xl border border-accent-main-100/25 bg-accent-main-100/[0.06] px-4 py-4 md:px-5 md:py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-bg-000/80 px-2 py-0.5 text-text-300 font-base-sm">
            <AlertCircleIcon size={14} className="text-accent-main-100" />
            <FormattedMessage id="setup_required" defaultMessage="首次使用必需" />
          </div>
          <h4 className="text-text-100 font-large">
            <FormattedMessage
              id="setup_model_before_use"
              defaultMessage="开始使用前，先连接一个大模型"
            />
          </h4>
          <p className="mt-1 max-w-2xl text-text-300 font-base-sm">
            <FormattedMessage
              id="setup_model_guide_description"
              defaultMessage="SuperDuck 需要一个可用模型来理解页面并执行任务。API Key 仅保存在 Chrome 本地。"
            />
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        <ModelSetupStep done={hasProvider}>
          <FormattedMessage id="setup_step_add_provider" defaultMessage="添加模型供应商" />
        </ModelSetupStep>
        <ModelSetupStep done={hasReadyProvider}>
          <FormattedMessage
            id="setup_step_complete_provider"
            defaultMessage="填写可用 API Key 和模型 ID"
          />
        </ModelSetupStep>
        <ModelSetupStep done={hasCurrentUsableConfig && !isDirty}>
          <FormattedMessage id="setup_step_save" defaultMessage="保存配置" />
        </ModelSetupStep>
      </ol>
    </div>
  );
};

const ModelSetupStep: React.FC<{ done: boolean; children: React.ReactNode }> = ({
  done,
  children
}) => (
  <li className="flex min-w-0 items-center gap-2 text-sm">
    {done ? (
      <CheckCircleIcon size={16} className="shrink-0 text-success-100" />
    ) : (
      <span className="h-4 w-4 shrink-0 rounded-full border border-border-300 bg-bg-000" />
    )}
    <span className={done ? 'text-text-200 font-base-sm' : 'text-text-400 font-base-sm'}>
      {children}
    </span>
  </li>
);

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
