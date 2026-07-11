import type React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { CommandMenuItem } from './types';
import { SCROLL_CHROME } from './paletteChrome';
import { CommandRow } from './menuRows';

interface CommandListProps {
  commandScrollRef: React.Ref<HTMLDivElement>;
  commandScrollStyle: React.CSSProperties | undefined;
  mainCommandItems: CommandMenuItem[];
  managedCommandItemsCount: number;
  labels: {
    commandsInsideManageLabel: string;
    noCommandsLabel: string;
  };
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  selectedIndex: number;
  onHoverRow: (index: number) => void;
  getCommandRowEditProps: (item: CommandMenuItem) => {
    onEdit: (() => void) | undefined;
    editAriaLabel: string | undefined;
  };
}

export function CommandList({
  commandScrollRef,
  commandScrollStyle,
  mainCommandItems,
  managedCommandItemsCount,
  labels,
  rowVirtualizer,
  selectedIndex,
  onHoverRow,
  getCommandRowEditProps
}: CommandListProps) {
  return (
    <div
      ref={commandScrollRef}
      className={`${SCROLL_CHROME} rounded-[10px]`}
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
                  onMouseEnter={() => onHoverRow(vi.index)}
                  onEdit={onEdit}
                  editAriaLabel={editAriaLabel}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[10px] px-2 py-2 text-[11px] text-muted-foreground">
          {managedCommandItemsCount > 0 ? labels.commandsInsideManageLabel : labels.noCommandsLabel}
        </div>
      )}
    </div>
  );
}
