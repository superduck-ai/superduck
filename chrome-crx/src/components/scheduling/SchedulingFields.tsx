import React from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  DatePicker,
  ErrorMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TimeInput
} from '@/components/ui';
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
  const modelSelectId = React.useId();

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

  const renderSelect = ({
    value,
    onChange,
    options,
    placeholder,
    triggerId
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    triggerId?: string;
  }) => (
    <Select
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onChange(nextValue);
      }}
    >
      <SelectTrigger id={triggerId} className="w-full rounded-md">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        side="bottom"
        align="start"
        alignItemWithTrigger={false}
        collisionAvoidance={{ side: 'none', align: 'shift', fallbackAxisSide: 'none' }}
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderUrlField = () => (
    <div>
      <Label className="mb-1.5">
        <FormattedMessage defaultMessage="Start from" id="start_from" />
      </Label>
      <Input
        type="text"
        value={url}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
        placeholder={intl.formatMessage({
          defaultMessage: 'https://example.com',
          id: 'url_placeholder'
        })}
        className="w-full rounded-md text-sm"
        aria-invalid={!!urlError}
      />
      {urlError && <ErrorMessage className="mt-1">{urlError}</ErrorMessage>}
    </div>
  );

  const renderScheduleToggle = () => (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium leading-5 text-foreground">
          <FormattedMessage defaultMessage="Schedule" id="schedule" />
        </div>
        <p className="text-sm leading-5 text-muted-foreground">
          <FormattedMessage
            defaultMessage="Run this shortcut automatically at the selected time."
            id="schedule_toggle_description"
          />
        </p>
      </div>
      <div className="shrink-0">
        <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
      </div>
    </div>
  );

  const renderModelField = () => {
    if (!resolvedOnModelChange || !resolvedModel || !resolvedModels) return null;
    const options = resolvedModels
      .map((modelOption) => ({
        value:
          typeof modelOption === 'string' ? modelOption : (modelOption.model ?? modelOption.value),
        label:
          typeof modelOption === 'string' ? modelOption : (modelOption.name ?? modelOption.label)
      }))
      .filter(
        (
          modelOption
        ): modelOption is {
          value: string;
          label: string;
        } => typeof modelOption.value === 'string' && typeof modelOption.label === 'string'
      );

    return (
      <div>
        <Label htmlFor={modelSelectId} className="mb-1.5">
          <FormattedMessage defaultMessage="Model" id="model" />
        </Label>
        {renderSelect({
          value: resolvedModel,
          onChange: resolvedOnModelChange,
          options,
          placeholder: intl.formatMessage({
            defaultMessage: 'Select model',
            id: 'select_model'
          }),
          triggerId: modelSelectId
        })}
      </div>
    );
  };

  const renderScheduleFields = () => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        {renderSelect({
          value: repeatType || 'once',
          onChange: setRepeatType,
          options: repeatOptions
        })}
      </div>
      {repeatType === 'once' && (
        <div>
          <DatePicker
            value={specificDate}
            onChange={setSpecificDate}
            minDate={new Date(Date.now() - 864e5)}
          />
        </div>
      )}
      {repeatType === 'weekly' && (
        <div>
          {renderSelect({
            value: dayOfWeek.toString(),
            onChange: (value) => setDayOfWeek(parseInt(value, 10)),
            options: daysOfWeekLabels.map((label, index) => ({
              value: index.toString(),
              label
            }))
          })}
        </div>
      )}
      {repeatType === 'monthly' && (
        <div>
          {renderSelect({
            value: dayOfMonth.toString(),
            onChange: (value) => setDayOfMonth(parseInt(value, 10)),
            options: dayOfMonthOptions
          })}
        </div>
      )}
      {repeatType === 'annually' && (
        <>
          <div>
            {renderSelect({
              value: month.toString(),
              onChange: (value) => setMonth(parseInt(value, 10)),
              options: monthLabels.map((label, index) => ({
                value: (index + 1).toString(),
                label
              }))
            })}
          </div>
          <div>
            {renderSelect({
              value: day.toString(),
              onChange: (value) => setDay(parseInt(value, 10)),
              options: dayOfMonthOptions
            })}
          </div>
        </>
      )}
      <div>
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
    <div className="space-y-3 border-t border-border pt-3">
      {renderUrlField()}
      {renderScheduleToggle()}
      {scheduleEnabled && renderScheduleFields()}
      {scheduleEnabled && renderModelField()}
    </div>
  );
}

export { SchedulingFields };
