import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Modal, ModalFooter, SimpleSelect, TextInput } from '@/components/ui';
import { DEFAULT_CONTEXT_LENGTH, getConfiguredModelContextLength } from '@/constants/models';
import {
  DEFAULT_BASE_URL,
  PROVIDER_KIND_LABEL,
  fetchProviderModelCatalog,
  isValidProviderBaseURL,
  lookupModelContextLength,
  newProviderId,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind
} from '@/utils/providerStore';

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI Chat' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai-compatible', label: 'OpenAI Responses' }
];

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

  const [kind, setKind] = useState<ProviderKind>('openai-compatible');
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelContextLengths, setModelContextLengths] = useState<Record<string, number>>({});
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isResolvingContextLength, setIsResolvingContextLength] = useState(false);
  const modelInputContainerRef = useRef<HTMLDivElement>(null);
  const submitTokenRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    submitTokenRef.current += 1;
    if (!isOpen) return;
    setKind(provider?.kind ?? 'openai-compatible');
    setName(provider?.name ?? '');
    setModelId(provider?.modelId ?? '');
    setApiKey(provider?.apiKey ?? '');
    setBaseURL(provider?.baseURL ?? '');
    setModelOptions([]);
    setModelContextLengths({});
    setModelDropdownOpen(false);
    setIsLoadingModels(false);
    setIsResolvingContextLength(false);
  }, [isOpen, provider]);

  useEffect(() => {
    if (!isOpen) return;

    const clearModels = () => {
      setModelOptions([]);
      setModelContextLengths({});
      setModelDropdownOpen(false);
      setIsLoadingModels(false);
    };

    const trimmedApiKey = apiKey.trim();
    const trimmedBaseURL = baseURL.trim();
    if (!trimmedApiKey && !trimmedBaseURL) {
      clearModels();
      return;
    }
    if (trimmedBaseURL && !isValidProviderBaseURL(baseURL)) {
      clearModels();
      return;
    }

    let cancelled = false;
    setModelOptions([]);
    setModelContextLengths({});
    setModelDropdownOpen(false);
    setIsLoadingModels(true);

    const timer = window.setTimeout(() => {
      void fetchProviderModelCatalog({
        kind,
        apiKey: trimmedApiKey,
        baseURL: normalizeProviderBaseURL(kind, baseURL)
      })
        .then((catalog) => {
          if (!cancelled) {
            setModelOptions(catalog.models);
            setModelContextLengths(catalog.contextLengths);
            setIsLoadingModels(false);
          }
        })
        .catch(() => {
          if (!cancelled) clearModels();
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, baseURL, isOpen, kind]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (event: MouseEvent) => {
      if (
        modelInputContainerRef.current &&
        !modelInputContainerRef.current.contains(event.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

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
  const filteredModelOptions = useMemo(() => {
    const normalizedModelId = modelId.trim().toLowerCase();
    if (!normalizedModelId) return modelOptions;
    const filtered = modelOptions.filter((model) =>
      model.toLowerCase().includes(normalizedModelId)
    );
    return filtered.length > 0 ? filtered : modelOptions;
  }, [modelId, modelOptions]);

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
  };

  const fetchContextLengthForModel = async (targetModelId: string): Promise<number | undefined> => {
    const trimmedApiKey = apiKey.trim();
    const normalizedBaseURL = normalizeProviderBaseURL(kind, baseURL);
    if (!trimmedApiKey && !normalizedBaseURL) return undefined;
    try {
      const catalog = await fetchProviderModelCatalog({
        kind,
        apiKey: trimmedApiKey,
        baseURL: normalizedBaseURL
      });
      return lookupModelContextLength(catalog.contextLengths, targetModelId);
    } catch {
      return undefined;
    }
  };

  const resolveContextLengthForSubmit = async (
    trimmedModelId: string,
    submitToken: number
  ): Promise<number | undefined> => {
    if (!trimmedModelId) return undefined;
    const alreadyDetected = lookupModelContextLength(modelContextLengths, trimmedModelId);
    if (alreadyDetected) return alreadyDetected;

    setIsResolvingContextLength(true);
    try {
      const fetched = await fetchContextLengthForModel(trimmedModelId);
      if (fetched) return fetched;
      const builtInContextLength = getConfiguredModelContextLength(trimmedModelId);
      const isSameModelAsExisting = provider?.modelId?.trim() === trimmedModelId;
      const existingContextLength =
        typeof provider?.contextLength === 'number' && provider.contextLength > 0
          ? provider.contextLength
          : undefined;
      if (
        isSameModelAsExisting &&
        existingContextLength &&
        (!builtInContextLength || existingContextLength !== DEFAULT_CONTEXT_LENGTH)
      ) {
        return existingContextLength;
      }
      if (builtInContextLength) return undefined;
      return DEFAULT_CONTEXT_LENGTH;
    } finally {
      if (submitTokenRef.current === submitToken && isOpenRef.current) {
        setIsResolvingContextLength(false);
      }
    }
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
    const contextLength = await resolveContextLengthForSubmit(trimmedModelId, submitToken);
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
              setBaseURL((current) => {
                const trimmed = current.trim();
                if (!trimmed) return '';
                if (!isValidProviderBaseURL(trimmed)) return trimmed;
                return normalizeProviderBaseURL(next, trimmed);
              });
              setModelOptions([]);
              setModelDropdownOpen(false);
              setIsLoadingModels(false);
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
            onChange={(event) => setBaseURL(event.target.value)}
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
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={handleCancel}>
          <FormattedMessage id="cancel" defaultMessage="取消" />
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={submitDisabled || hasInvalidBaseURL || isResolvingContextLength}
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
