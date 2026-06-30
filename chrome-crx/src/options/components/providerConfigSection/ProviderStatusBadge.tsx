import React from 'react';
import { FormattedMessage } from 'react-intl';
import { type AiProvider } from '@/utils/providerStore';
import { AlertCircleIcon, CheckCircleIcon, SpinnerIcon } from './icons';

export const ProviderStatusBadge: React.FC<{
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
