import React from 'react';
import { FormattedMessage } from 'react-intl';
import { Badge } from '@/components/ui';
import { type AiProvider } from '@/utils/providerStore';
import { AlertCircleIcon, CheckCircleIcon, SpinnerIcon } from './icons';

export const ProviderStatusBadge: React.FC<{
  status: AiProvider['status'];
  message?: string;
}> = ({ status, message }) => {
  if (status === 'testing') {
    return (
      <Badge variant="outline" className="border-border bg-muted/60 text-muted-foreground">
        <SpinnerIcon size={12} className="animate-spin" />
        <FormattedMessage id="testing" defaultMessage="测试中" />
      </Badge>
    );
  }
  if (status === 'active') {
    return (
      <Badge
        variant="outline"
        className="border-success/20 bg-success/5 text-success dark:border-success/30 dark:bg-success/10"
      >
        <CheckCircleIcon size={12} />
        <FormattedMessage id="active" defaultMessage="正常" />
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" title={message}>
        <AlertCircleIcon size={12} />
        <FormattedMessage id="error" defaultMessage="错误" />
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-border bg-muted/60 text-muted-foreground">
      <FormattedMessage id="not_tested" defaultMessage="未测试" />
    </Badge>
  );
};
