import type React from 'react';
import { cn } from '@/lib/utils';
import { WarningIcon } from './icons';

export function ErrorMessage({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-1', className)}>
      <WarningIcon className="text-danger-000 mt-1 shrink-0" size={16} />
      <p className="text-danger-000 text-sm">{children}</p>
    </div>
  );
}
