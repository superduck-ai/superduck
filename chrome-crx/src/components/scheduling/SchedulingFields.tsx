import React from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { DatePicker, ErrorMessage, SimpleSelect, TextInput, TimeInput, cn } from '@/components/ui';
import { isChineseLocale } from '@/utils/locale';

function getOrdinalLabel(value: number, locale: string): string {
  if (isChineseLocale(locale)) return `${value}号`;
  if (value === 1 || value === 21 || value === 31) return `${value}st`;
  if (value === 2 || value === 22) return `${value}nd`;
  if (value === 3 || value === 23) return `${value}rd`;
  return `${value}th`;
}

interface SchedulingFieldsProps {
  scheduleEnabled: boolean;
  setScheduleEnabled: (value: boolean) => void;
  repeatType: string;
  setRepeatType: (value: string) => void;
  specificDate: string;
  setSpecificDate: (value: string) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  dayOfMonth: number;
  setDayOfMonth: (value: number) => void;
  month: number;
  setMonth: (value: number) => void;
  day: number;
  setDay: (value: number) => void;
  specificTime: string;
  setSpecificTime: (value: string) => void;
  monthLabels: string[];
  daysOfWeekLabels: string[];
  url: string;
  setUrl: (value: string) => void;
  urlError?: string;
  selectedModel?: string;
  onModelChange?: (value: string) => void;
  availableModels?: SchedulingModelOption[];
  compact?: boolean;
  model?: string;
  setModel?: (value: string) => void;
  modelConfig?: SchedulingModelConfig;
}

type SchedulingModelOption =
  | string
  | {
  model?: string;
  value?: string;
  name?: string;
  label?: string;
};

interface SchedulingModelConfig {
  options?: SchedulingModelOption[];
}

function SchedulingFields({
  scheduleEnabled,
  setScheduleEnabled,
  repeatType,
  setRepeatType,
  specificDate,
  setSpecificDate,
  dayOfWeek,
  setDayOfWeek,
  dayOfMonth,
  setDayOfMonth,
  month,
  setMonth,
  day,
  setDay,
  specificTime,
  setSpecificTime,
  monthLabels,
  daysOfWeekLabels,
  url,
  setUrl,
  urlError,
  selectedModel,
  onModelChange,
  availableModels,
  compact,
  model,
  setModel,
  modelConfig
}: SchedulingFieldsProps) {
  const intl = useIntl();

  const repeatOptions = [
    { value: 'once', label: intl.formatMessage({ defaultMessage: 'Once', id: 'once' }) },
    { value: 'daily', label: intl.formatMessage({ defaultMessage: 'Daily', id: 'daily' }) },
    { value: 'weekly', label: intl.formatMessage({ defaultMessage: 'Weekly', id: 'weekly' }) },
    { value: 'monthly', label: intl.formatMessage({ defaultMessage: 'Monthly', id: 'monthly' }) },
    { value: 'annually', label: intl.formatMessage({ defaultMessage: 'Annually', id: 'annually' }) }
  ];

  const dayOfMonthOptions = Array.from({ length: 31 }, (_, index) => index + 1).map((value) => ({
    value: String(value),
    label: getOrdinalLabel(value, intl.locale)
  }));

  const resolvedModel = selectedModel ?? model;
  const resolvedOnModelChange = onModelChange ?? setModel;
  const resolvedModels = availableModels ?? modelConfig?.options;

  const renderUrlField = () => (
    <div>
      <span className="font-base text-text-200 block mb-1">
        <FormattedMessage defaultMessage="Start from" id="start_from" />
      </span>
      <TextInput
        type="text"
        value={url}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
        placeholder={intl.formatMessage({
          defaultMessage: 'https://example.com',
          id: 'url_placeholder'
        })}
        className="w-full text-sm"
        error={!!urlError}
      />
      {urlError && <ErrorMessage className="mt-1">{urlError}</ErrorMessage>}
    </div>
  );

  const renderScheduleToggle = () => (
    <div className="flex items-center justify-between">
      <span className="font-base text-text-200">
        <FormattedMessage defaultMessage="Schedule" id="schedule" />
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={scheduleEnabled}
        onClick={() => setScheduleEnabled(!scheduleEnabled)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out can-focus',
          scheduleEnabled ? 'bg-accent-secondary-100' : 'bg-bg-400'
        )}
      >
        <span
          className="pointer-events-none absolute rounded-full bg-bg-000 shadow-sm ring-0 transition-transform duration-200 ease-in-out"
          style={{
            top: '2px',
            left: '2px',
            width: '16px',
            height: '16px',
            transform: scheduleEnabled ? 'translateX(16px)' : 'translateX(0)'
          }}
        />
      </button>
    </div>
  );

  const renderModelField = () => {
    if (!resolvedOnModelChange || !resolvedModel || !resolvedModels) return null;
    return (
      <div>
        <span className="font-base text-text-200 block mb-1">
          <FormattedMessage defaultMessage="Model" id="model" />
        </span>
        <SimpleSelect
          value={resolvedModel}
          onChange={resolvedOnModelChange}
          options={resolvedModels
            .map((modelOption) => ({
              value:
                typeof modelOption === 'string'
                  ? modelOption
                  : modelOption.model ?? modelOption.value,
              label:
                typeof modelOption === 'string'
                  ? modelOption
                  : modelOption.name ?? modelOption.label
            }))
            .filter(
              (
                modelOption
              ): modelOption is {
                value: string;
                label: string;
              } => typeof modelOption.value === 'string' && typeof modelOption.label === 'string'
            )}
          placeholder={intl.formatMessage({
            defaultMessage: 'Select model',
            id: 'select_model'
          })}
        />
      </div>
    );
  };

  const renderScheduleFields = () => (
    <div className="flex gap-2 items-end flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <SimpleSelect value={repeatType || 'once'} onChange={setRepeatType} options={repeatOptions} />
      </div>
      {repeatType === 'once' && (
        <div className="flex-1 min-w-[140px]">
          <DatePicker
            value={specificDate}
            onChange={setSpecificDate}
            minDate={new Date(Date.now() - 864e5)}
          />
        </div>
      )}
      {repeatType === 'weekly' && (
        <div className="flex-1 min-w-[140px]">
          <SimpleSelect
            value={dayOfWeek.toString()}
            onChange={(value) => setDayOfWeek(parseInt(value, 10))}
            options={daysOfWeekLabels.map((label, index) => ({
              value: index.toString(),
              label
            }))}
          />
        </div>
      )}
      {repeatType === 'monthly' && (
        <div className="flex-1 min-w-[140px]">
          <SimpleSelect
            value={dayOfMonth.toString()}
            onChange={(value) => setDayOfMonth(parseInt(value, 10))}
            options={dayOfMonthOptions}
          />
        </div>
      )}
      {repeatType === 'annually' && (
        <>
          <div className="flex-1 min-w-[140px]">
            <SimpleSelect
              value={month.toString()}
              onChange={(value) => setMonth(parseInt(value, 10))}
              options={monthLabels.map((label, index) => ({
                value: (index + 1).toString(),
                label
              }))}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <SimpleSelect
              value={day.toString()}
              onChange={(value) => setDay(parseInt(value, 10))}
              options={dayOfMonthOptions}
            />
          </div>
        </>
      )}
      <div className="flex-1 min-w-[140px]">
        <TimeInput value={specificTime} onChange={setSpecificTime} />
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {scheduleEnabled && renderScheduleFields()}
        {scheduleEnabled && renderModelField()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderUrlField()}
      {renderScheduleToggle()}
      {scheduleEnabled && renderScheduleFields()}
      {scheduleEnabled && renderModelField()}
    </div>
  );
}

export { SchedulingFields };
