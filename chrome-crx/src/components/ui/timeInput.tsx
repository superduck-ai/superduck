import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';
import { isChineseLocale } from '@/utils/locale';

function isValidTime(value: string): boolean {
  return /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(value);
}

function parseTimeInput(input: string): string | null {
  const trimmed = input.trim();
  if (isValidTime(trimmed)) {
    const [hours, minutes] = trimmed.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }

  const normalized = trimmed
    .replace(/上午/g, 'AM ')
    .replace(/下午/g, 'PM ')
    .replace(/中午/g, 'PM ')
    .replace(/凌晨/g, 'AM ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalized.match(/^(?:(am|pm|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm|AM|PM))?$/);
  if (!match) return null;

  const prefixPeriod = match[1];
  const suffixPeriod = match[4];
  let hours = parseInt(match[2], 10);
  const minutes = match[3];
  const period = (prefixPeriod || suffixPeriod)?.toUpperCase();

  if (!period) return null;
  if (hours < 1 || hours > 12 || parseInt(minutes, 10) > 59) return null;

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

function formatTime12h(value: string): string {
  if (!isValidTime(value)) return value;
  const [hoursValue, minutes] = value.split(':');
  const hours = parseInt(hoursValue, 10);
  return `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

function formatTimeForLocale(value: string, locale?: string): string {
  if (!isValidTime(value)) return value;
  if (isChineseLocale(locale)) return value;
  return formatTime12h(value);
}

export function TimeInput({
  value,
  onChange,
  label,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const intl = useIntl();
  const isChinese = isChineseLocale(intl.locale);
  const [display, setDisplay] = useState(formatTimeForLocale(value, intl.locale));
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let hours = 0; hours < 24; hours++) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        const nextValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        options.push({
          value: nextValue,
          label: isChinese ? nextValue : formatTime12h(nextValue)
        });
      }
    }
    return options;
  }, [isChinese]);

  useEffect(() => {
    setDisplay(formatTimeForLocale(value, intl.locale));
    setError(null);
  }, [value, intl.locale]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updatePosition = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuHeight = Math.min(192, 40 * timeOptions.length + 16);
    setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
  };

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setDisplay(nextValue);
      setError(null);
      const parsed = parseTimeInput(nextValue);
      if (parsed) {
        onChange(parsed);
      }
    },
    [onChange]
  );

  const handleBlur = useCallback(() => {
    const parsed = parseTimeInput(display);
    if (parsed) {
      setDisplay(formatTimeForLocale(parsed, intl.locale));
      onChange(parsed);
      setError(null);
      return;
    }
    if (display.trim() !== '') {
      setError(intl.formatMessage({ defaultMessage: 'Invalid time format', id: '/6iExgDC34' }));
      setDisplay(formatTimeForLocale(value, intl.locale));
    }
  }, [display, intl, onChange, value]);

  const selectTime = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setDisplay(formatTimeForLocale(nextValue, intl.locale));
      setIsOpen(false);
      setError(null);
    },
    [intl.locale, onChange]
  );

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block font-ui-serif text-sm font-semibold text-text-200 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={display}
          onChange={handleInputChange}
          onFocus={() => {
            updatePosition();
            setIsOpen(true);
          }}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleBlur();
              setIsOpen(false);
            } else if (event.key === 'Escape') {
              setIsOpen(false);
              setDisplay(formatTimeForLocale(value, intl.locale));
              setError(null);
            } else if (event.key === 'ArrowDown' && !isOpen) {
              setIsOpen(true);
            }
          }}
          lang={intl.locale}
          placeholder={intl.formatMessage({
            defaultMessage: 'e.g., 9:30 AM or 14:00',
            id: 'time_input_placeholder'
          })}
          className={cn(
            'w-full h-9 px-3 pr-10 py-2 border rounded-lg bg-bg-000 text-text-100 text-sm transition-colors can-focus hover:border-border-200',
            error ? 'border-danger-100' : 'border-border-300'
          )}
        />
        <button
          type="button"
          onClick={() => {
            updatePosition();
            setIsOpen((open) => !open);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-300 hover:text-text-100"
          tabIndex={-1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {error && <p className="text-xs text-danger-100 mt-1">{error}</p>}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-dropdown w-full max-h-48 overflow-auto bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] dark:shadow-[0px_2px_8px_0px_hsl(var(--always-black)/24%)] p-1.5',
            position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
          )}
        >
          {timeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTime(option.value);
              }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-md transition-colors hover:bg-bg-200 text-sm',
                option.value === value ? 'bg-bg-200 text-text-100' : 'text-text-100'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
