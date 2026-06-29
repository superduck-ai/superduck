import React from 'react';

/**
 * Simple Tooltip wrapper — CSS-only implementation to avoid React 19 + Radix compose-refs crash.
 * Matches bundle's se/XR component visually but uses pure CSS hover instead of Radix primitives.
 */
export function Tooltip({
  children,
  tooltipContent,
  side = 'top',
  delayDuration: _delayDuration = 200,
  open,
  showTooltip = true
}: {
  children: React.ReactNode;
  tooltipContent: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
  open?: boolean;
  showTooltip?: boolean;
}) {
  if (!showTooltip) return <>{children}</>;

  const sideClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5'
  };

  return (
    <span className="relative inline-flex group/tooltip">
      {children}
      <span
        className={`${sideClasses[side] || sideClasses.top} absolute z-[9999] rounded-lg bg-bg-500 px-2.5 py-1.5 text-xs text-text-000 shadow-md whitespace-nowrap pointer-events-none ${
          open != null
            ? open
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95 invisible'
            : 'opacity-0 scale-95 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 group-hover/tooltip:visible'
        } transition-all duration-150 ${!tooltipContent ? 'hidden' : ''}`}
        role="tooltip"
      >
        {tooltipContent}
      </span>
    </span>
  );
}
