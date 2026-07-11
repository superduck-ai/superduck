import React, { Children } from 'react';

export const HEX_COLOR_REGEX = /(#[0-9a-fA-F]{6})\b/;

export function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="mr-1 inline-block h-3 w-3 flex-shrink-0 rounded border border-border align-middle shadow-sm"
      style={{ backgroundColor: color }}
    />
  );
}

function processColorSwatches(
  text: string,
  inText: boolean,
  fallbackCodeRender: (color: string, key: number) => React.ReactNode
): React.ReactNode[] {
  return text.split(HEX_COLOR_REGEX).map((segment, index) => {
    if (index % 2 === 1) {
      if (inText) {
        return (
          <React.Fragment key={index}>
            <ColorSwatch color={segment} />
            {segment}
          </React.Fragment>
        );
      }
      return fallbackCodeRender(segment, index);
    }
    return segment;
  });
}

function renderCodeWithSwatch(color: string, key: number) {
  return (
    <code
      className="inline-flex h-5 items-center whitespace-pre-wrap rounded-md border border-border bg-muted px-1 py-px text-[0.9rem] text-foreground"
      key={key}
    >
      <ColorSwatch color={color} />
      {color}
    </code>
  );
}

export function processChildrenForSwatches(
  children: React.ReactNode,
  inText: boolean = false
): React.ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return processColorSwatches(child, inText, renderCodeWithSwatch);
    }
    return child;
  });
}
