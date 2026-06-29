import React, { useEffect, useRef, useState } from 'react';
import { createLucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const CheckIcon = createLucideIcon('check', [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]);

const ChevronDownIcon = createLucideIcon('chevron-down', [
  ['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]
]);

export interface SimpleSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handler);
    }

    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div className={className}>
      {label && <label className="block font-base text-text-200 mb-1">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (disabled) return;
            if (buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = Math.min(240, 40 * options.length + 16);
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen((open) => !open);
          }}
          disabled={disabled}
          className={cn(
            'w-full h-9 px-3 py-2 text-left border border-border-300 rounded-lg bg-bg-000 text-text-100 text-sm flex items-center justify-between transition-colors can-focus',
            !disabled && 'hover:border-border-200 cursor-pointer',
            isOpen && 'border-border-200',
            disabled && 'opacity-50 cursor-not-allowed bg-bg-100'
          )}
        >
          <span className="flex items-center gap-2">
            {selected?.icon}
            <span className={selected || placeholder ? '' : 'text-text-400'}>
              {selected?.label || placeholder}
            </span>
          </span>
          <ChevronDownIcon size={16} className="text-text-400" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown w-full bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5 max-h-60 overflow-auto',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-2 py-2 text-left rounded-md transition-colors hover:bg-bg-200 flex items-center justify-between font-base'
                )}
              >
                <span className="flex items-center gap-2">
                  {option.icon}
                  <span className="text-text-100">{option.label}</span>
                </span>
                {value === option.value && (
                  <CheckIcon size={16} className="text-accent-secondary-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
