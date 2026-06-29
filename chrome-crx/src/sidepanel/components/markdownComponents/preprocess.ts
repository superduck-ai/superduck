import type * as React from 'react';

export function flattenChildren(children: React.ReactNode): React.ReactNode {
  return children;
}

function normalizeBullets(text: string): string {
  return text.replace(/(^|\n)(\s?)•(\s?)/g, '$1$2- ');
}

function normalizeCodeFences(text: string): string {
  const firstFence = text.indexOf('```');
  if (firstFence === -1 || text.indexOf('```', firstFence + 3) === -1) return text;

  return text.replace(/^(\s*)(```+)/gm, '$2');
}

export function preprocessMarkdownText(text: string): string {
  let result = normalizeBullets(text);
  result = normalizeCodeFences(result);
  return result;
}
