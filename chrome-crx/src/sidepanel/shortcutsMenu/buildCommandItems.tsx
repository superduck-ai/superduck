import type { IntlShape } from 'react-intl';
import type { SavedPrompt } from '../../extensionServices';
import type { SpecialCommand } from '../session';
import type { CommandMenuItem, SecondaryMenuItem } from './types';
import { InlineSvgIcon, SpecialCommandIcon } from './icons';
import { runShortcutSvg, cursorAiSvg, calendarSparkleSvg } from './assets';

export type SubmenuLogicalItem =
  | { type: 'secondary'; item: SecondaryMenuItem; logicalIndex: number }
  | { type: 'managed'; item: CommandMenuItem; logicalIndex: number };

export function buildSpecialCommandItems(
  specialCommands: SpecialCommand[],
  onSelect: (command: string, label?: string) => void
): CommandMenuItem[] {
  return specialCommands.map((cmd) => ({
    key: `special-${cmd.command}`,
    commandId: cmd.command,
    icon: <SpecialCommandIcon command={cmd.command} />,
    label: `/${cmd.label}`,
    description: cmd.description,
    onClick: () => onSelect(cmd.command, cmd.label),
    searchTokens: [cmd.command, cmd.label, ...cmd.aliases].filter(Boolean)
  }));
}

export function buildShortcutCommandItems(
  shortcuts: SavedPrompt[],
  untitledLabel: string,
  onSelect: (command: string, label?: string) => void,
  onEditShortcut?: (shortcut: SavedPrompt) => void
): CommandMenuItem[] {
  return shortcuts.map((shortcut) => {
    const commandLabel = shortcut.command || untitledLabel;

    return {
      key: `shortcut-${shortcut.id}`,
      commandId: shortcut.command || '',
      icon: (
        <InlineSvgIcon
          svg={runShortcutSvg}
          className="inline-flex h-[15px] w-[15px] text-text-400"
        />
      ),
      label: `/${commandLabel}`,
      onClick: () => {
        if (shortcut.command) {
          onSelect(shortcut.command, commandLabel);
        }
      },
      onEdit: onEditShortcut,
      shortcut,
      searchTokens: [shortcut.command || ''].filter(Boolean)
    };
  });
}

export function filterCommandItems(
  specialCommandItems: CommandMenuItem[],
  shortcutCommandItems: CommandMenuItem[],
  normalizedSearchTerm: string
): CommandMenuItem[] {
  const allItems = [...specialCommandItems, ...shortcutCommandItems];
  if (!normalizedSearchTerm) return allItems;
  return allItems.filter((item) =>
    item.searchTokens.some((token) => token.toLowerCase().includes(normalizedSearchTerm))
  );
}

export function partitionByManageScope(
  allCommandItems: CommandMenuItem[],
  isSearching: boolean
): { main: CommandMenuItem[]; managed: CommandMenuItem[] } {
  if (isSearching) {
    return { main: allCommandItems, managed: [] };
  }
  return {
    main: allCommandItems.filter((item) => item.commandId === 'compact'),
    managed: allCommandItems.filter((item) => item.commandId !== 'compact')
  };
}

export function buildSecondaryItems(
  intl: IntlShape,
  onRecordWorkflow: () => void,
  onScheduleTask: () => void
): SecondaryMenuItem[] {
  return [
    {
      key: 'record-workflow',
      icon: (
        <InlineSvgIcon svg={cursorAiSvg} className="inline-flex h-[15px] w-[15px] text-text-300" />
      ),
      label: intl.formatMessage({ defaultMessage: 'Record workflow', id: 'record_workflow' }),
      onClick: onRecordWorkflow
    },
    {
      key: 'schedule-task',
      icon: (
        <InlineSvgIcon
          svg={calendarSparkleSvg}
          className="inline-flex h-[15px] w-[15px] text-text-300"
        />
      ),
      label: intl.formatMessage({ defaultMessage: 'Schedule task', id: 'schedule_task' }),
      onClick: onScheduleTask
    }
  ];
}

export function buildSubmenuLogicalItems(
  secondaryItems: SecondaryMenuItem[],
  managedCommandItems: CommandMenuItem[],
  showManageSection: boolean
): SubmenuLogicalItem[] {
  if (!showManageSection) return [];
  return [
    ...secondaryItems.map((item, index) => ({
      type: 'secondary' as const,
      item,
      logicalIndex: index
    })),
    ...managedCommandItems.map((item, index) => ({
      type: 'managed' as const,
      item,
      logicalIndex: secondaryItems.length + index
    }))
  ];
}
