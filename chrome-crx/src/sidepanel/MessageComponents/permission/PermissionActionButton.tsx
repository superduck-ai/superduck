import React from 'react';

export function PermissionActionButton({
  onClick,
  children,
  isPrimary,
  isActive
}: {
  onClick: () => void;
  children: React.ReactNode;
  isPrimary?: boolean;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex h-9 w-full min-w-[75px] items-center justify-between gap-2 rounded-lg border-[0.5px] px-[14px] py-[3px] text-sm font-medium leading-[1.4] transition-colors ' +
        (isActive
          ? 'text-foreground bg-accent border-border'
          : isPrimary
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
            : 'text-foreground border-border hover:bg-muted')
      }
    >
      {children}
    </button>
  );
}
