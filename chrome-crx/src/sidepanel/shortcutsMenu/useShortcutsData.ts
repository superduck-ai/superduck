import { useEffect, useState } from 'react';
import type { IntlShape } from 'react-intl';
import { PromptService, type SavedPrompt } from '../../extensionServices';
import { getSpecialCommands, type SpecialCommand } from '../session';

export function useShortcutsData(intl: IntlShape) {
  const [shortcuts, setShortcuts] = useState<SavedPrompt[]>([]);
  const [specialCommands, setSpecialCommands] = useState<SpecialCommand[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const allPrompts = await PromptService.getAllPrompts();
        const sorted = allPrompts.sort((a, b) => {
          const usageA = a.usageCount ?? 0;
          const usageB = b.usageCount ?? 0;

          if (usageA !== usageB) {
            return usageB - usageA;
          }

          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
        });

        setShortcuts(sorted);
        setSpecialCommands(getSpecialCommands(intl));
      } catch (error) {
        console.error('Failed to load shortcuts:', error);
      }
    })();
  }, [intl]);

  return { shortcuts, specialCommands };
}
