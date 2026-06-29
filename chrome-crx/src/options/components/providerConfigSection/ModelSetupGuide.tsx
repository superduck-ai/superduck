import React from 'react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@/components/ui';
import { type AiProvider, type ProviderConfig } from '@/utils/providerStore';
import { getFirstUsableProvider, isProviderConfigUsable } from '@/utils/providerConfigStatus';
import { AlertCircleIcon, CheckCircleIcon, PlusIcon } from './icons';

interface ModelSetupGuideProps {
  config: ProviderConfig;
  isDirty: boolean;
  isSaving: boolean;
  onAddProvider: () => void;
  onEditProvider: (provider: AiProvider) => void;
  onSave: () => void;
}

export const ModelSetupGuide: React.FC<ModelSetupGuideProps> = ({
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
