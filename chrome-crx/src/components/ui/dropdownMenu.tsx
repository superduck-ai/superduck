import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DROPDOWN_ITEM_BASE_CLASS =
  'font-base min-h-8 px-2 py-1.5 rounded-lg cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis grid grid-cols-[minmax(0,_1fr)_auto] gap-2 items-center outline-none select-none hover:bg-bg-200 hover:text-text-000';

export function DropdownMenu({
  trigger,
  children,
  unstyledTrigger = false
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  unstyledTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  void unstyledTrigger;

  type ClosableDropdownMenuItemProps = {
    __closeMenu?: () => void;
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-bg-000 border-0.5 border-border-200 backdrop-blur-xl rounded-xl min-w-[8rem] text-text-300 shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5">
          {React.Children.map(children, (child) =>
            React.isValidElement<ClosableDropdownMenuItemProps>(child)
              ? React.cloneElement(child, {
                  __closeMenu: () => setOpen(false)
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

export function DropdownMenuItem({
  icon,
  children,
  onSelect,
  danger,
  trailing,
  __closeMenu
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
  __closeMenu?: () => void;
}) {
  return (
    <div
      className={cn(DROPDOWN_ITEM_BASE_CLASS, danger && '!text-danger-000 hover:bg-danger-900')}
      onClick={() => {
        onSelect?.();
        __closeMenu?.();
      }}
    >
      {icon || trailing ? (
        <div className="flex items-center gap-2 w-full font-base group">
          {icon}
          <span className="flex-1 truncate">{children}</span>
          {trailing && <div className="flex items-center flex-shrink-0 -mr-2">{trailing}</div>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
