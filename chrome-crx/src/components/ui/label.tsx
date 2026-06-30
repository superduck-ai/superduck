import React, { forwardRef, useMemo } from 'react';
import _ from 'lodash';
import { cn } from '@/lib/utils';

export const Label = forwardRef<
  HTMLLabelElement,
  { label?: React.ReactNode; id?: string; className?: string }
>(({ label, id, className }, ref) =>
  label ? (
    <label htmlFor={id} className={cn('text-text-200 mb-1 block font-base', className)} ref={ref}>
      {label}
    </label>
  ) : null
);
Label.displayName = 'Label';

export function useGeneratedId({ id, label }: { id?: string; label?: React.ReactNode }) {
  return useMemo(
    () =>
      id ||
      (label && typeof label === 'string' ? _.uniqueId(`${_.camelCase(label)}_`) : _.uniqueId()),
    [label, id]
  );
}
