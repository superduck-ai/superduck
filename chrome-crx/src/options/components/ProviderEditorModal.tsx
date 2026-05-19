import React, { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, Modal, ModalFooter, SimpleSelect, TextInput } from '@/components/ui';
import {
  DEFAULT_BASE_URL,
  PROVIDER_KIND_LABEL,
  newProviderId,
  normalizeProviderBaseURL,
  type AiProvider,
  type ProviderKind
} from '@/utils/providerStore';

const KIND_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI Chat' },
  { value: 'openai-compatible', label: 'OpenAI Responses' }
];

export interface ProviderEditorValue {
  id: string;
  kind: ProviderKind;
  name: string;
  modelId: string;
  apiKey: string;
  baseURL: string;
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

  useEffect(() => {
    if (!isOpen) return;
    setKind(provider?.kind ?? 'openai-compatible');
    setName(provider?.name ?? '');
    setModelId(provider?.modelId ?? '');
    setApiKey(provider?.apiKey ?? '');
    setBaseURL(provider?.baseURL ?? '');
  }, [isOpen, provider]);

  const placeholderBaseURL = useMemo(() => DEFAULT_BASE_URL[kind] || 'https://your-gateway.com', [kind]);
  const placeholderName = useMemo(() => {
    if (isEditing) return name;
    return PROVIDER_KIND_LABEL[kind];
  }, [isEditing, kind, name]);

  const submitDisabled = !name.trim() && !PROVIDER_KIND_LABEL[kind];

  const handleSubmit = () => {
    onSave({
      id: provider?.id ?? newProviderId(),
      kind,
      name: name.trim() || PROVIDER_KIND_LABEL[kind],
      modelId: modelId.trim(),
      apiKey: apiKey.trim(),
      baseURL: normalizeProviderBaseURL(kind, baseURL)
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
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
              setBaseURL((current) => normalizeProviderBaseURL(next, current));
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
            onBlur={() => setBaseURL((current) => normalizeProviderBaseURL(kind, current))}
            placeholder={`默认: ${placeholderBaseURL}`}
          />
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
          <TextInput
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            placeholder={intl.formatMessage({
              id: 'model_id_placeholder',
              defaultMessage: '例如 claude-opus-4-6 / gpt-4o / qwen2.5:7b'
            })}
          />
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onCancel}>
          <FormattedMessage id="cancel" defaultMessage="取消" />
        </Button>
        <Button onClick={handleSubmit} disabled={submitDisabled}>
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
