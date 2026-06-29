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
        'w-full font-base flex min-w-[75px] px-[14px] py-[3px] justify-between items-center gap-2 rounded-lg border-[0.5px] transition-colors font-medium h-9 ' +
        (isActive
          ? 'text-text-100 bg-bg-300 border-border-400'
          : isPrimary
            ? 'bg-text-000 text-bg-000 border-text-000 hover:bg-text-100'
            : 'text-text-100 border-border-200 hover:bg-bg-100')
      }
    >
      {children}
    </button>
  );
}
