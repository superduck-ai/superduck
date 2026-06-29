import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Modal, ModalFooter, SimpleSelect, TextInput } from '@/components/ui';
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
  onSave: (value: ProviderEditorValue) => void;
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
    onSave({
      ...value,
      contextLength
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      modalSize="md"
      hasCloseButton
      title={intl.formatMessage(
        isEditing
          ? { id: 'edit_custom_model', defaultMessage: '编辑模型' }
          : { id: 'add_custom_model', defaultMessage: '添加模型' }
      )}
    >
      <div className="space-y-4 mt-2">
        <div>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="provider_kind" defaultMessage="供应商类型" />
          </label>
          <SimpleSelect
            value={kind}
            onChange={(value) => {
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
            options={KIND_OPTIONS}
          />
        </div>

        <div>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="custom_model_display_name" defaultMessage="显示名称" />
          </label>
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={placeholderName}
          />
        </div>

        <div>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="api_url_label" defaultMessage="API URL" />
          </label>
          <TextInput
            value={baseURL}
            onChange={(event) => handleBaseURLChange(event.target.value)}
            onBlur={handleBaseURLBlur}
            placeholder={intl.formatMessage(
              { id: 'api_url_hint', defaultMessage: 'Leave blank to use the default ({url}).' },
              { url: placeholderBaseURL }
            )}
          />
          {hasInvalidBaseURL && (
            <p className="mt-1 text-xs text-danger-000">
              <FormattedMessage
                id="api_url_invalid"
                defaultMessage="请输入有效域名或以 http:// / https:// 开头的 URL。"
              />
            </p>
          )}
        </div>

        <div>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="api_key_label" defaultMessage="API 密钥" />
          </label>
          <TextInput
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="model_id_label" defaultMessage="模型 ID" />
          </label>
          <div ref={modelInputContainerRef} className="relative">
            <TextInput
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
            />
            {modelDropdownOpen && (isLoadingModels || filteredModelOptions.length > 0) && (
              <div className="absolute z-dropdown mt-1 w-full max-h-60 overflow-auto rounded-xl border-0.5 border-border-200 bg-bg-000 p-1.5 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)]">
                {isLoadingModels ? (
                  <div className="px-2 py-2 text-text-400 font-base">
                    <FormattedMessage id="loading_models" defaultMessage="模型列表加载中..." />
                  </div>
                ) : (
                  filteredModelOptions.map((model) => (
                    <button
                      key={model}
                      type="button"
                      className="w-full rounded-md px-2 py-2 text-left text-text-100 transition-colors hover:bg-bg-200 font-base"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        handleModelIdChange(model);
                        setModelDropdownOpen(false);
                      }}
                    >
                      {model}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border-300 pt-4">
          <h3 className="mb-3 text-text-100 font-base-bold">
            <FormattedMessage id="advanced_settings" defaultMessage="高级设置" />
          </h3>
          <label className="block text-text-200 font-base-sm mb-1.5">
            <FormattedMessage id="context_length_label" defaultMessage="上下文长度" />
          </label>
          <TextInput
            type="number"
            min={1}
            step={1}
            value={contextLengthInput}
            onChange={(event) => handleContextLengthChange(event.target.value)}
            placeholder={String(DEFAULT_CONTEXT_LENGTH)}
            append={
              <span className="whitespace-nowrap text-text-400 font-base-sm">
                <FormattedMessage id="context_length_tokens" defaultMessage="tokens" />
              </span>
            }
            secondaryLabel={
              isResolvingContextLength ? (
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
              )
            }
          />
          {hasInvalidContextLength && (
            <p className="mt-1 text-xs text-danger-000">
              <FormattedMessage
                id="context_length_invalid"
                defaultMessage="请输入大于 0 的上下文 token 数。"
              />
            </p>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={handleCancel}>
          <FormattedMessage id="cancel" defaultMessage="取消" />
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={
            submitDisabled ||
            hasInvalidBaseURL ||
            hasInvalidContextLength ||
            isResolvingContextLength
          }
        >
          <FormattedMessage
            id={isEditing ? 'update' : 'add'}
            defaultMessage={isEditing ? '更新' : '添加'}
          />
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export { ProviderEditorModal };
