import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { CircleHelp, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui';
import { getConfiguredModelMetadata } from '@/constants/models';
import {
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
import { isProviderConfigUsable } from '@/utils/providerConfigStatus';
import { lookupCachedModelMetadata, testProviderConnection } from '@/utils/providerModelCatalog';
import { ProviderEditorModal, type ProviderEditorValue } from './ProviderEditorModal';
import {
  PencilIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  INPUT_MODALITY_ICON,
  type InputModalityItem
} from './providerConfigSection/icons';
import {
  getProviderBadgeText,
  getInputModalitiesFromMetadata,
  getModelMetadata,
  hasInputModalityMetadata,
  type ProviderStatusInfo
} from './providerConfigSection/metadata';
import { ModelSetupGuide } from './providerConfigSection/ModelSetupGuide';
import { ProviderStatusBadge } from './providerConfigSection/ProviderStatusBadge';
import { SettingsSection } from './SettingsLayout';

const hasSameProviderConnection = (
  provider: AiProvider,
  value: Pick<ProviderEditorValue, 'kind' | 'modelId' | 'apiKey' | 'baseURL'>
) =>
  provider.kind === value.kind &&
  provider.modelId === value.modelId &&
  provider.apiKey === value.apiKey &&
  provider.baseURL === value.baseURL;

const ProviderConfigSection: React.FC = () => {
  const intl = useIntl();
  const [config, setConfig] = useState<ProviderConfig>(() => emptyConfigSnapshot());
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [statusOverlay, setStatusOverlay] = useState<Record<string, ProviderStatusInfo>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cachedModelMetadata, setCachedModelMetadata] = useState<
    Record<string, ProviderModelMetadata | null>
  >({});

  const shouldShowSetupGuide = isConfigLoaded && !isProviderConfigUsable(config);
  const hasSectionNotice = Boolean(saveError || shouldShowSetupGuide);
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

  const openAddProvider = () => {
    setEditingProvider(null);
    setEditorOpen(true);
  };

  const openEditProvider = (provider: AiProvider) => {
    setEditingProvider(provider);
    setEditorOpen(true);
  };

  const handleTestProvider = useCallback(async (provider: AiProvider) => {
    setStatusOverlay((prev) => ({ ...prev, [provider.id]: { status: 'testing' } }));
    setSaveError(null);
    try {
      const result = await testProviderConnection(provider);
      const latestConfig = await loadProviderConfig(true);
      const latestProvider = latestConfig.providers.find((entry) => entry.id === provider.id);
      if (!latestProvider || !hasSameProviderConnection(latestProvider, provider)) return;

      const nextConfig: ProviderConfig = {
        ...latestConfig,
        providers: latestConfig.providers.map((entry) =>
          entry.id === provider.id
            ? {
                ...entry,
                status: result.ok ? 'active' : 'error',
                lastTestedAt: Date.now(),
                errorMessage: result.ok ? undefined : result.error
              }
            : entry
        )
      };
      await saveProviderConfig(nextConfig);
      setConfig(nextConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setStatusOverlay((prev) => {
        const next = { ...prev };
        delete next[provider.id];
        return next;
      });
    }
  }, []);

  const handleSaveProvider = async (value: ProviderEditorValue) => {
    setSaveError(null);
    const existingProvider = config.providers.find((entry) => entry.id === value.id);
    const shouldTestConnection =
      !existingProvider || !hasSameProviderConnection(existingProvider, value);
    const nextProvider: AiProvider = {
      id: value.id,
      kind: value.kind,
      name: value.name,
      modelId: value.modelId,
      apiKey: value.apiKey,
      baseURL: value.baseURL,
      contextLength: value.contextLength,
      status: existingProvider && !shouldTestConnection ? existingProvider.status : 'unknown',
      lastTestedAt:
        existingProvider && !shouldTestConnection ? existingProvider.lastTestedAt : undefined,
      errorMessage:
        existingProvider && !shouldTestConnection ? existingProvider.errorMessage : undefined
    };
    const nextConfig: ProviderConfig = {
      ...config,
      providers: existingProvider
        ? config.providers.map((entry) => (entry.id === value.id ? nextProvider : entry))
        : [...config.providers, nextProvider]
    };
    setIsSaving(true);
    try {
      await saveProviderConfig(nextConfig);
      setConfig(nextConfig);
      setEditorOpen(false);
      setEditingProvider(null);
      if (shouldTestConnection && isProviderComplete(nextProvider)) {
        void handleTestProvider(nextProvider);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    setSaveError(null);
    const nextConfig: ProviderConfig = {
      ...config,
      providers: config.providers.filter((entry) => entry.id !== providerId)
    };
    setIsSaving(true);
    try {
      await saveProviderConfig(nextConfig);
      setConfig(nextConfig);
      setDeleteConfirmId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderProviderCard = (provider: AiProvider) => {
    const overlay = statusOverlay[provider.id];
    const effectiveStatus: AiProvider['status'] = overlay?.status ?? provider.status;
    const errorMessage = overlay?.message ?? provider.errorMessage;
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

    const testLabel = intl.formatMessage({ id: 'test', defaultMessage: '测试' });
    const editLabel = intl.formatMessage({ id: 'edit_2', defaultMessage: 'Edit' });
    const deleteLabel = intl.formatMessage({ id: 'delete', defaultMessage: 'Delete' });
    const actionsLabel = intl.formatMessage({
      id: 'provider_actions',
      defaultMessage: 'Provider actions'
    });

    return (
      <div
        key={provider.id}
        className="group/row flex min-w-0 flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/30 last:border-b-0 hover:bg-muted/10 transition-colors"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/20 font-mono text-[10px] font-medium text-muted-foreground">
            {getProviderBadgeText(provider)}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
                {provider.name}
              </span>
              <ProviderStatusBadge status={effectiveStatus} message={errorMessage} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5 text-muted-foreground/80">
              <span className="min-w-0 truncate">
                {PROVIDER_KIND_LABEL[provider.kind]}
                {provider.modelId ? ` · ${provider.modelId}` : ''}
              </span>
              {trimmedModelId && (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60"
                  aria-label={inputModalitiesLabel}
                >
                  {isLoadingModalities ? (
                    <span
                      title={inputModalitiesDetectingLabel}
                      aria-label={inputModalitiesDetectingLabel}
                      className="inline-flex size-5 items-center justify-center rounded text-muted-foreground"
                    >
                      <SpinnerIcon aria-hidden size={13} className="animate-spin" />
                    </span>
                  ) : inputModalityItems.length > 0 ? (
                    inputModalityItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <span
                          key={item.key}
                          title={item.title}
                          aria-label={item.title}
                          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <Icon aria-hidden size={13} />
                          <span className="sr-only">{item.label}</span>
                        </span>
                      );
                    })
                  ) : (
                    <span
                      title={unavailableLabel}
                      aria-label={unavailableLabel}
                      className="inline-flex size-5 items-center justify-center rounded text-muted-foreground"
                    >
                      <CircleHelp aria-hidden size={13} />
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 self-start sm:self-center"
          aria-label={actionsLabel}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleTestProvider(provider)}
                  disabled={!isProviderComplete(provider)}
                  aria-label={testLabel}
                  title={testLabel}
                  className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
                />
              }
            >
              {effectiveStatus === 'testing' ? (
                <SpinnerIcon aria-hidden size={14} className="animate-spin" />
              ) : (
                <PlugZap aria-hidden size={14} />
              )}
            </TooltipTrigger>
            <TooltipContent>{testLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEditProvider(provider)}
                  title={editLabel}
                  aria-label={editLabel}
                  className="text-muted-foreground/50 hover:text-foreground hover:bg-muted/80 rounded-md transition-colors"
                />
              }
            >
              <PencilIcon size={14} />
            </TooltipTrigger>
            <TooltipContent>{editLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteConfirmId(provider.id)}
                  className="text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors"
                  title={deleteLabel}
                  aria-label={deleteLabel}
                />
              }
            >
              <TrashIcon size={14} />
            </TooltipTrigger>
            <TooltipContent>{deleteLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <SettingsSection
      title={<FormattedMessage id="model_providers" defaultMessage="Model Providers" />}
      description={
        <FormattedMessage
          id="model_config_description"
          defaultMessage="Configure model providers used by SuperDuck browser automation."
        />
      }
      actions={
        <Button variant="outline" size="sm" onClick={openAddProvider}>
          <PlusIcon data-icon="inline-start" size={14} />
          <FormattedMessage id="add" defaultMessage="添加" />
        </Button>
      }
    >
      {hasSectionNotice && (
        <div className="px-6 pt-5">
          {saveError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}

          {shouldShowSetupGuide && <ModelSetupGuide onAddProvider={openAddProvider} />}
        </div>
      )}

      {config.providers.length > 0 && (
        <div className={hasSectionNotice ? 'mt-4' : ''}>
          <div className="divide-y divide-border/30">
            {config.providers.map((provider) => (
              <React.Fragment key={provider.id}>{renderProviderCard(provider)}</React.Fragment>
            ))}
          </div>
        </div>
      )}

      <ProviderEditorModal
        isOpen={editorOpen}
        provider={editingProvider}
        onCancel={() => {
          setEditorOpen(false);
          setEditingProvider(null);
        }}
        onSave={handleSaveProvider}
      />

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage defaultMessage="Delete model provider" id="delete_provider_title" />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                defaultMessage="Are you sure you want to delete this model provider? This action will remove the API key and endpoint configuration."
                id="delete_provider_confirm_description"
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              <FormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button
              variant="destructive"
              disabled={isSaving}
              onClick={() => {
                if (deleteConfirmId) {
                  void handleDeleteProvider(deleteConfirmId);
                }
              }}
            >
              {isSaving && (
                <SpinnerIcon data-icon="inline-start" size={14} className="animate-spin" />
              )}
              <FormattedMessage defaultMessage="Delete" id="delete" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
};

export { ProviderConfigSection };
