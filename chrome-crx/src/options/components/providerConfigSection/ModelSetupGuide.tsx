import React from 'react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@/components/ui';
import { AlertCircleIcon, PlusIcon } from './icons';

interface ModelSetupGuideProps {
  onAddProvider: () => void;
}

export const ModelSetupGuide: React.FC<ModelSetupGuideProps> = ({ onAddProvider }) => (
  <div className="mb-4 rounded-md border border-border bg-muted/20 px-4 py-4">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <AlertCircleIcon size={14} />
          <FormattedMessage id="setup_required" defaultMessage="首次使用必需" />
        </div>
        <h4 className="text-sm font-medium text-foreground">
          <FormattedMessage
            id="setup_model_before_use"
            defaultMessage="开始使用前，先连接一个大模型"
          />
        </h4>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          <FormattedMessage
            id="setup_model_guide_description"
            defaultMessage="SuperDuck 需要一个可用模型来理解页面并执行任务。提交后会自动保存，API Key 仅保存在 Chrome 本地。"
          />
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAddProvider}>
        <PlusIcon data-icon="inline-start" size={14} />
        <FormattedMessage id="setup_guide_add_model" defaultMessage="添加模型" />
      </Button>
    </div>

    <ol className="mt-4 flex flex-col gap-2">
      <ModelSetupStep>
        <FormattedMessage id="setup_step_add_provider" defaultMessage="添加模型供应商" />
      </ModelSetupStep>
      <ModelSetupStep>
        <FormattedMessage
          id="setup_step_complete_provider"
          defaultMessage="填写 API Key 和模型 ID，提交后自动保存"
        />
      </ModelSetupStep>
    </ol>
  </div>
);

const ModelSetupStep: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex min-w-0 items-center gap-2 text-sm">
    <span className="h-4 w-4 shrink-0 rounded-full border border-border bg-background" />
    <span className="text-sm text-muted-foreground">{children}</span>
  </li>
);
