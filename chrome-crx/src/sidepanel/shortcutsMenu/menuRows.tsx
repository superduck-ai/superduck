import type { ReactNode, Ref } from 'react';
import { Pencil } from 'lucide-react';
import { MenuIconBox } from './icons';

export function CommandRow({
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
  label: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  selected?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onEdit?: () => void;
  editAriaLabel?: string;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      data-palette-row="command"
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-1 rounded-md transition-colors duration-150 ${
        selected
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0"
      >
        <MenuIconBox>{icon}</MenuIconBox>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-normal text-foreground">{label}</div>
          {description ? (
            <div className="mt-0.5 truncate text-[10px] font-normal text-muted-foreground/95">
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
          className={`mr-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Pencil size={11} />
        </button>
      ) : null}
    </div>
  );
}

export function SecondaryMenuRow({
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
  label: ReactNode;
  icon: ReactNode;
  selected?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  trailing?: ReactNode;
  ariaHaspopup?: 'menu';
  ariaExpanded?: boolean;
  rowRef?: Ref<HTMLButtonElement>;
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
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0 ${
        selected
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
      }`}
    >
      <MenuIconBox>{icon}</MenuIconBox>
      <div className="min-w-0 flex-1 truncate text-[12px] font-normal text-foreground">{label}</div>
      {trailing ? (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:text-muted-foreground/70">
          {trailing}
        </div>
      ) : null}
    </button>
  );
}
