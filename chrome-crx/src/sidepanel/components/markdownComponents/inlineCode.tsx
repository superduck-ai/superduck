import React, { Children } from 'react';
import { HEX_COLOR_REGEX, ColorSwatch } from './colorSwatch';

export function InlineCode({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  if (className?.includes('math')) {
    return <span className={className}>{children}</span>;
  }

  const childArr = Children.toArray(children);
  const firstChild = childArr[0];
  if (
    typeof firstChild === 'string' &&
    firstChild === firstChild.trim() &&
    HEX_COLOR_REGEX.test(firstChild) &&
    firstChild.match(HEX_COLOR_REGEX)?.[0] === firstChild
  ) {
    return (
      <code
        {...props}
        className={`inline-flex h-5 items-center whitespace-pre-wrap rounded-md border border-border bg-muted px-1 py-px text-[0.9rem] text-foreground ${className || ''}`}
      >
        <ColorSwatch color={firstChild} />
        {firstChild}
      </code>
    );
  }

  return (
    <code
      {...props}
      className={`whitespace-pre-wrap rounded-md border border-border bg-muted px-1 py-px text-[0.9rem] text-foreground ${className || ''}`}
    >
      {children}
    </code>
  );
}
