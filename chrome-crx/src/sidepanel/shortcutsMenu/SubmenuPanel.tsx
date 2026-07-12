import { Fragment, type CSSProperties, type MutableRefObject, type RefObject } from 'react';
import { CommandRow, SecondaryMenuRow } from './menuRows';
import type { SubmenuLogicalItem } from './buildCommandItems';
import type { CommandMenuItem } from './types';
import { PALETTE_SURFACE, VIEWPORT_PAD } from './constants';

interface CommandRowEditProps {
  onEdit: (() => void) | undefined;
  editAriaLabel: string | undefined;
}

export interface SubmenuPanelProps {
  visualItems: SubmenuLogicalItem[];
  rowRefs: MutableRefObject<(HTMLElement | null)[]>;
  contentRef: RefObject<HTMLDivElement | null>;
  selectedIndex: number;
  firstManageActionIndex: number;
  getCommandRowEditProps: (item: CommandMenuItem) => CommandRowEditProps;
  onHoverRow: (menuIndex: number) => void;
  side: 'left' | 'right';
  topOffset: number;
  maxWidth: number;
  maxHeight: number;
  ariaLabel: string;
}

export function SubmenuPanel({
  visualItems,
  rowRefs,
  contentRef,
  selectedIndex,
  firstManageActionIndex,
  getCommandRowEditProps,
  onHoverRow,
  side,
  topOffset,
  maxWidth,
  maxHeight,
  ariaLabel
}: SubmenuPanelProps) {
  const panelStyle: CSSProperties = {
    top: `${topOffset}px`,
    width: 'min(100%, max-content)',
    maxWidth: `min(${Math.max(maxWidth, 240)}px, calc(100vw - ${VIEWPORT_PAD * 2}px))`
  };

  return (
    <div
      role="menu"
      aria-label={ariaLabel}
      className={`absolute top-0 z-10 ${side === 'right' ? 'left-full pl-2' : 'right-full pr-2'}`}
      style={panelStyle}
    >
      <div className={`overflow-hidden ${PALETTE_SURFACE}`}>
        <div
          ref={contentRef}
          className="p-1.5 u-hidden-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[10px]"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          <div className="flex flex-col gap-1">
            {visualItems.map((submenuItem, visualIndex) => {
              const prev = visualIndex > 0 ? visualItems[visualIndex - 1] : null;
              const showDivider = !!prev && prev.type !== submenuItem.type;
              const menuIndex = firstManageActionIndex + submenuItem.logicalIndex;

              return (
                <Fragment key={`submenu-${submenuItem.item.key}`}>
                  {showDivider ? <div className="mx-1 my-1 border-t border-border/70" /> : null}
                  {submenuItem.type === 'managed' ? (
                    (() => {
                      const item = submenuItem.item;
                      const { onEdit, editAriaLabel } = getCommandRowEditProps(item);

                      return (
                        <CommandRow
                          rowRef={(el) => {
                            rowRefs.current[submenuItem.logicalIndex] = el;
                          }}
                          icon={item.icon}
                          label={item.label}
                          description={item.description}
                          selected={selectedIndex === menuIndex}
                          onClick={item.onClick}
                          onMouseEnter={() => onHoverRow(menuIndex)}
                          onEdit={onEdit}
                          editAriaLabel={editAriaLabel}
                        />
                      );
                    })()
                  ) : (
                    <SecondaryMenuRow
                      id={`palette-sub-${submenuItem.item.key}`}
                      rowRef={(el) => {
                        rowRefs.current[submenuItem.logicalIndex] = el;
                      }}
                      icon={submenuItem.item.icon}
                      label={submenuItem.item.label}
                      selected={selectedIndex === menuIndex}
                      onClick={submenuItem.item.onClick}
                      onMouseEnter={() => onHoverRow(menuIndex)}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
