import React, { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import Calendar from 'react-calendar';
import { cn } from '@/lib/utils';
import { formatLocalDateString, parseLocalDateString } from '@/utils/date';
import { isChineseLocale } from '@/utils/locale';
import { CalendarIcon } from './icons';

export function DatePicker({
  value,
  onChange,
  label,
  className,
  minDate
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  minDate?: Date;
}) {
  type CalendarOnChangeValue = Parameters<
    NonNullable<React.ComponentProps<typeof Calendar>['onChange']>
  >[0];
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dateValue = value ? parseLocalDateString(value) : null;

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

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return '';
    const date = parseLocalDateString(dateString);
    return date.toLocaleDateString(intl.locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>}
      <div ref={containerRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              const spaceAbove = rect.top;
              const menuHeight = 320;
              setPosition(spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
            }
            setIsOpen((open) => !open);
          }}
          className={cn(
            'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-foreground shadow-xs transition-colors can-focus hover:border-ring/50',
            isOpen && 'border-ring ring-2 ring-ring/30'
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
              value ? '' : 'text-muted-foreground'
            )}
          >
            {value
              ? formatDisplayDate(value)
              : intl.formatMessage({ defaultMessage: 'Select date', id: 'select_date' })}
          </span>
          <CalendarIcon size={16} className="shrink-0 text-muted-foreground" />
        </button>
        {isOpen && (
          <div
            className={cn(
              'absolute z-dropdown min-w-[280px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md',
              position === 'bottom' ? 'mt-1 top-full' : 'mb-1 bottom-full'
            )}
          >
            <Calendar
              value={dateValue}
              onChange={(date: CalendarOnChangeValue) => {
                if (date instanceof Date) {
                  onChange(formatLocalDateString(date));
                  setIsOpen(false);
                }
              }}
              minDate={minDate}
              locale={intl.locale}
              className="datetime-input-calendar"
              formatDay={(_, date) => date.getDate().toString()}
              formatShortWeekday={(locale, date) => {
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                const weekdaysEn = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
                return isChineseLocale(locale)
                  ? weekdays[date.getDay()]
                  : weekdaysEn[date.getDay()];
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
