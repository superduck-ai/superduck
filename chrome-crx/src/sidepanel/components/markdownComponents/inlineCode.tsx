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
        className={`bg-text-200/5 border border-0.5 border-border-300 text-danger-000 whitespace-pre-wrap rounded-[0.4rem] px-1 py-px text-[0.9rem] inline-flex items-center h-5 ${className || ''}`}
      >
        <ColorSwatch color={firstChild} />
        {firstChild}
      </code>
    );
  }

  return (
    <code
      {...props}
      className={`bg-text-200/5 border border-0.5 border-border-300 text-danger-000 whitespace-pre-wrap rounded-[0.4rem] px-1 py-px text-[0.9rem] ${className || ''}`}
    >
      {children}
    </code>
  );
}
