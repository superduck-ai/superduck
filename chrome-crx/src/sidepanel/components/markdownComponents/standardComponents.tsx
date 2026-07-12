import React, { Children, isValidElement } from 'react';
import type { Components } from 'react-markdown';
import type { MarkdownElementProps, MarkdownPreProps, MarkdownExtraProps } from './types';
import { processChildrenForSwatches } from './colorSwatch';
import { ImageShowButton, ConfirmableLink } from './linkConfirm';
import { CodeBlock } from './codeBlock';
import { InlineCode } from './inlineCode';
import { flattenChildren } from './preprocess';

let cachedStandardMarkdownComponents: Components | null = null;

export function createStandardMarkdownComponents(): Components {
  if (cachedStandardMarkdownComponents) return cachedStandardMarkdownComponents;
  cachedStandardMarkdownComponents = {
    h1: ({ node: _node, children, ...props }: MarkdownElementProps<'h1'>) => (
      <h1 className="mt-3 -mb-1 text-[1.375rem] font-bold text-foreground" {...props}>
        {processChildrenForSwatches(children)}
      </h1>
    ),
    h2: ({ node: _node, children, ...props }: MarkdownElementProps<'h2'>) => (
      <h2 className="mt-3 -mb-1 text-[1.125rem] font-bold text-foreground" {...props}>
        {processChildrenForSwatches(children)}
      </h2>
    ),
    h3: ({ node: _node, children, ...props }: MarkdownElementProps<'h3'>) => (
      <h3 className="mt-2 -mb-1 text-base font-bold text-foreground" {...props}>
        {processChildrenForSwatches(children)}
      </h3>
    ),
    h4: ({ node: _node, children, ...props }: MarkdownElementProps<'h4'>) => (
      <h4 className="mt-2 -mb-1 text-base font-bold text-foreground" {...props}>
        {processChildrenForSwatches(children)}
      </h4>
    ),
    p: ({ node: _node, children, ...props }: MarkdownElementProps<'p'>) => {
      const childArr = Children.toArray(children);
      const whitespaceClass =
        childArr.length === 1 && typeof childArr[0] === 'string' && childArr[0].includes('\n')
          ? 'whitespace-pre-wrap'
          : 'whitespace-normal';
      return (
        <p
          className={`font-superduck-response-body break-words ${whitespaceClass} leading-[1.7]`}
          {...props}
        >
          {processChildrenForSwatches(children)}
        </p>
      );
    },
    blockquote: ({ node: _node, children, ...props }: MarkdownElementProps<'blockquote'>) => (
      <blockquote
        className="ml-2 border-l-4 border-border/60 pl-4 text-muted-foreground"
        {...props}
      >
        {processChildrenForSwatches(children)}
      </blockquote>
    ),
    li: ({ node: _node, children, ...props }: MarkdownElementProps<'li'>) => (
      <li className="whitespace-normal break-words pl-2" {...props}>
        {processChildrenForSwatches(children)}
      </li>
    ),
    ul: ({ node: _node, ...props }: MarkdownElementProps<'ul'>) => (
      <ul
        className="[li_&]:mb-0 [li_&]:mt-1 [li_&]:gap-1 [&:not(:last-child)_ul]:pb-1 [&:not(:last-child)_ol]:pb-1 list-disc flex flex-col gap-1 pl-8 mb-3"
        {...props}
      />
    ),
    ol: ({ node: _node, ...props }: MarkdownElementProps<'ol'>) => (
      <ol
        className="[li_&]:mb-0 [li_&]:mt-1 [li_&]:gap-1 [&:not(:last-child)_ul]:pb-1 [&:not(:last-child)_ol]:pb-1 list-decimal flex flex-col gap-1 pl-8 mb-3"
        {...props}
      />
    ),
    img: ({
      node: _node,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & MarkdownExtraProps) => (
      <ImageShowButton {...props} />
    ),
    pre({ node: _node, children, ...props }: MarkdownPreProps) {
      const codeChild = Children.only(children);
      if (isValidElement<{ className?: string; children?: React.ReactNode }>(codeChild)) {
        const codeChildren = Children.toArray(codeChild.props.children);
        if (codeChildren.length === 1 && typeof codeChildren[0] === 'string') {
          return (
            <CodeBlock className={codeChild.props.className} {...props}>
              {codeChildren[0]}
            </CodeBlock>
          );
        }
      }
      return <pre {...props}>{children}</pre>;
    },
    code: InlineCode,
    a({
      node: _node,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & MarkdownExtraProps) {
      const linkClasses =
        'underline underline-offset-2 decoration-1 decoration-current/40 hover:decoration-current focus:decoration-current';
      return <ConfirmableLink className={linkClasses} {...props} />;
    },
    table: ({ node: _node, ...props }: MarkdownElementProps<'table'>) => (
      <div className="overflow-x-auto w-full px-2 mb-6">
        <table
          className="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal"
          {...props}
        />
      </div>
    ),
    thead: ({ node: _node, ...props }: MarkdownElementProps<'thead'>) => (
      <thead className="text-left" {...props} />
    ),
    tr: ({ node: _node, ...props }: MarkdownElementProps<'tr'>) => <tr {...props} />,
    td({ node: _node, children, ...props }: MarkdownElementProps<'td'>) {
      return (
        <td className="border-b border-border/50 py-2 pr-4 align-top" {...props}>
          {processChildrenForSwatches(flattenChildren(children))}
        </td>
      );
    },
    th({ node: _node, children, ...props }: MarkdownElementProps<'th'>) {
      return (
        <th
          className="border-b border-border py-2 pr-4 align-top font-bold text-foreground"
          {...props}
        >
          {processChildrenForSwatches(flattenChildren(children))}
        </th>
      );
    },
    hr: ({ node: _node, ...props }: MarkdownElementProps<'hr'>) => (
      <hr className="mx-1.5 my-3 border-t border-border" {...props} />
    )
  };
  return cachedStandardMarkdownComponents;
}

export const STANDARD_MARKDOWN_GRID_CLASS = 'grid-cols-1 grid [&_>_*]:min-w-0 gap-3';
