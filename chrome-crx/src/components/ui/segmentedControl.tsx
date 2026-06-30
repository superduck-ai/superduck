import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption {
  key: string;
  label: string;
  ariaLabel?: string;
}

export const SegmentedControl: React.FC<{
  options: SegmentedControlOption[];
  onSelect?: (key: string) => void;
  initialKey?: string;
  selectedKey?: string;
  testId?: string;
  className?: string;
  itemClassName?: string;
  renderItem?: (
    element: React.ReactNode,
    option: SegmentedControlOption,
    state: { isSelected: boolean }
  ) => React.ReactNode;
  disabled?: boolean;
  rounded?: 'default' | 'full';
}> = ({
  options,
  onSelect,
  initialKey,
  selectedKey,
  testId,
  className,
  itemClassName,
  renderItem,
  disabled,
  rounded = 'default',
  ...rest
}) => {
  const isControlled = selectedKey !== undefined;
  const [internalKey, setInternalKey] = useState(initialKey);
  const bgRef = useRef<HTMLDivElement>(null);
  const [hasTransition, setHasTransition] = useState(false);
  const initialized = useRef(false);
  const activeKey = isControlled ? selectedKey : internalKey;

  useEffect(() => {
    const bg = bgRef.current;
    const parent = bg?.parentElement;
    if (!bg || !parent) return;
    const parentStyle = window.getComputedStyle(parent);
    const paddingLeft = parseFloat(parentStyle.paddingLeft);
    const borderRadius = parseFloat(parentStyle.borderRadius);
    const innerRadius = Math.max(0, borderRadius - paddingLeft);

    if (!activeKey) {
      bg.style.clipPath = `rect(0% ${2 * innerRadius}px 100% 0% round ${innerRadius}px)`;
      return;
    }

    const index = options.findIndex((option) => option.key === activeKey);
    const child = bg.children[index] as HTMLElement;
    if (!child) return;
    const totalWidth = bg.offsetWidth;
    if (totalWidth <= 0) return;

    const left = child.offsetLeft;
    const right = child.offsetLeft + child.offsetWidth;
    const clipRight = index === options.length - 1 ? 0 : 100 - (right / totalWidth) * 100;
    const clipLeft = index === 0 ? 0 : (left / totalWidth) * 100;
    bg.style.clipPath = `inset(0 ${clipRight > 0 ? clipRight : 0}% 0 ${clipLeft > 0 ? clipLeft : 0}% round ${innerRadius}px)`;

    if (!initialized.current) {
      initialized.current = true;
      requestAnimationFrame(() => setHasTransition(true));
    }
  }, [activeKey, options]);

  const itemClass = 'flex items-center justify-center h-[28px] min-w-7 gap-1.5 px-3 rounded-lg';
  const roundedClass = useMemo(
    () => (rounded === 'full' ? 'rounded-full' : 'rounded-[.625rem]'),
    [rounded]
  );

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={activeKey}
      className={cn(
        'group/segmented-control relative inline-flex w-fit h-8 text-sm font-medium bg-bg-300 p-0.5 cursor-pointer select-none',
        className,
        roundedClass
      )}
      disabled={disabled}
      onValueChange={(value) => {
        if (value !== '') {
          setInternalKey(value);
          onSelect?.(value);
        }
      }}
      {...rest}
    >
      {options.map((option) => {
        const isSelected = activeKey === option.key;
        const item = (
          <ToggleGroupPrimitive.Item
            key={option.key}
            value={option.key}
            aria-label={option.ariaLabel}
            className={cn(
              itemClass,
              "text-text-500 hover:text-text-300 data-[state='on']:text-text-100 transition-colors duration-[250ms] motion-reduce:duration-0",
              itemClassName
            )}
            data-testid={testId ? `${testId}-${option.key}` : undefined}
          >
            {option.label}
          </ToggleGroupPrimitive.Item>
        );

        return renderItem ? renderItem(item, option, { isSelected }) : item;
      })}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 p-0.5 transition-[opacity] duration-[250ms]',
          !activeKey && 'opacity-0',
          roundedClass
        )}
        style={{ filter: 'drop-shadow(0px 0px 0.5px hsl(var(--border-300)/30%))' }}
      >
        <div
          ref={bgRef}
          className={cn(
            'relative flex bg-bg-000',
            hasTransition && 'transition-[clip-path] duration-[250ms] motion-reduce:duration-0 ease'
          )}
          style={{ clipPath: 'rect(0% 0% 100% 0%)' }}
        >
          {options.map((option) => (
            <div key={option.key} className={cn(itemClass, 'text-transparent')} aria-hidden>
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </ToggleGroupPrimitive.Root>
  );
};
