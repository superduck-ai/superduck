import { getStorageValue, setStorageValue, StorageKeys } from './core';

export type PromptType = 'command' | 'shortcut' | 'module';

export interface SavedPrompt {
  id: string;
  command?: string;
  prompt: string;
  type?: PromptType;
  url?: string;
  repeatType?: string;
  specificTime?: string;
  specificDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
  skipPermissions?: boolean;
  model?: string;
  createdAt?: number;
  lastUsedAt?: number;
  usageCount?: number;
  nextRun?: number;
  [key: string]: unknown;
}

export type NewSavedPrompt = Omit<SavedPrompt, 'id' | 'prompt'> & { id?: string; prompt: string };

export class PromptService {
  static async getAllPrompts(): Promise<SavedPrompt[]> {
    return (await getStorageValue(StorageKeys.SAVED_PROMPTS)) || [];
  }

  static async getPromptById(id: string): Promise<SavedPrompt | undefined> {
    return (await this.getAllPrompts()).find((prompt) => prompt.id === id);
  }

  static async getPromptByCommand(command: string): Promise<SavedPrompt | undefined> {
    return (await this.getAllPrompts()).find((prompt) => prompt.command === command);
  }

  static async savePrompt(prompt: NewSavedPrompt): Promise<SavedPrompt> {
    const allPrompts = await this.getAllPrompts();
    if (prompt.command) {
      if (allPrompts.find((entry) => entry.command === prompt.command)) {
        throw new Error(`/${prompt.command} is already in use`);
      }
    }

    const newPrompt: SavedPrompt = {
      ...(prompt as Omit<SavedPrompt, 'id'>),
      id: `prompt_${Date.now()}`,
      prompt: prompt.prompt,
      createdAt: typeof prompt.createdAt === 'number' ? prompt.createdAt : Date.now(),
      usageCount: typeof prompt.usageCount === 'number' ? prompt.usageCount : 0
    };
    allPrompts.push(newPrompt);
    await setStorageValue(StorageKeys.SAVED_PROMPTS, allPrompts);
    if (newPrompt.repeatType && newPrompt.repeatType !== 'none') {
      await this.updateAlarmForPrompt(newPrompt);
    }
    return newPrompt;
  }

  static async updatePrompt(
    id: string,
    updates: Partial<SavedPrompt>
  ): Promise<SavedPrompt | undefined> {
    const allPrompts = await this.getAllPrompts();
    const index = allPrompts.findIndex((prompt) => prompt.id === id);
    if (index === -1) return undefined;

    if (updates.command && updates.command !== allPrompts[index].command) {
      if (allPrompts.find((entry) => entry.command === updates.command)) {
        throw new Error(`/${updates.command} is already in use`);
      }
    }

    const previous = allPrompts[index];
    allPrompts[index] = { ...allPrompts[index], ...updates };
    await setStorageValue(StorageKeys.SAVED_PROMPTS, allPrompts);
    const next = allPrompts[index];
    if (
      previous.repeatType !== next.repeatType ||
      previous.specificTime !== next.specificTime ||
      previous.specificDate !== next.specificDate ||
      previous.dayOfWeek !== next.dayOfWeek ||
      previous.dayOfMonth !== next.dayOfMonth ||
      previous.monthAndDay !== next.monthAndDay
    ) {
      await this.updateAlarmForPrompt(next);
    }
    return allPrompts[index];
  }

  static async deletePrompt(id: string): Promise<boolean> {
    const allPrompts = await this.getAllPrompts();
    const prompt = allPrompts.find((entry) => entry.id === id);
    const filteredPrompts = allPrompts.filter((entry) => entry.id !== id);
    if (filteredPrompts.length === allPrompts.length) return false;
    if (prompt?.repeatType && prompt.repeatType !== 'none') {
      await chrome.alarms.clear(id);
    }
    await setStorageValue(StorageKeys.SAVED_PROMPTS, filteredPrompts);
    return true;
  }

  static async recordPromptUsage(id: string): Promise<void> {
    const allPrompts = await this.getAllPrompts();
    const prompt = allPrompts.find((entry) => entry.id === id);
    if (prompt) {
      prompt.lastUsedAt = Date.now();
      prompt.usageCount = (prompt.usageCount || 0) + 1;
      await setStorageValue(StorageKeys.SAVED_PROMPTS, allPrompts);
    }
  }

  static async searchPrompts(query: string): Promise<SavedPrompt[]> {
    const allPrompts = await this.getAllPrompts();
    const normalizedQuery = query.toLowerCase();
    return allPrompts.filter(
      (prompt) =>
        prompt.prompt.toLowerCase().includes(normalizedQuery) ||
        (prompt.command && prompt.command.toLowerCase().includes(normalizedQuery))
    );
  }

  static async exportPrompts(ids?: string[]): Promise<string> {
    const allPrompts = await this.getAllPrompts();
    const filteredPrompts = ids ? allPrompts.filter((prompt) => ids.includes(prompt.id)) : allPrompts;
    return JSON.stringify(filteredPrompts, null, 2);
  }

  static async importPrompts(json: string, replaceAll = false): Promise<number> {
    const importedPrompts: SavedPrompt[] = JSON.parse(json);
    const existingPrompts = replaceAll ? [] : await this.getAllPrompts();
    const newPrompts = importedPrompts.map((prompt) => ({
      ...prompt,
      id: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      usageCount: 0,
      lastUsedAt: undefined
    }));
    const combinedPrompts = [...existingPrompts, ...newPrompts];
    const commands = combinedPrompts.filter((prompt) => prompt.command).map((prompt) => prompt.command);
    if (commands.length !== new Set(commands).size) {
      throw new Error('Import contains duplicate command shortcuts');
    }
    await setStorageValue(StorageKeys.SAVED_PROMPTS, combinedPrompts);
    return newPrompts.length;
  }

  static async updateAlarmForPrompt(prompt: SavedPrompt): Promise<void> {
    const alarmId = prompt.id;
    await chrome.alarms.clear(alarmId);
    if (!prompt.repeatType || prompt.repeatType === 'none' || !prompt.specificTime) return;

    const now = new Date();
    const [hours, minutes] = prompt.specificTime.split(':').map(Number);
    switch (prompt.repeatType) {
      case 'once': {
        if (!prompt.specificDate) return;
        const [year, month, day] = prompt.specificDate.split('-').map(Number);
        const target = new Date(year, month - 1, day, hours, minutes, 0, 0);
        if (target > now) {
          await chrome.alarms.create(alarmId, { when: target.getTime() });
        }
        break;
      }
      case 'daily': {
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        await chrome.alarms.create(alarmId, {
          when: target.getTime(),
          periodInMinutes: 1440
        });
        break;
      }
      case 'weekly': {
        if (prompt.dayOfWeek === undefined) return;
        let daysUntil = (prompt.dayOfWeek - now.getDay() + 7) % 7;
        if (daysUntil === 0) {
          const check = new Date();
          check.setHours(hours, minutes, 0, 0);
          if (check <= now) daysUntil = 7;
        }
        const target = new Date();
        target.setDate(now.getDate() + daysUntil);
        target.setHours(hours, minutes, 0, 0);
        await chrome.alarms.create(alarmId, {
          when: target.getTime(),
          periodInMinutes: 10080
        });
        break;
      }
      case 'monthly': {
        if (!prompt.dayOfMonth) return;
        const target = new Date();
        target.setDate(prompt.dayOfMonth);
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setMonth(target.getMonth() + 1);
        await chrome.alarms.create(alarmId, { when: target.getTime() });
        break;
      }
      case 'annually': {
        if (!prompt.monthAndDay) return;
        const [month, day] = prompt.monthAndDay.split('-').map(Number);
        const target = new Date();
        target.setMonth(month - 1);
        target.setDate(day);
        target.setHours(hours, minutes, 0, 0);
        if (target <= now) target.setFullYear(target.getFullYear() + 1);
        await chrome.alarms.create(alarmId, { when: target.getTime() });
        break;
      }
    }
  }

  static async updateNextRunTimes(): Promise<void> {
    const prompts = await this.getAllPrompts();
    const alarms = await chrome.alarms.getAll();
    let changed = false;
    for (const prompt of prompts) {
      if (prompt.repeatType && prompt.repeatType !== 'none') {
        const alarm = alarms.find((entry) => entry.name === prompt.id);
        const nextRun = alarm?.scheduledTime;
        if (prompt.nextRun !== nextRun) {
          prompt.nextRun = nextRun;
          changed = true;
        }
      } else if (prompt.nextRun) {
        prompt.nextRun = undefined;
        changed = true;
      }
    }
    if (changed) {
      await setStorageValue(StorageKeys.SAVED_PROMPTS, prompts);
    }
  }
}

export const promptService = PromptService;
export const E = { PromptService };
