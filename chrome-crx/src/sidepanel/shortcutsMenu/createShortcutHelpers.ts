import type { SavedPrompt as StoredSavedPrompt } from '../../extensionServices';

export type EditableSavedPrompt = StoredSavedPrompt & {
  id: string;
  command: string;
  createdAt: number;
  usageCount: number;
};

export interface PromptToSave {
  prompt: string;
  command?: string;
}

export interface ScheduleConfig {
  repeatType: string;
  specificTime: string;
  model: string;
  specificDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
}

export function buildScheduleConfig(params: {
  repeatType: string;
  specificTime: string;
  specificDate: string;
  dayOfWeek: number;
  dayOfMonth: number;
  month: number;
  day: number;
  model: string;
}): ScheduleConfig {
  const config: ScheduleConfig = {
    repeatType: params.repeatType,
    specificTime: params.specificTime,
    model: params.model
  };
  if (params.repeatType === 'once') {
    config.specificDate = params.specificDate;
  } else if (params.repeatType === 'weekly') {
    config.dayOfWeek = params.dayOfWeek;
  } else if (params.repeatType === 'monthly') {
    config.dayOfMonth = params.dayOfMonth;
  } else if (params.repeatType === 'annually') {
    config.monthAndDay = `${params.month.toString().padStart(2, '0')}-${params.day.toString().padStart(2, '0')}`;
  }
  return config;
}
