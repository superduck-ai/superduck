import React from 'react';
import { ChevronDown, Hand, ShieldAlert } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui';
import type { PermissionMode } from '../sidepanelUtils';

/** Metadata for a selectable permission mode shown in the composer dropdown. */
export type PermissionModeOption = {
  value: PermissionMode;
  labelId: string;
  labelDefault: string;
  descriptionId: string;
  descriptionDefault: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

/** Built-in permission modes for the side panel composer. */
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: 'follow_a_plan',
    labelId: 'ask_before_acting',
    labelDefault: 'Request approval',
    descriptionId: 'superduck_aligns_on_its_approach_before_taking_actions',
    descriptionDefault: 'Always ask before editing external files or using the internet',
    Icon: Hand
  },
  {
    value: 'skip_all_permission_checks',
    labelId: 'act_without_asking',
    labelDefault: 'Full access',
    descriptionId: 'superduck_takes_actions_without_asking_for_permission',
    descriptionDefault: 'Unrestricted access to the internet and files on this computer',
    Icon: ShieldAlert
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
  showBlockedSkipHint = false
}: PermissionModeMenuProps) {
  const intl = useIntl();
  const selectedOption =
    PERMISSION_MODE_OPTIONS.find((option) => option.value === permissionMode) ??
    PERMISSION_MODE_OPTIONS[0];
  const selectedLabel = intl.formatMessage({
    id: selectedOption.labelId,
    defaultMessage: selectedOption.labelDefault
  });
  const isHighRiskMode = permissionMode === 'skip_all_permission_checks';
  const TriggerIcon = isHighRiskMode ? ShieldAlert : Hand;
  const triggerLabel = intl.formatMessage(
    {
      id: 'permission_mode_trigger_label',
      defaultMessage: 'Permission mode: {mode}'
    },
    { mode: selectedLabel }
  );

  return (
    <div>
      <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'superduck-composer-permission-button max-w-[min(10rem,calc(100vw-9.5rem))] bg-transparent text-[13px] font-medium shadow-none transition-colors',
                isHighRiskMode
                  ? 'text-warning hover:!bg-warning/10 hover:!text-warning hover:*:!text-warning focus:!text-warning focus:*:!text-warning aria-expanded:!bg-warning/10 aria-expanded:!text-warning aria-expanded:*:!text-warning'
                  : 'text-muted-foreground hover:bg-muted/45 hover:text-foreground'
              )}
              data-permission-mode={isHighRiskMode ? 'full-access' : 'request-approval'}
              aria-label={triggerLabel}
            />
          }
        >
          <TriggerIcon
            strokeWidth={1.8}
            className={cn(
              'superduck-composer-standard-icon',
              isHighRiskMode ? 'text-warning' : 'text-muted-foreground'
            )}
          />
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown
            strokeWidth={1.8}
            className={cn(
              'superduck-composer-indicator-icon shrink-0 transition-transform',
              isOpen && 'rotate-180',
              isHighRiskMode ? 'text-warning' : 'text-muted-foreground'
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[min(240px,calc(100vw-1.5rem))] p-1 backdrop-blur-md"
          side="top"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuRadioGroup
            value={permissionMode}
            onValueChange={(value) => {
              onSelect(value as PermissionMode);
              onOpenChange(false);
            }}
          >
            {options.map((option) => {
              const isSelected = permissionMode === option.value;
              const Icon = option.Icon;
              const isFullAccess = option.value === 'skip_all_permission_checks';

              return (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus:bg-muted/40',
                    isSelected
                      ? 'text-foreground bg-muted/30'
                      : 'text-muted-foreground hover:text-foreground',
                    isFullAccess &&
                      '!text-warning hover:!text-warning focus:!text-warning data-[focus]:!text-warning data-[highlighted]:!text-warning focus:**:!text-warning hover:**:!text-warning data-[focus]:**:!text-warning data-[highlighted]:**:!text-warning'
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    <Icon
                      size={14}
                      strokeWidth={1.8}
                      className={cn(isFullAccess && '!text-warning')}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'truncate whitespace-nowrap text-xs font-semibold leading-snug',
                        isFullAccess ? '!text-warning' : ''
                      )}
                    >
                      {intl.formatMessage({
                        id: option.labelId,
                        defaultMessage: option.labelDefault
                      })}
                    </div>
                    <div className="mt-0.5 text-[10px] font-normal leading-normal text-muted-foreground/80">
                      {intl.formatMessage({
                        id: option.descriptionId,
                        defaultMessage: option.descriptionDefault
                      })}
                    </div>
                  </div>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <div className="px-2 py-0.5 flex items-center justify-between text-[10px] text-muted-foreground/75 leading-tight select-none">
            {showBlockedSkipHint ? (
              <span className="truncate pr-2">
                <FormattedMessage
                  id="act_without_asking_is_unavailable_on_blocked_pages"
                  defaultMessage="Unavailable on blocked pages."
                />
              </span>
            ) : (
              <span className="truncate">
                <FormattedMessage
                  id="permission_mode_menu_footer_title"
                  defaultMessage="Approval settings"
                />
              </span>
            )}
            <a
              href="https://superduck-ai.github.io/superduck/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground shrink-0 transition-colors"
            >
              <FormattedMessage id="learn_more" defaultMessage="Learn more" />
            </a>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
