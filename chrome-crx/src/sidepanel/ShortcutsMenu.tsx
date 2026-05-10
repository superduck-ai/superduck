import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Pencil, ChevronRight } from 'lucide-react';
import compactBroomSvg from '../assets/IconBroomSparkle.svg?raw';
import runShortcutSvg from '../assets/IconRunShortcut.svg?raw';
import calendarSparkleSvg from '../assets/IconCalenderSparkle.svg?raw';
import cursorAiSvg from '../assets/IconCursorAi.svg?raw';
import settingsSliderSvg from '../assets/IconSettingsSliderHor.svg?raw';
import { PromptService, type SavedPrompt } from '../extensionServices';
import { getSpecialCommands, type SpecialCommand } from './sessionPool';
import { isChineseLocale } from '../utils/locale';

interface ShortcutsMenuProps {
  searchTerm: string;
  onSelect: (command: string, label?: string) => void;
  onEditShortcut?: (shortcut: SavedPrompt) => void;
  onRecordWorkflow: () => void;
  onScheduleTask: () => void;
  onClose: () => void;
}

interface SecondaryMenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface CommandMenuItem {
  key: string;
  commandId: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  onEdit?: (shortcut: SavedPrompt) => void;
  shortcut?: SavedPrompt;
  searchTokens: string[];
}

const COMMAND_ROW_ESTIMATE_PX = 46;
const COMMAND_ROW_COMPACT_ESTIMATE_PX = 34;
const SUBMENU_MAX_WIDTH = 280;
const SUBMENU_GAP = 10;
const VIEWPORT_PAD = 12;
const SUBMENU_ROW_ESTIMATE_PX = 46;
const SUBMENU_MAX_HEIGHT_PX = 460;
const SUBMENU_DIVIDER_ESTIMATE_PX = 8;
const SUBMENU_INNER_PAD_PX = 6;

/** 更扁平的面板质感：轻阴影 + 细边框 */
const PALETTE_SURFACE =
  'rounded-[12px] border border-border-300/55 bg-bg-000 shadow-[0_1px_4px_hsl(var(--always-black)/2.6%)]';

function SlashIcon() {
  return (
    <span
      aria-hidden="true"
      className="select-none -translate-y-px text-[15px] font-normal leading-none text-text-300"
    >
      /
    </span>
  );
}

function InlineSvgIcon({
  svg,
  className = 'inline-flex h-[15px] w-[15px] text-text-300'
}: {
  svg: string;
  className?: string;
}) {
  // Keep SVG presentation generic so caller-provided className controls size/color.
  const svgWithStyle = svg.replace(
    /<svg/,
    `<svg style="width: 15px; height: 15px; color: currentColor; display: block; flex-shrink: 0;"`
  );

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: svgWithStyle }}
    />
  );
}

function SpecialCommandIcon({ command }: { command: string }) {
  if (command === 'compact') {
    return (
      <InlineSvgIcon
        svg={compactBroomSvg}
        className="inline-flex h-[13px] w-[13px] text-text-300"
      />
    );
  }

  return <SlashIcon />;
}

function MenuIconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-300">
      {children}
    </div>
  );
}

function CommandRow({
  label,
  description,
  icon,
  selected,
  onClick,
  onMouseEnter,
  onEdit,
  editAriaLabel,
  rowRef
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onEdit?: () => void;
  editAriaLabel?: string;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      data-palette-row="command"
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-1 rounded-[10px] transition-[background-color,box-shadow] duration-150 ${
        selected
          ? 'bg-bg-200 shadow-[0_0_0_1px_hsla(var(--border-200)/0.25),0_2px_6px_hsl(var(--always-black)/4%)]'
          : 'hover:bg-bg-200/60 hover:shadow-[0_1px_3px_hsl(var(--always-black)/2.5%)]'
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-200/35 focus-visible:ring-offset-0"
      >
        <MenuIconBox>{icon}</MenuIconBox>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-normal text-text-100">{label}</div>
          {description ? (
            <div className="mt-0.5 truncate text-[10px] font-normal text-text-300/95">
              {description}
            </div>
          ) : null}
        </div>
      </button>

      {onEdit ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={onEdit}
          aria-label={editAriaLabel}
          title={editAriaLabel}
          className={`mr-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-text-400 transition-all hover:bg-bg-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-200/60 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Pencil size={11} />
        </button>
      ) : null}
    </div>
  );
}

function SecondaryMenuRow({
  id,
  label,
  icon,
  selected,
  onClick,
  onMouseEnter,
  trailing,
  ariaHaspopup,
  ariaExpanded,
  rowRef
}: {
  id?: string;
  label: React.ReactNode;
  icon: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  trailing?: React.ReactNode;
  ariaHaspopup?: 'menu';
  ariaExpanded?: boolean;
  rowRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      id={id}
      ref={rowRef}
      type="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      className={`group flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-200/35 focus-visible:ring-offset-0 ${
        selected
          ? 'bg-bg-200 shadow-[0_0_0_1px_hsla(var(--border-200)/0.25),0_2px_6px_hsl(var(--always-black)/4%)]'
          : 'hover:bg-bg-200/60 hover:shadow-[0_1px_3px_hsl(var(--always-black)/2.5%)]'
      }`}
    >
      <MenuIconBox>{icon}</MenuIconBox>
      <div className="min-w-0 flex-1 truncate text-[12px] font-normal text-text-100">{label}</div>
      {trailing ? (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-text-400 transition-colors group-hover:text-text-300">
          {trailing}
        </div>
      ) : null}
    </button>
  );
}

export function ShortcutsMenu({
  searchTerm,
  onSelect,
  onEditShortcut,
  onRecordWorkflow,
  onScheduleTask,
  onClose
}: ShortcutsMenuProps) {
  const intl = useIntl();
  const [shortcuts, setShortcuts] = useState<SavedPrompt[]>([]);
  const [specialCommands, setSpecialCommands] = useState<SpecialCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const [submenuSide, setSubmenuSide] = useState<'left' | 'right'>('right');
  const [submenuVerticalDirection, setSubmenuVerticalDirection] = useState<'down' | 'up'>('down');
  const [submenuMaxWidth, setSubmenuMaxWidth] = useState(SUBMENU_MAX_WIDTH);
  const [submenuTopOffset, setSubmenuTopOffset] = useState(0);
  const [submenuMaxHeight, setSubmenuMaxHeight] = useState(SUBMENU_MAX_HEIGHT_PX);

  const paletteRef = useRef<HTMLDivElement>(null);
  const submenuAnchorRef = useRef<HTMLDivElement>(null);
  const commandScrollRef = useRef<HTMLDivElement>(null);
  const manageRowRef = useRef<HTMLDivElement>(null);
  const submenuRowRefs = useRef<(HTMLElement | null)[]>([]);
  const submenuContentRef = useRef<HTMLDivElement>(null);

  const pointerInteraction = useRef(false);
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
    (item: CommandMenuItem) => {
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

  const specialCommandItems = useMemo<CommandMenuItem[]>(
    () =>
      specialCommands.map((cmd) => ({
        key: `special-${cmd.command}`,
        commandId: cmd.command,
        icon: <SpecialCommandIcon command={cmd.command} />,
        label: `/${cmd.label}`,
        description: cmd.description,
        onClick: () => onSelect(cmd.command, cmd.label),
        searchTokens: [cmd.command, cmd.label, ...cmd.aliases].filter(Boolean)
      })),
    [specialCommands, onSelect]
  );

  const shortcutCommandItems = useMemo<CommandMenuItem[]>(
    () =>
      shortcuts.map((shortcut) => {
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
      }),
    [onEditShortcut, onSelect, shortcuts, untitledLabel]
  );

  const allCommandItems = useMemo(() => {
    const allItems = [...specialCommandItems, ...shortcutCommandItems];

    if (!normalizedSearchTerm) return allItems;

    return allItems.filter((item) =>
      item.searchTokens.some((token) => token.toLowerCase().includes(normalizedSearchTerm))
    );
  }, [normalizedSearchTerm, shortcutCommandItems, specialCommandItems]);

  const mainCommandItems = useMemo(
    () =>
      isSearching
        ? allCommandItems
        : allCommandItems.filter((item) => item.commandId === 'compact'),
    [allCommandItems, isSearching]
  );

  const managedCommandItems = useMemo(
    () => (isSearching ? [] : allCommandItems.filter((item) => item.commandId !== 'compact')),
    [allCommandItems, isSearching]
  );

  const secondaryItems = useMemo<SecondaryMenuItem[]>(
    () => [
      {
        key: 'record-workflow',
        icon: (
          <InlineSvgIcon
            svg={cursorAiSvg}
            className="inline-flex h-[15px] w-[15px] text-text-300"
          />
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
    ],
    [intl, onRecordWorkflow, onScheduleTask]
  );

  const manageLabel = intl.formatMessage({
    defaultMessage: isZh ? '管理快捷方式' : 'Manage shortcuts',
    id: 'manage_shortcuts_palette'
  });
  const noCommandsLabel = intl.formatMessage({
    defaultMessage: isZh
      ? `没有匹配“${trimmedSearchTerm}”的命令`
      : `No commands found for '${trimmedSearchTerm}'`,
    id: 'no_commands_found_for'
  });

  const manageTriggerIndex = mainCommandItems.length;
  const firstManageActionIndex = manageTriggerIndex + 1;
  const submenuLogicalItems = useMemo(
    () =>
      showManageSection
        ? [
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
          ]
        : [],
    [managedCommandItems, secondaryItems, showManageSection]
  );
  const submenuItemsCount = submenuLogicalItems.length;
  const submenuVisualItems = useMemo(
    () =>
      submenuVerticalDirection === 'down'
        ? submenuLogicalItems
        : [...submenuLogicalItems].reverse(),
    [submenuLogicalItems, submenuVerticalDirection]
  );
  const lastManageActionIndex = firstManageActionIndex + submenuItemsCount - 1;
  const closeManageMenuAndResetSelection = useCallback(() => {
    setIsManageMenuOpen(false);
    setSelectedIndex(showManageSection ? manageTriggerIndex : -1);
  }, [manageTriggerIndex, showManageSection]);

  // 缓存行高计算结果以优化性能
  const rowSizes = useMemo(
    () =>
      mainCommandItems.map((item) =>
        item.description ? COMMAND_ROW_ESTIMATE_PX : COMMAND_ROW_COMPACT_ESTIMATE_PX
      ),
    [mainCommandItems]
  );

  const rowVirtualizer = useVirtualizer({
    count: mainCommandItems.length,
    getScrollElement: () => commandScrollRef.current,
    estimateSize: (index) => rowSizes[index] ?? COMMAND_ROW_COMPACT_ESTIMATE_PX,
    overscan: 12
  });

  const updateSubmenuLayout = useCallback(() => {
    const anchor = submenuAnchorRef.current;
    const palette = paletteRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : SUBMENU_MAX_WIDTH;

    const paletteRect = palette?.getBoundingClientRect();
    const clipRight = paletteRect?.right ?? vw;
    const clipLeft = paletteRect?.left ?? 0;
    const effectiveRight = Math.min(vw, clipRight) - VIEWPORT_PAD;
    const effectiveLeft = Math.max(0, clipLeft) + VIEWPORT_PAD;

    const roomRight = effectiveRight - rect.right - SUBMENU_GAP;
    const roomLeft = rect.left - effectiveLeft - SUBMENU_GAP;

    const preferRight = roomRight >= SUBMENU_MAX_WIDTH + SUBMENU_GAP || roomRight >= roomLeft;
    setSubmenuSide(preferRight ? 'right' : 'left');

    const cap = preferRight
      ? Math.max(160, Math.min(SUBMENU_MAX_WIDTH, roomRight))
      : Math.max(160, Math.min(SUBMENU_MAX_WIDTH, roomLeft));
    setSubmenuMaxWidth(cap);

    const estimatedRows = submenuItemsCount;
    const hasDivider = managedCommandItems.length > 0 && secondaryItems.length > 0;
    const estimatedHeight = Math.min(
      SUBMENU_MAX_HEIGHT_PX,
      estimatedRows * SUBMENU_ROW_ESTIMATE_PX +
        (hasDivider ? SUBMENU_DIVIDER_ESTIMATE_PX : 0) +
        SUBMENU_INNER_PAD_PX * 2
    );
    const actualHeight = submenuContentRef.current?.scrollHeight ?? estimatedHeight;
    const desiredHeight = Math.min(SUBMENU_MAX_HEIGHT_PX, Math.max(actualHeight, estimatedHeight));

    const maxAllowedBottom = window.innerHeight - VIEWPORT_PAD;
    const maxAllowedTop = VIEWPORT_PAD;
    const roomBelow = Math.max(0, maxAllowedBottom - rect.top);
    const roomAbove = Math.max(0, rect.bottom - maxAllowedTop);
    const preferDown = roomBelow >= desiredHeight;
    const direction: 'down' | 'up' = preferDown ? 'down' : 'up';
    setSubmenuVerticalDirection(direction);

    const directionalRoom = direction === 'down' ? roomBelow : roomAbove;
    const nextMaxHeight = Math.max(120, Math.min(SUBMENU_MAX_HEIGHT_PX, directionalRoom));
    const renderHeight = Math.min(desiredHeight, nextMaxHeight);

    let nextOffset = direction === 'down' ? 0 : rect.height - renderHeight;
    let nextTop = rect.top + nextOffset;
    let nextBottom = nextTop + renderHeight;

    if (nextTop < maxAllowedTop) {
      nextOffset += maxAllowedTop - nextTop;
      nextTop = rect.top + nextOffset;
      nextBottom = nextTop + renderHeight;
    }
    if (nextBottom > maxAllowedBottom) {
      nextOffset -= nextBottom - maxAllowedBottom;
    }

    setSubmenuTopOffset(nextOffset);
    setSubmenuMaxHeight(nextMaxHeight);

    requestAnimationFrame(() => {
      const firstLogicalRow = submenuRowRefs.current[0];
      if (!firstLogicalRow?.isConnected) return;

      const anchorRect = anchor.getBoundingClientRect();
      const firstRowRect = firstLogicalRow.getBoundingClientRect();
      const delta = anchorRect.top - firstRowRect.top;

      if (Math.abs(delta) >= 1) {
        setSubmenuTopOffset((prev) => prev + delta);
      }
    });
  }, [managedCommandItems.length, secondaryItems.length, submenuItemsCount]);

  useEffect(() => {
    if (!isManageMenuOpen) return;

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && paletteRef.current?.contains(target)) {
        return;
      }
      updateSubmenuLayout();
    };

    window.addEventListener('resize', updateSubmenuLayout);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', updateSubmenuLayout);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isManageMenuOpen, updateSubmenuLayout]);

  useLayoutEffect(() => {
    if (!isManageMenuOpen) return;
    updateSubmenuLayout();
  }, [isManageMenuOpen, updateSubmenuLayout]);

  useLayoutEffect(() => {
    if (pointerInteraction.current) return;
    if (selectedIndex < 0 || selectedIndex >= mainCommandItems.length) return;
    rowVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, mainCommandItems.length, rowVirtualizer, searchTerm]);

  useLayoutEffect(() => {
    if (!showManageSection || pointerInteraction.current) return;
    if (selectedIndex === manageTriggerIndex) {
      manageRowRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (selectedIndex >= firstManageActionIndex && selectedIndex <= lastManageActionIndex) {
      const i = selectedIndex - firstManageActionIndex;
      submenuRowRefs.current[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [
    firstManageActionIndex,
    showManageSection,
    lastManageActionIndex,
    manageTriggerIndex,
    selectedIndex,
    isManageMenuOpen
  ]);

  useEffect(() => {
    pointerInteraction.current = false;
    setIsManageMenuOpen(false);
    setSelectedIndex(mainCommandItems.length > 0 ? 0 : showManageSection ? manageTriggerIndex : -1);
  }, [mainCommandItems.length, manageTriggerIndex, showManageSection, searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === 'Process') return;

      const key = e.key;
      const nMainCommands = mainCommandItems.length;
      const canOpenManageMenu = showManageSection && submenuItemsCount > 0;

      if (key === 'ArrowLeft' && (!showManageSection || !isManageMenuOpen)) return;
      if (key === 'ArrowRight' && (!showManageSection || selectedIndex !== manageTriggerIndex))
        return;

      const paletteKeys = new Set([
        'ArrowDown',
        'ArrowUp',
        'Enter',
        'Escape',
        'ArrowLeft',
        'ArrowRight'
      ]);
      if (!paletteKeys.has(key)) return;

      pointerInteraction.current = false;
      e.preventDefault();
      e.stopPropagation();

      if (key === 'Escape') {
        if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
          // 在二级菜单中：返回"管理快捷方式"
          setIsManageMenuOpen(false);
          setSelectedIndex(manageTriggerIndex);
          return;
        }
        // 关闭整个菜单
        onClose();
        return;
      }

      if (key === 'ArrowLeft') {
        // 只有在二级菜单中才能返回
        if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
          setIsManageMenuOpen(false);
          setSelectedIndex(manageTriggerIndex);
        }
        return;
      }

      if (key === 'ArrowRight') {
        // 只有在"管理快捷方式"上才能进入二级菜单
        if (canOpenManageMenu && selectedIndex === manageTriggerIndex) {
          setIsManageMenuOpen(true);
          setSelectedIndex(firstManageActionIndex);
        }
        return;
      }

      if (key === 'ArrowDown') {
        if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
          // 焦点在二级菜单中：循环移动
          // 注意：当 submenuVerticalDirection === 'up' 时，视觉顺序是反的
          const isReversed = submenuVerticalDirection === 'up';

          if (isReversed) {
            // 视觉向下 = 逻辑索引减小
            if (selectedIndex > firstManageActionIndex) {
              setSelectedIndex((p) => p - 1);
            } else {
              // 循环到最后一项
              setSelectedIndex(lastManageActionIndex);
            }
          } else {
            // 视觉向下 = 逻辑索引增加
            if (selectedIndex < lastManageActionIndex) {
              setSelectedIndex((p) => p + 1);
            } else {
              // 循环到第一项
              setSelectedIndex(firstManageActionIndex);
            }
          }
          return;
        }

        if (!showManageSection) {
          if (nMainCommands > 0) {
            // 循环导航：到达底部后回到顶部
            const nextIndex = selectedIndex < 0 ? 0 : (selectedIndex + 1) % nMainCommands;
            setSelectedIndex(nextIndex);
          }
          return;
        }

        // 焦点在一级菜单中：向下移动
        const nextIndex =
          selectedIndex < manageTriggerIndex ? selectedIndex + 1 : manageTriggerIndex;
        setSelectedIndex(nextIndex);

        // 如果移动到"管理快捷方式"，自动展示二级菜单
        if (nextIndex === manageTriggerIndex && canOpenManageMenu) {
          setIsManageMenuOpen(true);
        }
        return;
      }

      if (key === 'ArrowUp') {
        if (canOpenManageMenu && isManageMenuOpen && selectedIndex >= firstManageActionIndex) {
          // 焦点在二级菜单中：循环移动
          // 注意：当 submenuVerticalDirection === 'up' 时，视觉顺序是反的
          const isReversed = submenuVerticalDirection === 'up';

          if (isReversed) {
            // 视觉向上 = 逻辑索引增加
            if (selectedIndex < lastManageActionIndex) {
              setSelectedIndex((p) => p + 1);
            } else {
              // 循环到第一项
              setSelectedIndex(firstManageActionIndex);
            }
          } else {
            // 视觉向上 = 逻辑索引减小
            if (selectedIndex > firstManageActionIndex) {
              setSelectedIndex((p) => p - 1);
            } else {
              // 循环到最后一项
              setSelectedIndex(lastManageActionIndex);
            }
          }
          return;
        }

        if (!showManageSection) {
          if (nMainCommands > 0) {
            // 循环导航：到达顶部后回到底部
            const nextIndex = selectedIndex <= 0 ? nMainCommands - 1 : selectedIndex - 1;
            setSelectedIndex(nextIndex);
          }
          return;
        }

        // 焦点在一级菜单中：向上移动
        const nextIndex = selectedIndex > 0 ? selectedIndex - 1 : 0;
        setSelectedIndex(nextIndex);

        // 如果离开"管理快捷方式"，关闭二级菜单
        if (selectedIndex === manageTriggerIndex && nextIndex !== manageTriggerIndex) {
          setIsManageMenuOpen(false);
        }
        // 如果移动到"管理快捷方式"，自动展示二级菜单
        if (nextIndex === manageTriggerIndex && canOpenManageMenu) {
          setIsManageMenuOpen(true);
        }
        return;
      }

      if (key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < nMainCommands) {
          mainCommandItems[selectedIndex]?.onClick();
          return;
        }

        if (!showManageSection) {
          return;
        }

        if (selectedIndex === manageTriggerIndex) {
          setIsManageMenuOpen(true);
          if (canOpenManageMenu) {
            setSelectedIndex(firstManageActionIndex);
          }
          return;
        }

        const submenuOffset = selectedIndex - firstManageActionIndex;
        if (submenuOffset >= 0 && submenuOffset < submenuLogicalItems.length) {
          const submenuItem = submenuLogicalItems[submenuOffset];
          submenuItem?.item.onClick();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    mainCommandItems,
    firstManageActionIndex,
    isManageMenuOpen,
    lastManageActionIndex,
    manageTriggerIndex,
    managedCommandItems,
    onClose,
    secondaryItems,
    selectedIndex,
    showManageSection,
    submenuItemsCount,
    submenuLogicalItems,
    submenuVerticalDirection
  ]);

  const paletteBodyClass = 'flex flex-col p-1.5';
  const paletteBodyStyle = { maxHeight: 'min(26rem, calc(100vh - 8rem))' };
  const scrollChrome =
    'u-hidden-scrollbar min-h-[46px] w-full flex-1 overflow-y-auto overflow-x-hidden pb-1';
  // 仅在搜索模式且有结果时设置固定高度以优化虚拟滚动
  const commandScrollStyle =
    !showManageSection && mainCommandItems.length > 0
      ? {
          height: `${rowVirtualizer.getTotalSize()}px`,
          maxHeight: 'min(26rem, calc(100vh - 8rem))'
        }
      : undefined;
  const paletteStyle = {
    width: 'max-content',
    minWidth: '14.5rem',
    maxWidth: 'calc(100vw - 2.5rem)'
  };

  return (
    <div
      ref={paletteRef}
      className={`absolute bottom-full left-0 z-50 mb-1.5 overflow-visible ${PALETTE_SURFACE}`}
      style={paletteStyle}
    >
      <div
        role="menu"
        aria-label={intl.formatMessage({
          defaultMessage: isZh ? '命令面板' : 'Command palette',
          id: 'command_palette'
        })}
        className={paletteBodyClass}
        style={paletteBodyStyle}
      >
        <div
          ref={commandScrollRef}
          className={`${scrollChrome} rounded-[10px]`}
          style={commandScrollStyle}
        >
          {mainCommandItems.length > 0 ? (
            <div
              className="flex flex-col gap-1"
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%'
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const item = mainCommandItems[vi.index];
                const { onEdit, editAriaLabel } = getCommandRowEditProps(item);

                return (
                  <div
                    key={item.key}
                    id={`palette-cmd-${item.key}`}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <CommandRow
                      icon={item.icon}
                      label={item.label}
                      description={item.description}
                      selected={selectedIndex === vi.index}
                      onClick={item.onClick}
                      onMouseEnter={() => {
                        pointerInteraction.current = true;
                        setSelectedIndex(vi.index);
                      }}
                      onEdit={onEdit}
                      editAriaLabel={editAriaLabel}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[10px] px-2 py-2 text-[11px] text-text-300">
              {managedCommandItems.length > 0
                ? intl.formatMessage({
                    defaultMessage: isZh
                      ? '命令已收纳到“管理快捷方式”'
                      : 'Commands are inside Manage shortcuts',
                    id: 'commands_inside_manage_shortcuts'
                  })
                : noCommandsLabel}
            </div>
          )}
        </div>

        {showManageSection ? (
          <>
            <div className="mx-1 h-px rounded-full bg-border-300/40" />

            <div
              ref={submenuAnchorRef}
              className="relative mt-0.5"
              onMouseEnter={() => {
                setSelectedIndex(manageTriggerIndex);
                setIsManageMenuOpen(true);
              }}
              onMouseLeave={closeManageMenuAndResetSelection}
            >
              <div ref={manageRowRef}>
                <SecondaryMenuRow
                  id="palette-manage"
                  icon={
                    <InlineSvgIcon
                      svg={settingsSliderSvg}
                      className="inline-flex h-[15px] w-[15px] text-text-300"
                    />
                  }
                  label={manageLabel}
                  selected={
                    selectedIndex === manageTriggerIndex || selectedIndex >= firstManageActionIndex
                  }
                  onClick={() => {
                    setIsManageMenuOpen(true);
                    if (submenuItemsCount > 0) {
                      setSelectedIndex(firstManageActionIndex);
                    }
                  }}
                  onMouseEnter={() => {
                    pointerInteraction.current = true;
                    setSelectedIndex(manageTriggerIndex);
                  }}
                  trailing={
                    <ChevronRight
                      size={13}
                      className={`transition-transform ${submenuSide === 'left' ? 'rotate-180' : ''}`}
                    />
                  }
                  ariaHaspopup="menu"
                  ariaExpanded={isManageMenuOpen}
                />
              </div>

              {isManageMenuOpen ? (
                <div
                  role="menu"
                  aria-label={manageLabel}
                  className={`absolute top-0 z-10 ${
                    submenuSide === 'right' ? 'left-full pl-2' : 'right-full pr-2'
                  }`}
                  style={{
                    top: `${submenuTopOffset}px`,
                    width: 'min(100%, max-content)',
                    maxWidth: `min(${Math.max(submenuMaxWidth, 240)}px, calc(100vw - ${VIEWPORT_PAD * 2}px))`
                  }}
                >
                 <div className={`overflow-hidden ${PALETTE_SURFACE}`}>
                  <div
                    ref={submenuContentRef}
                    className="p-1.5 u-hidden-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[10px]"
                    style={{ maxHeight: `${submenuMaxHeight}px` }}
                  >
                    <div className="flex flex-col gap-1">
                      {submenuVisualItems.map((submenuItem, visualIndex) => {
                        const prev = visualIndex > 0 ? submenuVisualItems[visualIndex - 1] : null;
                        const showDivider = !!prev && prev.type !== submenuItem.type;
                        const menuIndex = firstManageActionIndex + submenuItem.logicalIndex;

                        return (
                          <React.Fragment key={`submenu-${submenuItem.item.key}`}>
                            {showDivider ? (
                              <div className="mx-1 my-1 border-t border-border-300/70" />
                            ) : null}
                            {submenuItem.type === 'managed' ? (
                              (() => {
                                const item = submenuItem.item;
                                const { onEdit, editAriaLabel } = getCommandRowEditProps(item);

                                return (
                                  <CommandRow
                                    rowRef={(el) => {
                                      submenuRowRefs.current[submenuItem.logicalIndex] = el;
                                    }}
                                    icon={item.icon}
                                    label={item.label}
                                    description={item.description}
                                    selected={selectedIndex === menuIndex}
                                    onClick={item.onClick}
                                    onMouseEnter={() => {
                                      pointerInteraction.current = true;
                                      setSelectedIndex(menuIndex);
                                    }}
                                    onEdit={onEdit}
                                    editAriaLabel={editAriaLabel}
                                  />
                                );
                              })()
                            ) : (
                              <SecondaryMenuRow
                                id={`palette-sub-${submenuItem.item.key}`}
                                rowRef={(el) => {
                                  submenuRowRefs.current[submenuItem.logicalIndex] = el;
                                }}
                                icon={submenuItem.item.icon}
                                label={submenuItem.item.label}
                                selected={selectedIndex === menuIndex}
                                onClick={submenuItem.item.onClick}
                                onMouseEnter={() => {
                                  pointerInteraction.current = true;
                                  setSelectedIndex(menuIndex);
                                }}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                 </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
