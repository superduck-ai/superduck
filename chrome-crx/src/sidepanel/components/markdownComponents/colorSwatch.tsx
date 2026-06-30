import React, { Children } from 'react';

export const HEX_COLOR_REGEX = /(#[0-9a-fA-F]{6})\b/;

export function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-3 border-[0.5px] border-border-200 rounded flex-shrink-0 shadow-sm mr-1 align-middle"
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
      className="bg-text-200/5 border border-0.5 border-border-300 text-danger-000 whitespace-pre-wrap rounded-[0.4rem] px-1 py-px text-[0.9rem] inline-flex items-center h-5"
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
