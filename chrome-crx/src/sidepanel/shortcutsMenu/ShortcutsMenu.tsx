import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight } from 'lucide-react';
import type { ShortcutsMenuProps } from './types';
import { settingsSliderSvg } from './assets';
import {
  COMMAND_ROW_ESTIMATE_PX,
  COMMAND_ROW_COMPACT_ESTIMATE_PX,
  SUBMENU_MAX_WIDTH,
  SUBMENU_MAX_HEIGHT_PX,
  PALETTE_SURFACE
} from './constants';
import { computeSubmenuLayout } from './submenuLayout';
import { computeNextSelection } from './keyboardNavigation';
import { InlineSvgIcon } from './icons';
import { buildSubmenuLogicalItems } from './buildCommandItems';
import { SecondaryMenuRow } from './menuRows';
import {
  PALETTE_BODY_CLASS,
  PALETTE_BODY_STYLE,
  PALETTE_STYLE,
  getCommandScrollStyle
} from './paletteChrome';
import { SubmenuPanel } from './SubmenuPanel';
import { useShortcutMenuModel } from './useShortcutMenuModel';
import { CommandList } from './CommandList';

export function ShortcutsMenu({
  searchTerm,
  onSelect,
  onEditShortcut,
  onRecordWorkflow,
  onScheduleTask,
  onClose
}: ShortcutsMenuProps) {
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
  const {
    showManageSection,
    mainCommandItems,
    managedCommandItems,
    secondaryItems,
    labels,
    getCommandRowEditProps
  } = useShortcutMenuModel({
    searchTerm,
    onSelect,
    onEditShortcut,
    onRecordWorkflow,
    onScheduleTask
  });

  const manageTriggerIndex = mainCommandItems.length;
  const firstManageActionIndex = manageTriggerIndex + 1;
  const submenuLogicalItems = useMemo(
    () => buildSubmenuLogicalItems(secondaryItems, managedCommandItems, showManageSection),
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

    const layout = computeSubmenuLayout({
      anchorRect: anchor.getBoundingClientRect(),
      paletteRect: palette?.getBoundingClientRect(),
      submenuItemsCount,
      hasDivider: managedCommandItems.length > 0 && secondaryItems.length > 0,
      contentScrollHeight: submenuContentRef.current?.scrollHeight
    });

    setSubmenuSide(layout.side);
    setSubmenuMaxWidth(layout.maxWidth);
    setSubmenuVerticalDirection(layout.verticalDirection);
    setSubmenuTopOffset(layout.topOffset);
    setSubmenuMaxHeight(layout.maxHeight);

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

      const action = computeNextSelection(e.key, {
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
      });

      if (action.type === 'ignore') return;

      pointerInteraction.current = false;
      e.preventDefault();
      e.stopPropagation();

      switch (action.type) {
        case 'handled':
          break;
        case 'close':
          onClose();
          break;
        case 'select':
          setSelectedIndex(action.value);
          break;
        case 'selectAndManage':
          setSelectedIndex(action.value);
          if (action.manageOpen !== undefined) setIsManageMenuOpen(action.manageOpen);
          break;
        case 'manage':
          setIsManageMenuOpen(action.open);
          if (action.selectedIndex !== undefined) setSelectedIndex(action.selectedIndex);
          break;
        case 'executeMain':
          mainCommandItems[action.index]?.onClick();
          break;
        case 'executeSubmenu':
          submenuLogicalItems[action.logicalIndex]?.item.onClick();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    mainCommandItems,
    showManageSection,
    submenuItemsCount,
    isManageMenuOpen,
    selectedIndex,
    manageTriggerIndex,
    firstManageActionIndex,
    lastManageActionIndex,
    submenuVerticalDirection,
    submenuLogicalItems,
    onClose
  ]);

  const commandScrollStyle = getCommandScrollStyle(
    showManageSection,
    mainCommandItems.length,
    rowVirtualizer.getTotalSize()
  );

  return (
    <div
      ref={paletteRef}
      className={`absolute bottom-full left-0 z-50 mb-1.5 overflow-visible ${PALETTE_SURFACE}`}
      style={PALETTE_STYLE}
    >
      <div
        role="menu"
        aria-label={labels.commandPaletteLabel}
        className={PALETTE_BODY_CLASS}
        style={PALETTE_BODY_STYLE}
      >
        <CommandList
          commandScrollRef={commandScrollRef}
          commandScrollStyle={commandScrollStyle}
          mainCommandItems={mainCommandItems}
          managedCommandItemsCount={managedCommandItems.length}
          labels={labels}
          rowVirtualizer={rowVirtualizer}
          selectedIndex={selectedIndex}
          onHoverRow={(index) => {
            pointerInteraction.current = true;
            setSelectedIndex(index);
          }}
          getCommandRowEditProps={getCommandRowEditProps}
        />

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
                  label={labels.manageLabel}
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
                <SubmenuPanel
                  visualItems={submenuVisualItems}
                  rowRefs={submenuRowRefs}
                  contentRef={submenuContentRef}
                  selectedIndex={selectedIndex}
                  firstManageActionIndex={firstManageActionIndex}
                  getCommandRowEditProps={getCommandRowEditProps}
                  onHoverRow={(menuIndex) => {
                    pointerInteraction.current = true;
                    setSelectedIndex(menuIndex);
                  }}
                  side={submenuSide}
                  topOffset={submenuTopOffset}
                  maxWidth={submenuMaxWidth}
                  maxHeight={submenuMaxHeight}
                  ariaLabel={labels.manageLabel}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
