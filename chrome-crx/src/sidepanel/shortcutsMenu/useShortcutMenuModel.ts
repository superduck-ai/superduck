import { useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';
import type { SavedPrompt } from '../../extensionServices';
import { isChineseLocale } from '../../utils/locale';
import type { CommandMenuItem, ShortcutsMenuProps } from './types';
import { useShortcutsData } from './useShortcutsData';
import {
  buildSpecialCommandItems,
  buildShortcutCommandItems,
  filterCommandItems,
  partitionByManageScope,
  buildSecondaryItems
} from './buildCommandItems';
import { getPaletteLabels } from './paletteChrome';

interface CommandRowEditProps {
  onEdit: (() => void) | undefined;
  editAriaLabel: string | undefined;
}

export function useShortcutMenuModel({
  searchTerm,
  onSelect,
  onEditShortcut,
  onRecordWorkflow,
  onScheduleTask
}: Pick<
  ShortcutsMenuProps,
  'searchTerm' | 'onSelect' | 'onEditShortcut' | 'onRecordWorkflow' | 'onScheduleTask'
>) {
  const intl = useIntl();
  const { shortcuts, specialCommands } = useShortcutsData(intl);
  const isZh = isChineseLocale(intl.locale);
  const untitledLabel = intl.formatMessage({ defaultMessage: 'untitled', id: 'untitled' });
  const trimmedSearchTerm = searchTerm.trim();
  const normalizedSearchTerm = trimmedSearchTerm.toLowerCase();
  const isSearching = normalizedSearchTerm.length > 0;
  const showManageSection = !isSearching;

  const getEditShortcutAriaLabel = useCallback(
    (shortcutName: string) =>
      intl.formatMessage({
        defaultMessage: isZh ? `编辑快捷方式 ${shortcutName}` : `Edit shortcut ${shortcutName}`,
        id: 'edit_shortcut_named'
      }),
    [intl, isZh]
  );

  const getCommandRowEditProps = useCallback(
    (item: CommandMenuItem): CommandRowEditProps => {
      if (!item.shortcut || !item.onEdit) {
        return { onEdit: undefined, editAriaLabel: undefined };
      }

      const shortcutName = item.shortcut.command || untitledLabel;
      return {
        onEdit: () => item.onEdit?.(item.shortcut as SavedPrompt),
        editAriaLabel: getEditShortcutAriaLabel(shortcutName)
      };
    },
    [getEditShortcutAriaLabel, untitledLabel]
  );

  const specialCommandItems = useMemo(
    () => buildSpecialCommandItems(specialCommands, onSelect),
    [specialCommands, onSelect]
  );

  const shortcutCommandItems = useMemo(
    () => buildShortcutCommandItems(shortcuts, untitledLabel, onSelect, onEditShortcut),
    [shortcuts, untitledLabel, onSelect, onEditShortcut]
  );

  const allCommandItems = useMemo(
    () => filterCommandItems(specialCommandItems, shortcutCommandItems, normalizedSearchTerm),
    [normalizedSearchTerm, shortcutCommandItems, specialCommandItems]
  );

  const { main: mainCommandItems, managed: managedCommandItems } = useMemo(
    () => partitionByManageScope(allCommandItems, isSearching),
    [allCommandItems, isSearching]
  );

  const secondaryItems = useMemo(
    () => buildSecondaryItems(intl, onRecordWorkflow, onScheduleTask),
    [intl, onRecordWorkflow, onScheduleTask]
  );

  return {
    showManageSection,
    mainCommandItems,
    managedCommandItems,
    secondaryItems,
    labels: getPaletteLabels(intl, isZh, trimmedSearchTerm),
    getCommandRowEditProps
  };
}
