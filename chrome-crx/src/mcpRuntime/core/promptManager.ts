import { PromptService } from '../../extensionServices';

// Thin re-export so callers can swap implementations later (e.g. cache layer)
// without touching every call site. Also normalizes find-by-X to `null` so
// callers can `if (!shortcut)` without distinguishing missing vs undefined.
export const promptManager = {
  getAllPrompts: () => PromptService.getAllPrompts(),
  getPromptById: async (id: string) => (await PromptService.getPromptById(id)) ?? null,
  getPromptByCommand: async (cmd: string) => (await PromptService.getPromptByCommand(cmd)) ?? null,
  recordPromptUsage: (id: string) => PromptService.recordPromptUsage(id)
};
