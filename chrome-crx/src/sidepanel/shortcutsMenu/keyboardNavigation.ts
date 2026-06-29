import type { CommandMenuItem } from './types';
import type { SubmenuLogicalItem } from './buildCommandItems';

export interface KeyboardNavContext {
  mainCommandItems: CommandMenuItem[];
  showManageSection: boolean;
  submenuItemsCount: number;
  isManageMenuOpen: boolean;
  selectedIndex: number;
  manageTriggerIndex: number;
  firstManageActionIndex: number;
  lastManageActionIndex: number;
  submenuVerticalDirection: 'down' | 'up';
  submenuLogicalItems: SubmenuLogicalItem[];
}

export type NextSelectionAction =
  | { type: 'ignore' }
  | { type: 'handled' }
  | { type: 'close' }
  | { type: 'select'; value: number }
  | { type: 'selectAndManage'; value: number; manageOpen?: boolean }
  | { type: 'manage'; open: boolean; selectedIndex?: number }
  | { type: 'executeMain'; index: number }
  | { type: 'executeSubmenu'; logicalIndex: number };

const PALETTE_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight'
]);

export function computeNextSelection(key: string, ctx: KeyboardNavContext): NextSelectionAction {
  const {
    mainCommandItems,
    showManageSection,
    submenuItemsCount,
    isManageMenuOpen,
    selectedIndex,
    manageTriggerIndex,
    firstManageActionIndex,
    lastManageActionIndex,
    submenuVerticalDirection,
    submenuLogicalItems
  } = ctx;

  const nMainCommands = mainCommandItems.length;
  const canOpenManageMenu = showManageSection && submenuItemsCount > 0;

  if (key === 'ArrowLeft' && (!showManageSection || !isManageMenuOpen)) return { type: 'ignore' };
  if (key === 'ArrowRight' && (!showManageSection || selectedIndex !== manageTriggerIndex))
    return { type: 'ignore' };
  if (!PALETTE_KEYS.has(key)) return { type: 'ignore' };

  if (key === 'Escape') {
    if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
      return { type: 'manage', open: false, selectedIndex: manageTriggerIndex };
    }
    return { type: 'close' };
  }

  if (key === 'ArrowLeft') {
    if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
      return { type: 'manage', open: false, selectedIndex: manageTriggerIndex };
    }
    return { type: 'handled' };
  }

  if (key === 'ArrowRight') {
    if (canOpenManageMenu && selectedIndex === manageTriggerIndex) {
      return { type: 'manage', open: true, selectedIndex: firstManageActionIndex };
    }
    return { type: 'handled' };
  }

  if (key === 'ArrowDown') {
    if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
      const isReversed = submenuVerticalDirection === 'up';
      if (isReversed) {
        return {
          type: 'select',
          value: selectedIndex > firstManageActionIndex ? selectedIndex - 1 : lastManageActionIndex
        };
      }
      return {
        type: 'select',
        value: selectedIndex < lastManageActionIndex ? selectedIndex + 1 : firstManageActionIndex
      };
    }

    if (!showManageSection) {
      if (nMainCommands > 0) {
        return {
          type: 'select',
          value: selectedIndex < 0 ? 0 : (selectedIndex + 1) % nMainCommands
        };
      }
      return { type: 'handled' };
    }

    const nextIndex = selectedIndex < manageTriggerIndex ? selectedIndex + 1 : manageTriggerIndex;
    const manageOpen = nextIndex === manageTriggerIndex && canOpenManageMenu ? true : undefined;
    return { type: 'selectAndManage', value: nextIndex, manageOpen };
  }

  if (key === 'ArrowUp') {
    if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
      const isReversed = submenuVerticalDirection === 'up';
      if (isReversed) {
        return {
          type: 'select',
          value: selectedIndex < lastManageActionIndex ? selectedIndex + 1 : firstManageActionIndex
        };
      }
      return {
        type: 'select',
        value: selectedIndex > firstManageActionIndex ? selectedIndex - 1 : lastManageActionIndex
      };
    }

    if (!showManageSection) {
      if (nMainCommands > 0) {
        return {
          type: 'select',
          value: selectedIndex <= 0 ? nMainCommands - 1 : selectedIndex - 1
        };
      }
      return { type: 'handled' };
    }

    const nextIndex = selectedIndex > 0 ? selectedIndex - 1 : 0;
    let manageOpen: boolean | undefined;
    if (nextIndex === manageTriggerIndex && canOpenManageMenu) {
      manageOpen = true;
    } else if (selectedIndex === manageTriggerIndex && nextIndex !== manageTriggerIndex) {
      manageOpen = false;
    }
    return { type: 'selectAndManage', value: nextIndex, manageOpen };
  }

  // Enter
  if (selectedIndex >= 0 && selectedIndex < nMainCommands) {
    return { type: 'executeMain', index: selectedIndex };
  }

  if (!showManageSection) return { type: 'handled' };

  if (selectedIndex === manageTriggerIndex) {
    return {
      type: 'manage',
      open: true,
      selectedIndex: canOpenManageMenu ? firstManageActionIndex : undefined
    };
  }

  const submenuOffset = selectedIndex - firstManageActionIndex;
  if (submenuOffset >= 0 && submenuOffset < submenuLogicalItems.length) {
    return { type: 'executeSubmenu', logicalIndex: submenuOffset };
  }

  return { type: 'handled' };
}
