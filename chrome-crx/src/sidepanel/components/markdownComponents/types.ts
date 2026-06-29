import type * as React from 'react';

export type MarkdownExtraProps = {
  node?: unknown;
};

export type MarkdownElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<Tag> & MarkdownExtraProps;

export type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> &
  MarkdownExtraProps & {
    inline?: boolean;
    children?: React.ReactNode;
  };

export type MarkdownPreProps = React.ComponentPropsWithoutRef<'pre'> &
  MarkdownExtraProps & {
    children?: React.ReactNode;
  };

export type RemarkMathPlugin = typeof import('remark-math').default;
export type RehypeKatexPlugin = typeof import('rehype-katex').default;
export type RehypeKatexOptions = import('rehype-katex').Options;
