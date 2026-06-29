import type { CSSProperties } from 'react';
import type { IntlShape } from 'react-intl';

export const PALETTE_BODY_CLASS = 'flex flex-col p-1.5';
export const PALETTE_BODY_STYLE: CSSProperties = { maxHeight: 'min(26rem, calc(100vh - 8rem))' };
export const SCROLL_CHROME =
  'u-hidden-scrollbar min-h-[46px] w-full flex-1 overflow-y-auto overflow-x-hidden pb-1';
export const PALETTE_STYLE: CSSProperties = {
  width: 'max-content',
  minWidth: '14.5rem',
  maxWidth: 'calc(100vw - 2.5rem)'
};

// 搜索模式且有结果时设固定高度，避免虚拟滚动高度抖动
export function getCommandScrollStyle(
  showManageSection: boolean,
  mainCommandItemsCount: number,
  totalSize: number
): CSSProperties | undefined {
  if (showManageSection || mainCommandItemsCount === 0) return undefined;
  return {
    height: `${totalSize}px`,
    maxHeight: 'min(26rem, calc(100vh - 8rem))'
  };
}

export interface PaletteLabels {
  manageLabel: string;
  noCommandsLabel: string;
  commandPaletteLabel: string;
  commandsInsideManageLabel: string;
}

export function getPaletteLabels(
  intl: IntlShape,
  isZh: boolean,
  trimmedSearchTerm: string
): PaletteLabels {
  return {
    manageLabel: intl.formatMessage({
      defaultMessage: isZh ? '管理快捷方式' : 'Manage shortcuts',
      id: 'manage_shortcuts_palette'
    }),
    noCommandsLabel: intl.formatMessage({
      defaultMessage: isZh
        ? `没有匹配“${trimmedSearchTerm}”的命令`
        : `No commands found for '${trimmedSearchTerm}'`,
      id: 'no_commands_found_for'
    }),
    commandPaletteLabel: intl.formatMessage({
      defaultMessage: isZh ? '命令面板' : 'Command palette',
      id: 'command_palette'
    }),
    commandsInsideManageLabel: intl.formatMessage({
      defaultMessage: isZh ? '命令已收纳到“管理快捷方式”' : 'Commands are inside Manage shortcuts',
      id: 'commands_inside_manage_shortcuts'
    })
  };
}
