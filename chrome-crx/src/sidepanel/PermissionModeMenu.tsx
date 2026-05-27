import React from 'react';
import { Check, ChevronDown, ChevronsRight, Hand } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { PermissionMode } from './sidepanelUtils';

/** Metadata for a selectable permission mode shown in the composer dropdown. */
export type PermissionModeOption = {
  value: PermissionMode;
  labelId: string;
  labelDefault: string;
  descriptionId: string;
  descriptionDefault: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

/** Built-in permission modes for the side panel composer. */
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: 'follow_a_plan',
    labelId: 'ask_before_acting',
    labelDefault: 'Ask before acting',
    descriptionId: 'superduck_aligns_on_its_approach_before_taking_actions',
    descriptionDefault: 'SuperDuck aligns on its approach before taking actions',
    Icon: Hand
  },
  {
    value: 'skip_all_permission_checks',
    labelId: 'act_without_asking',
    labelDefault: 'Act without asking',
    descriptionId: 'superduck_takes_actions_without_asking_for_permission',
    descriptionDefault: 'SuperDuck takes actions without asking for permission',
    Icon: ChevronsRight
  }
];

export type PermissionModeMenuProps = {
  /** Currently active permission mode. */
  permissionMode: PermissionMode;
  /** Modes rendered in the dropdown (may omit skip-all on blocked pages). */
  options: PermissionModeOption[];
  /** Whether the dropdown panel is open. */
  isOpen: boolean;
  /** Toggle the dropdown open state. */
  onOpenChange: (open: boolean) => void;
  /** Persist the user's permission mode selection. */
  onSelect: (mode: PermissionMode) => void;
  /** When true, show copy that skip-all is unavailable on this page. */
  showBlockedSkipHint?: boolean;
  /** Ref attached to the menu root for outside-click dismissal. */
  menuRef?: React.RefObject<HTMLDivElement | null>;
};

/**
 * Compact permission-mode selector rendered in the side panel chat composer.
 * Typography matches the 11px trigger and other dropdown menus.
 */
export function PermissionModeMenu({
  permissionMode,
  options,
  isOpen,
  onOpenChange,
  onSelect,
  showBlockedSkipHint = false,
  menuRef
}: PermissionModeMenuProps) {
  const intl = useIntl();
  const selectedOption =
    PERMISSION_MODE_OPTIONS.find((option) => option.value === permissionMode) ??
    PERMISSION_MODE_OPTIONS[0];
  const selectedLabel = intl.formatMessage({
    id: selectedOption.labelId,
    defaultMessage: selectedOption.labelDefault
  });
  const TriggerIcon = permissionMode === 'follow_a_plan' ? Hand : ChevronsRight;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!isOpen)}
        className="inline-flex items-center gap-1.5 h-7 rounded-lg border border-border-300 bg-bg-000 px-2 text-[11px] text-text-200 hover:bg-bg-200 transition-colors"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Permission mode"
        title="Permission mode"
      >
        <TriggerIcon size={12} className="text-text-300" />
        <span>{selectedLabel}</span>
        <ChevronDown size={12} className="text-text-300" />
      </button>
      {isOpen ? (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-max min-w-[200px] max-w-[280px] bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
          {options.map((option) => {
            const isSelected = permissionMode === option.value;
            const Icon = option.Icon;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  onOpenChange(false);
                }}
                className={`w-full min-h-8 px-2 py-1.5 rounded-lg text-left flex items-start gap-2 transition-colors ${isSelected ? 'bg-bg-200' : 'hover:bg-bg-200'}`}
              >
                <div className="shrink-0 mt-px">
                  <Icon size={12} className="text-text-300" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="text-[11px] font-medium leading-snug text-text-200 whitespace-nowrap truncate">
                    {intl.formatMessage({
                      id: option.labelId,
                      defaultMessage: option.labelDefault
                    })}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-text-400 whitespace-nowrap truncate">
                    {intl.formatMessage({
                      id: option.descriptionId,
                      defaultMessage: option.descriptionDefault
                    })}
                  </div>
                </div>
                <div className="shrink-0 self-center">
                  {isSelected ? <Check size={12} className="text-accent-secondary-200" /> : null}
                </div>
              </button>
            );
          })}
          {showBlockedSkipHint ? (
            <p className="px-2 pt-1.5 text-[10px] leading-snug text-text-300">
              <FormattedMessage
                id="LStwu4n1yT_blocked"
                defaultMessage="Act without asking is unavailable on blocked pages."
              />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
