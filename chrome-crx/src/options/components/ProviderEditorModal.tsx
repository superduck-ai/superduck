import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator
} from '@/components/ui';
import { DEFAULT_CONTEXT_LENGTH } from '@/constants/models';
import {
  DEFAULT_BASE_URL,
  PROVIDER_KIND_LABEL,
  isValidProviderBaseURL,
  newProviderId,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind
} from '@/utils/providerStore';
import { useProviderModelCatalog } from './useProviderModelCatalog';
import { useContextLengthResolution } from './useContextLengthResolution';
import { SpinnerIcon } from './providerConfigSection/icons';

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI Chat' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai-compatible', label: 'OpenAI Responses' }
];
const DEFAULT_PROVIDER_KIND: ProviderKind = 'anthropic';

export interface ProviderEditorValue {
  id: string;
  kind: ProviderKind;
  name: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
  /** Max context window captured from /v1/models for this modelId. */
  contextLength?: number;
}

interface ProviderEditorModalProps {
  isOpen: boolean;
  provider?: AiProvider | null;
  onCancel: () => void;
  onSave: (value: ProviderEditorValue) => void | Promise<void>;
}

const ProviderEditorModal: React.FC<ProviderEditorModalProps> = ({
  isOpen,
  provider,
  onCancel,
  onSave
}) => {
  const intl = useIntl();
  const isEditing = Boolean(provider);

  const [kind, setKind] = useState<ProviderKind>(DEFAULT_PROVIDER_KIND);
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitTokenRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  const {
    modelMetadata,
    modelDropdownOpen,
    setModelDropdownOpen,
    isLoadingModels,
    filteredModelOptions,
    modelInputContainerRef,
    resetCatalog
  } = useProviderModelCatalog({ isOpen, kind, apiKey, baseURL, modelId });

  const {
    contextLengthInput,
    contextLengthSource,
    contextLengthTouched,
    isResolvingContextLength,
    setIsResolvingContextLength,
    parsedContextLength,
    hasInvalidContextLength,
    handleContextLengthChange,
    resetContextLengthLookup,
    resetForOpen,
    resolveContextLengthForSubmit
  } = useContextLengthResolution({
    isOpen,
    provider,
    kind,
    baseURL,
    modelId,
    modelMetadata,
    apiKey,
    submitTokenRef,
    isOpenRef
  });

  useEffect(() => {
    isOpenRef.current = isOpen;
    submitTokenRef.current += 1;
    if (!isOpen) return;
    setKind(provider?.kind ?? DEFAULT_PROVIDER_KIND);
    setName(provider?.name ?? '');
    setModelId(provider?.modelId ?? '');
    setApiKey(provider?.apiKey ?? '');
    setBaseURL(provider?.baseURL ?? '');
    resetForOpen(provider?.contextLength);
    resetCatalog();
  }, [isOpen, provider, resetCatalog, resetForOpen]);

  const placeholderBaseURL = useMemo(
    () => DEFAULT_BASE_URL[kind] || 'https://your-gateway.com',
    [kind]
  );
  const placeholderName = useMemo(() => {
    if (isEditing) return name;
    return PROVIDER_KIND_LABEL[kind];
  }, [isEditing, kind, name]);

  const submitDisabled = !name.trim() && !PROVIDER_KIND_LABEL[kind];
  const hasInvalidBaseURL = !isValidProviderBaseURL(baseURL);

  const handleBaseURLBlur = () => {
    setBaseURL((current) => {
      const trimmed = current.trim();
      if (!trimmed) return '';
      if (!isValidProviderBaseURL(trimmed)) return trimmed;
      return normalizeProviderBaseURL(kind, trimmed);
    });
  };

  const handleModelIdChange = (nextModelId: string) => {
    setModelId(nextModelId);
    resetContextLengthLookup(nextModelId);
  };

  const handleBaseURLChange = (nextBaseURL: string) => {
    setBaseURL(nextBaseURL);
    resetContextLengthLookup();
  };

  const handleCancel = () => {
    if (isSubmitting) return;
    submitTokenRef.current += 1;
    isOpenRef.current = false;
    setIsResolvingContextLength(false);
    onCancel();
  };

  const handleSubmit = async () => {
    if (isResolvingContextLength) return;
    if (!isValidProviderBaseURL(baseURL)) return;
    if (hasInvalidContextLength) return;
    const submitToken = submitTokenRef.current + 1;
    submitTokenRef.current = submitToken;
    const trimmedModelId = modelId.trim();
    const value: ProviderEditorValue = {
      id: provider?.id ?? newProviderId(),
      kind,
      name: name.trim() || PROVIDER_KIND_LABEL[kind],
      modelId: trimmedModelId,
      apiKey: apiKey.trim(),
      baseURL: normalizeProviderBaseURL(kind, baseURL)
    };
    const contextLength =
      contextLengthTouched && parsedContextLength
        ? parsedContextLength
        : await resolveContextLengthForSubmit(trimmedModelId, submitToken);
    if (submitTokenRef.current !== submitToken || !isOpenRef.current) return;
    setIsSubmitting(true);
    try {
      await onSave({
        ...value,
        contextLength
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage(
              isEditing
                ? { id: 'edit_custom_model', defaultMessage: '编辑模型' }
                : { id: 'add_custom_model', defaultMessage: '添加模型' }
            )}
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              id="provider_editor_description"
              defaultMessage="Configure the provider, credentials, and model used by SuperDuck."
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
              <FormattedMessage id="provider_kind" defaultMessage="供应商类型" />
            </Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                const next = value as ProviderKind;
                setKind(next);
                resetContextLengthLookup();
                setBaseURL((current) => {
                  const trimmed = current.trim();
                  if (!trimmed) return '';
                  if (!isValidProviderBaseURL(trimmed)) return trimmed;
                  return normalizeProviderBaseURL(next, trimmed);
                });
                resetCatalog();
                if (!baseURL && !isEditing) {
                  setBaseURL(DEFAULT_BASE_URL[next] ?? '');
                }
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-border/40 px-3 transition-all hover:border-border/80 focus-visible:border-primary/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
              <FormattedMessage id="custom_model_display_name" defaultMessage="显示名称" />
            </Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholderName}
              className="h-10 rounded-xl border-border/40 px-3 transition-all hover:border-border/80 focus-visible:border-primary/60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
              <FormattedMessage id="api_url_label" defaultMessage="API URL" />
            </Label>
            <Input
              value={baseURL}
              onChange={(event) => handleBaseURLChange(event.target.value)}
              onBlur={handleBaseURLBlur}
              className="h-10 rounded-xl border-border/40 px-3 transition-all hover:border-border/80 focus-visible:border-primary/60"
              placeholder={intl.formatMessage(
                { id: 'api_url_hint', defaultMessage: 'Leave blank to use the default ({url}).' },
                { url: placeholderBaseURL }
              )}
            />
            {hasInvalidBaseURL && (
              <p className="mt-1 text-xs text-destructive pl-0.5">
                <FormattedMessage
                  id="api_url_invalid"
                  defaultMessage="请输入有效域名或以 http:// / https:// 开头的 URL。"
                />
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
              <FormattedMessage id="api_key_label" defaultMessage="API 密钥" />
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              className="h-10 rounded-xl border-border/40 px-3 transition-all hover:border-border/80 focus-visible:border-primary/60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
              <FormattedMessage id="model_id_label" defaultMessage="模型 ID" />
            </Label>
            <Popover
              open={modelDropdownOpen && (isLoadingModels || filteredModelOptions.length > 0)}
              onOpenChange={setModelDropdownOpen}
            >
              <PopoverTrigger render={<div ref={modelInputContainerRef} />}>
                <Input
                  value={modelId}
                  onFocus={() => setModelDropdownOpen(true)}
                  onChange={(event) => {
                    handleModelIdChange(event.target.value);
                    setModelDropdownOpen(true);
                  }}
                  placeholder={intl.formatMessage({
                    id: 'model_id_placeholder',
                    defaultMessage: '例如 claude-opus-4-6 / gpt-4o / qwen2.5:7b'
                  })}
                  className="h-10 rounded-xl border-border/40 px-3 transition-all hover:border-border/80 focus-visible:border-primary/60"
                />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-(--anchor-width) rounded-xl p-0 shadow-lg ring-1 ring-foreground/10"
              >
                <Command shouldFilter={false}>
                  <CommandList>
                    {isLoadingModels ? (
                      <CommandEmpty>
                        <FormattedMessage id="loading_models" defaultMessage="模型列表加载中..." />
                      </CommandEmpty>
                    ) : filteredModelOptions.length === 0 ? (
                      <CommandEmpty>
                        <FormattedMessage id="no_models_found" defaultMessage="No models found." />
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredModelOptions.map((model) => (
                          <CommandItem
                            key={model}
                            value={model}
                            onSelect={() => {
                              handleModelIdChange(model);
                              setModelDropdownOpen(false);
                            }}
                          >
                            {model}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Separator className="my-5 opacity-40" />

          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-foreground/90">
                <FormattedMessage id="advanced_settings" defaultMessage="高级设置" />
              </h3>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold tracking-wide text-muted-foreground pl-0.5">
                <FormattedMessage id="context_length_label" defaultMessage="上下文长度" />
              </Label>
              <div className="relative flex items-center">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={contextLengthInput}
                  onChange={(event) => handleContextLengthChange(event.target.value)}
                  placeholder={String(DEFAULT_CONTEXT_LENGTH)}
                  className="h-10 rounded-xl border-border/40 pr-16 pl-3 transition-all hover:border-border/80 focus-visible:border-primary/60"
                />
                <span className="absolute right-3.5 text-xs font-semibold text-muted-foreground/60 tracking-wider select-none pointer-events-none">
                  tokens
                </span>
              </div>
              <p className="text-xs text-muted-foreground/60 leading-normal pl-0.5">
                {isResolvingContextLength ? (
                  <FormattedMessage
                    id="context_length_detecting"
                    defaultMessage="正在检测上下文长度..."
                  />
                ) : contextLengthSource === 'manual' ? (
                  <FormattedMessage
                    id="context_length_hint_manual"
                    defaultMessage="手动填写的上下文长度会随该模型保存。"
                  />
                ) : contextLengthSource === 'saved' ? (
                  <FormattedMessage
                    id="context_length_hint_saved"
                    defaultMessage="使用此模型已保存的上下文长度。"
                  />
                ) : contextLengthSource === 'provider' ? (
                  <FormattedMessage
                    id="context_length_hint_provider"
                    defaultMessage="从当前供应商的模型列表检测到。"
                  />
                ) : contextLengthSource === 'cache' ? (
                  <FormattedMessage
                    id="context_length_hint_cache"
                    defaultMessage="从本地模型元数据缓存读取。"
                  />
                ) : contextLengthSource === 'builtin' ? (
                  <FormattedMessage
                    id="context_length_hint_builtin"
                    defaultMessage="使用 SuperDuck 内置的模型上下文长度。"
                  />
                ) : (
                  <FormattedMessage
                    id="context_length_hint_default"
                    defaultMessage="没有找到模型元数据时使用默认值，可手动覆盖。"
                  />
                )}
              </p>
              {hasInvalidContextLength && (
                <p className="mt-1 text-xs text-destructive pl-0.5">
                  <FormattedMessage
                    id="context_length_invalid"
                    defaultMessage="请输入大于 0 的上下文 token 数。"
                  />
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2 border-t border-border/30">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="h-10 px-5 rounded-xl border-border/60 hover:bg-muted/40 transition-colors"
          >
            <FormattedMessage id="cancel" defaultMessage="取消" />
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            className="h-10 px-5 rounded-xl font-medium transition-all active:scale-[0.98]"
            disabled={
              submitDisabled ||
              hasInvalidBaseURL ||
              hasInvalidContextLength ||
              isResolvingContextLength ||
              isSubmitting
            }
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon data-icon="inline-start" size={14} className="animate-spin" />
                <FormattedMessage id="saving" defaultMessage="保存中..." />
              </>
            ) : (
              <FormattedMessage
                id={isEditing ? 'update' : 'add'}
                defaultMessage={isEditing ? '更新' : '添加'}
              />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { ProviderEditorModal };
