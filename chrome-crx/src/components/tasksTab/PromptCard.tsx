import { FormattedMessage } from 'react-intl';
import { DropdownMenu, DropdownMenuItem, PenIcon, TrashIcon, VerticalDotsIcon } from '../ui';
import type { SavedPrompt } from '../../extensionServices';
import { getRunShortcutSvgMarkup } from './icons';

export function PromptCard({
  prompt,
  scheduleText,
  onEdit,
  onDelete
}: {
  prompt: SavedPrompt;
  scheduleText?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="relative group bg-bg-000 border-[0.5px] border-border-300 rounded-2xl p-4 hover:border-border-200 transition-all shadow-[0_2px_4px_0_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_0_rgba(0,0,0,0.08)] w-full cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0 text-left">
          {prompt.command && (
            <div className="font-large-bold text-text-200 relative overflow-hidden">
              <div className="whitespace-nowrap flex min-h-6 min-w-0 items-center gap-1 leading-tight">
                <span
                  aria-hidden="true"
                  className="inline-flex h-[14px] w-[14px] items-center justify-center shrink-0 text-text-500/50"
                  dangerouslySetInnerHTML={{ __html: getRunShortcutSvgMarkup(14) }}
                />
                <span className="block min-w-0">{prompt.command}</span>
              </div>
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg-000 to-transparent pointer-events-none" />
            </div>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            unstyledTrigger
            trigger={
              <button className="hide-focus-ring p-1 hover:bg-bg-200 rounded transition-colors relative z-10 opacity-0 group-hover:opacity-100">
                <VerticalDotsIcon size={16} className="text-text-300" />
              </button>
            }
          >
            <DropdownMenuItem icon={<PenIcon size={14} />} onSelect={() => onEdit()}>
              <FormattedMessage defaultMessage="Edit" id="edit_2" />
            </DropdownMenuItem>
            <DropdownMenuItem icon={<TrashIcon size={14} />} danger onSelect={() => onDelete()}>
              <FormattedMessage defaultMessage="Delete" id="delete" />
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>
      <div className="bg-bg-100 rounded-lg p-3 w-full text-left">
        <div className="text-sm text-text-300 h-24 overflow-y-auto whitespace-pre-wrap">
          {prompt.prompt}
        </div>
      </div>
      {scheduleText && (
        <div className="mt-3">
          <div className="text-text-300">
            <span className="text-xs">{scheduleText}</span>
          </div>
        </div>
      )}
    </div>
  );
}
