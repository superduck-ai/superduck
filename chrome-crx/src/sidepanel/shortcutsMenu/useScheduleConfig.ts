import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IntlShape } from 'react-intl';
import { buildScheduleConfig, type ScheduleConfig } from './createShortcutHelpers';
import {
  ensureSelectedSchedulingProviderOption,
  loadSchedulingProviderChoices,
  type SchedulingProviderOption
} from '../../components/scheduling/providerModelOptions';

export interface ScheduleConfigInitial {
  repeatType?: string;
  specificTime?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
  specificDate?: string;
  model?: string;
}

export interface UseScheduleConfigOptions {
  initialSchedule: ScheduleConfigInitial;
  currentModel: string;
  intl: IntlShape;
}

export interface UseScheduleConfigReturn {
  scheduleEnabled: boolean;
  setScheduleEnabled: (value: boolean) => void;
  repeatType: string;
  setRepeatType: (value: string) => void;
  specificTime: string;
  setSpecificTime: (value: string) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  dayOfMonth: number;
  setDayOfMonth: (value: number) => void;
  month: number;
  setMonth: (value: number) => void;
  day: number;
  setDay: (value: number) => void;
  specificDate: string;
  setSpecificDate: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  providerModelOptions: SchedulingProviderOption[];
  monthLabels: string[];
  daysOfWeekLabels: string[];
  schedulingModelOptions: SchedulingProviderOption[];
  buildConfig: () => ScheduleConfig | null;
}

export function useScheduleConfig({
  initialSchedule,
  currentModel,
  intl
}: UseScheduleConfigOptions): UseScheduleConfigReturn {
  const [scheduleEnabled, setScheduleEnabled] = useState(
    Boolean(initialSchedule.repeatType && initialSchedule.repeatType !== 'none')
  );
  const [repeatType, setRepeatType] = useState<string>(
    initialSchedule.repeatType && initialSchedule.repeatType !== 'none'
      ? initialSchedule.repeatType
      : 'once'
  );
  const [specificTime, setSpecificTime] = useState(initialSchedule.specificTime || '09:00');
  const [dayOfWeek, setDayOfWeek] = useState(initialSchedule.dayOfWeek ?? 0);
  const [dayOfMonth, setDayOfMonth] = useState(initialSchedule.dayOfMonth || 1);
  const [month, setMonth] = useState(
    initialSchedule.monthAndDay ? parseInt(initialSchedule.monthAndDay.split('-')[0]) : 1
  );
  const [day, setDay] = useState(
    initialSchedule.monthAndDay ? parseInt(initialSchedule.monthAndDay.split('-')[1]) : 1
  );
  const [specificDate, setSpecificDate] = useState(initialSchedule.specificDate || '');
  const [model, setModel] = useState(initialSchedule.model || currentModel || '');
  const [providerModelOptions, setProviderModelOptions] = useState<SchedulingProviderOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadSchedulingProviderChoices().then(({ defaultProviderId, options }) => {
      if (cancelled) return;
      setProviderModelOptions(options);
      setModel((current) => current || currentModel || defaultProviderId);
    });
    return () => {
      cancelled = true;
    };
  }, [currentModel]);

  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        intl.formatDate(new Date(2020, index, 1), { month: 'long' })
      ),
    [intl]
  );
  const daysOfWeekLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        intl.formatDate(new Date(2020, 5, 7 + index), { weekday: 'long' })
      ),
    [intl]
  );
  const schedulingModelOptions = useMemo(
    () => ensureSelectedSchedulingProviderOption(providerModelOptions, model),
    [providerModelOptions, model]
  );

  const buildConfig = useCallback((): ScheduleConfig | null => {
    if (!scheduleEnabled) return null;
    return buildScheduleConfig({
      repeatType,
      specificTime,
      specificDate,
      dayOfWeek,
      dayOfMonth,
      month,
      day,
      model
    });
  }, [
    scheduleEnabled,
    repeatType,
    specificTime,
    specificDate,
    dayOfWeek,
    dayOfMonth,
    month,
    day,
    model
  ]);

  return {
    scheduleEnabled,
    setScheduleEnabled,
    repeatType,
    setRepeatType,
    specificTime,
    setSpecificTime,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    month,
    setMonth,
    day,
    setDay,
    specificDate,
    setSpecificDate,
    model,
    setModel,
    providerModelOptions,
    monthLabels,
    daysOfWeekLabels,
    schedulingModelOptions,
    buildConfig
  };
}
