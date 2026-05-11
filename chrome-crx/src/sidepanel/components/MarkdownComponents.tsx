import React, { useState, useCallback, useMemo, Children, isValidElement } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check, Copy } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { PluggableList } from 'unified';

type MarkdownExtraProps = {
  node?: unknown;
};

type MarkdownElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<Tag> & MarkdownExtraProps;

type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> &
  MarkdownExtraProps & {
    inline?: boolean;
    children?: React.ReactNode;
  };

type MarkdownPreProps = React.ComponentPropsWithoutRef<'pre'> &
  MarkdownExtraProps & {
    children?: React.ReactNode;
  };

type RemarkMathPlugin = typeof import('remark-math').default;
type RehypeKatexPlugin = typeof import('rehype-katex').default;
type RehypeKatexOptions = import('rehype-katex').Options;

// =============================================================================
// Copy to clipboard hook (matches bundle's useCopyToClipboard)
// =============================================================================

function useCopyToClipboard() {
  const [didCopy, setDidCopy] = useState(false);
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | undefined>(undefined);

  const copyToClipboard = useCallback(
    async (input: string | { text: string; html?: string }) => {
      const onSuccess = () => {
        setDidCopy(true);
        setTimeoutId(setTimeout(() => setDidCopy(false), 2000));
      };

      let text: string;
      let html: string | undefined;

      if (timeoutId) clearTimeout(timeoutId);

      if (typeof input === 'string') {
        text = input.trim();
      } else if (input && typeof input === 'object') {
        text = input.text.trim();
        html = input.html;
      } else {
        throw new Error('Invalid clipboard input; no plain text provided');
      }

      try {
        if (html) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/plain': new Blob([text], { type: 'text/plain' }),
                'text/html': new Blob([html], { type: 'text/html' })
              })
            ]);
            onSuccess();
            return;
          } catch {
            // fallback to text-only
          }
        }
        await navigator.clipboard.writeText(text);
        onSuccess();
      } catch (err) {
        console.error('Clipboard copy failed', err);
      }
    },
    [timeoutId]
  );

  return { didCopy, copyToClipboard };
}

// =============================================================================
// Dark/light syntax highlighting themes (bundle's Mf/Sf)
// =============================================================================

const darkTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: 'hsl(220, 15%, 93%)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)'
  },
  'pre[class*="language-"]': {
    color: 'hsl(220, 15%, 93%)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)'
  },
  comment: { color: 'hsl(220, 10%, 55%)' },
  prolog: { color: 'hsl(220, 10%, 55%)' },
  doctype: { color: 'hsl(220, 10%, 55%)' },
  cdata: { color: 'hsl(220, 10%, 55%)' },
  punctuation: { color: 'hsl(220, 15%, 85%)' },
  keyword: { color: 'hsl(280, 85%, 72%)' },
  'keyword-control': { color: 'hsl(280, 85%, 72%)' },
  'keyword-operator': { color: 'hsl(280, 85%, 72%)' },
  string: { color: 'hsl(95, 75%, 65%)' },
  char: { color: 'hsl(95, 75%, 65%)' },
  'template-string': { color: 'hsl(95, 75%, 65%)' },
  regex: { color: 'hsl(95, 70%, 63%)' },
  'attr-value': { color: 'hsl(95, 75%, 65%)' },
  number: { color: 'hsl(180, 80%, 65%)' },
  boolean: { color: 'hsl(180, 80%, 65%)' },
  constant: { color: 'hsl(180, 80%, 65%)' },
  symbol: { color: 'hsl(180, 80%, 65%)' },
  property: { color: 'hsl(355, 85%, 72%)' },
  tag: { color: 'hsl(355, 85%, 72%)' },
  'attr-name': { color: 'hsl(355, 80%, 70%)' },
  selector: { color: 'hsl(355, 85%, 72%)' },
  function: { color: 'hsl(210, 100%, 72%)' },
  'function-name': { color: 'hsl(210, 100%, 72%)' },
  method: { color: 'hsl(210, 100%, 72%)' },
  'function-method': { color: 'hsl(210, 100%, 72%)' },
  variable: { color: 'hsl(30, 95%, 68%)' },
  parameter: { color: 'hsl(30, 90%, 67%)' },
  'class-name': { color: 'hsl(30, 95%, 68%)' },
  type: { color: 'hsl(30, 95%, 68%)' },
  'type-builtin': { color: 'hsl(30, 95%, 68%)' },
  builtin: { color: 'hsl(30, 95%, 68%)' },
  operator: { color: 'hsl(220, 15%, 93%)' },
  important: { color: 'hsl(355, 85%, 72%)', fontWeight: 'bold' },
  deleted: { color: 'hsl(355, 85%, 72%)' },
  inserted: { color: 'hsl(95, 75%, 65%)' },
  entity: { color: 'hsl(180, 80%, 65%)' },
  url: { color: 'hsl(180, 80%, 65%)' },
  namespace: { color: 'hsl(220, 15%, 85%)' },
  atrule: { color: 'hsl(280, 85%, 72%)' },
  'maybe-class-name': { color: 'hsl(30, 95%, 68%)' }
};

const lightTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: 'hsl(220, 20%, 10%)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)'
  },
  'pre[class*="language-"]': {
    color: 'hsl(220, 20%, 10%)',
    background: 'transparent',
    fontFamily: 'var(--font-mono)'
  },
  comment: { color: 'hsl(220, 10%, 48%)' },
  prolog: { color: 'hsl(220, 10%, 48%)' },
  doctype: { color: 'hsl(220, 10%, 48%)' },
  cdata: { color: 'hsl(220, 10%, 48%)' },
  punctuation: { color: 'hsl(220, 15%, 20%)' },
  keyword: { color: 'hsl(280, 100%, 38%)' },
  'keyword-control': { color: 'hsl(280, 100%, 38%)' },
  'keyword-operator': { color: 'hsl(280, 100%, 38%)' },
  string: { color: 'hsl(120, 100%, 25%)' },
  char: { color: 'hsl(120, 100%, 25%)' },
  'template-string': { color: 'hsl(120, 100%, 25%)' },
  regex: { color: 'hsl(120, 90%, 27%)' },
  'attr-value': { color: 'hsl(120, 100%, 25%)' },
  number: { color: 'hsl(180, 100%, 25%)' },
  boolean: { color: 'hsl(180, 100%, 25%)' },
  constant: { color: 'hsl(180, 100%, 25%)' },
  symbol: { color: 'hsl(180, 100%, 25%)' },
  property: { color: 'hsl(355, 90%, 38%)' },
  tag: { color: 'hsl(355, 90%, 38%)' },
  'attr-name': { color: 'hsl(355, 85%, 40%)' },
  selector: { color: 'hsl(355, 90%, 38%)' },
  function: { color: 'hsl(215, 100%, 38%)' },
  'function-name': { color: 'hsl(215, 100%, 38%)' },
  method: { color: 'hsl(215, 100%, 38%)' },
  'function-method': { color: 'hsl(215, 100%, 38%)' },
  variable: { color: 'hsl(25, 100%, 35%)' },
  parameter: { color: 'hsl(25, 95%, 37%)' },
  'class-name': { color: 'hsl(25, 100%, 35%)' },
  type: { color: 'hsl(25, 100%, 35%)' },
  'type-builtin': { color: 'hsl(25, 100%, 35%)' },
  builtin: { color: 'hsl(25, 100%, 35%)' },
  operator: { color: 'hsl(220, 20%, 10%)' },
  important: { color: 'hsl(355, 90%, 38%)', fontWeight: 'bold' },
  deleted: { color: 'hsl(355, 90%, 38%)' },
  inserted: { color: 'hsl(120, 100%, 25%)' },
  entity: { color: 'hsl(180, 100%, 25%)' },
  url: { color: 'hsl(180, 100%, 25%)' },
  namespace: { color: 'hsl(220, 15%, 20%)' },
  atrule: { color: 'hsl(280, 100%, 38%)' },
  'maybe-class-name': { color: 'hsl(25, 100%, 35%)' }
};

// =============================================================================
// Color swatch detection (bundle's Xg/ey/ty/ny/ry)
// =============================================================================

const HEX_COLOR_REGEX = /(#[0-9a-fA-F]{6})\b/;

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-3 border-[0.5px] border-border-200 rounded flex-shrink-0 shadow-sm mr-1 align-middle"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * Split text into segments, replacing hex color codes with color swatches.
 * When `inText` is true, renders swatch inline. When false (in code), wraps in code element.
 */
function processColorSwatches(
  text: string,
  inText: boolean,
  fallbackCodeRender: (color: string, key: number) => React.ReactNode
): React.ReactNode[] {
  return text.split(HEX_COLOR_REGEX).map((segment, index) => {
    if (index % 2 === 1) {
      // This is a hex color match
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

/**
 * Process children to detect and render hex color swatches (bundle's ry)
 */
function processChildrenForSwatches(
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

// =============================================================================
// Theme detection helper
// =============================================================================

function useCodeStyle() {
  // Check for dark mode via media query since we may not have ThemeProvider context
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
    return true;
  });

  // Listen for theme changes - only use media query listener to reduce CPU usage
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);

    // Check initial state once
    setIsDark(
      document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  return isDark ? darkTheme : lightTheme;
}

// =============================================================================
// Code block component (bundle's Qg.pre — lines 13305-13396)
// =============================================================================

const CODE_SIZE_LIMIT = 204800; // 200KB

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const { didCopy, copyToClipboard } = useCopyToClipboard();
  const codeStyle = useCodeStyle();

  const langMatch = /language-(\w+)/.exec(className || '');
  const language = langMatch?.[1]?.toLowerCase() || '';
  const code = children.trimEnd();

  const exceedsSizeLimit = useMemo(
    () => (code ? new Blob([code]).size : 0) > CODE_SIZE_LIMIT,
    [code]
  );

  return (
    <div className="code-block-root relative group/copy bg-bg-000/50 border-0.5 border-border-400 rounded-lg">
      {/* Copy button + language label (sticky, appears on hover) */}
      <div className="sticky opacity-0 group-hover/copy:opacity-100 top-2 py-2 h-12 w-0 float-right">
        <div className="absolute right-0 h-8 px-2 items-center inline-flex z-10">
          <button
            aria-label="Copy to clipboard"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md backdrop-blur-md text-text-300 hover:text-text-100 hover:bg-bg-200 transition-colors"
            onClick={() => copyToClipboard(code)}
          >
            {didCopy ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      {langMatch && <div className="text-text-500 font-small p-3.5 pb-0">{langMatch[1]}</div>}
      <div className="overflow-x-auto">
        {exceedsSizeLimit ? (
          <div>
            <div
              className={`${langMatch ? 'mt-3.5' : 'rounded-t-lg h-12'} px-1.5 flex items-center gap-2 text-xs text-text-300`}
            >
              <span>Syntax highlighting has been disabled due to code size.</span>
            </div>
            <pre className="flex-1 overflow-auto">
              <code className="code-block__code !my-0 !rounded-lg !text-sm !leading-relaxed p-3.5">
                {code}
              </code>
            </pre>
          </div>
        ) : (
          <SyntaxHighlighter
            className="code-block__code !my-0 !rounded-lg !text-sm !leading-relaxed p-3.5"
            language={langMatch ? langMatch[1] : ''}
            style={codeStyle}
            wrapLongLines={!langMatch}
            customStyle={{ background: 'transparent', margin: 0, padding: '0.875rem' }}
            codeTagProps={{ style: {} }}
          >
            {code}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Inline code component (bundle's Qg.code — lines 13397-13403)
// =============================================================================

function InlineCode({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  // If math class, pass through
  if (className?.includes('math')) {
    return <span className={className}>{children}</span>;
  }

  // Check for single hex color code
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

// =============================================================================
// Image show button (bundle's iy — lines 13687-13705)
// =============================================================================

function ImageShowButton({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!src || typeof src !== 'string') {
    return <img {...props} src={src} />;
  }

  const openImage = () => window.open(src, '_blank');

  return (
    <>
      <button
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            openImage();
          } else {
            setShowConfirm(true);
          }
        }}
        className="bg-bg-300 border-border-300 font-ui text-text-300 inline-block grid h-32 w-40 items-center justify-items-center rounded-xl border p-4"
      >
        Show Image
      </button>
      {showConfirm && (
        <LinkConfirmationModal
          url={src}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            openImage();
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}

// =============================================================================
// Link confirmation modal (bundle's Cf — used by oy)
// =============================================================================

function LinkConfirmationModal({
  url,
  onClose,
  onConfirm
}: {
  url: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-bg-100 rounded-lg p-6 max-w-md mx-4 shadow-xl border border-border-300"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-text-100 font-bold mb-2">Open external link?</h3>
        <p className="text-text-300 text-sm mb-4 break-all">{url}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-bg-300 text-text-100 hover:bg-bg-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-md bg-accent-main-100 text-white hover:bg-accent-main-200"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Link component with confirmation (bundle's oy — lines 13706-13743)
// =============================================================================

function isRelativePath(href: string): boolean {
  if (href.startsWith('/') || href.startsWith('http://') || href.startsWith('https://'))
    return false;
  if (href.startsWith('./') || href.startsWith('../')) return true;
  try {
    new URL(href);
    return false;
  } catch {
    return /\.[a-zA-Z0-9]+$/.test(href) || href.includes('/');
  }
}

function ConfirmableLink({
  href,
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!href) return <a {...props}>{children}</a>;

  if (isRelativePath(href)) {
    return <span className={`underline ${className || ''}`}>{children}</span>;
  }

  const openLink = () => window.open(href, '_blank');

  return (
    <>
      <a
        className={`underline ${className || ''}`}
        onClick={(e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            e.preventDefault();
            openLink();
            return;
          }
          e.preventDefault();
          setShowConfirm(true);
        }}
        href={href}
        {...props}
      >
        {children}
      </a>
      {showConfirm && (
        <LinkConfirmationModal
          url={href}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            openLink();
            setShowConfirm(false);
          }}
        />
      )}
    </>
  );
}

// =============================================================================
// Utility to flatten children for table cells (bundle's $o)
// =============================================================================

function flattenChildren(children: React.ReactNode): React.ReactNode {
  return children;
}

// =============================================================================
// Markdown text preprocessing (bundle's sy, lines 13448-13531)
// =============================================================================

/**
 * Replace bullet character (•) with markdown list syntax (- )
 */
function normalizeBullets(text: string): string {
  return text.replace(/(^|\n)(\s?)•(\s?)/g, '$1$2- ');
}

/**
 * Normalize nested code fences so inner fences use fewer backticks than outer ones.
 * (Simplified version of bundle's code fence normalization — lines 13453-13531)
 */
function normalizeCodeFences(text: string): string {
  const firstFence = text.indexOf('```');
  if (firstFence === -1 || text.indexOf('```', firstFence + 3) === -1) return text;

  // Strip leading indentation from code fences (bundle line 13531)
  return text.replace(/^(\s*)(```+)/gm, '$2');
}

/**
 * Preprocess markdown text before rendering, matching bundle's S useMemo (lines 13447-13531).
 */
export function preprocessMarkdownText(text: string): string {
  let result = normalizeBullets(text);
  result = normalizeCodeFences(result);
  return result;
}

// =============================================================================
// Standard Markdown components factory (bundle's sy — lines 13412-13685)
// =============================================================================

/**
 * Create the full set of ReactMarkdown component overrides matching the bundle.
 * This is the equivalent of bundle's `_` useMemo in sy (lines 13532-13660).
 */
// Cache markdown components — they are stateless, so a single instance can be reused
// across all renders. Creating new objects every render causes ReactMarkdown to
// re-parse and re-render all markdown content.
let cachedStandardMarkdownComponents: Components | null = null;

export function createStandardMarkdownComponents(): Components {
  if (cachedStandardMarkdownComponents) return cachedStandardMarkdownComponents;
  cachedStandardMarkdownComponents = {
    h1: ({ node, children, ...props }: MarkdownElementProps<'h1'>) => (
      <h1 className="text-text-100 mt-3 -mb-1 text-[1.375rem] font-bold" {...props}>
        {processChildrenForSwatches(children)}
      </h1>
    ),
    h2: ({ node, children, ...props }: MarkdownElementProps<'h2'>) => (
      <h2 className="text-text-100 mt-3 -mb-1 text-[1.125rem] font-bold" {...props}>
        {processChildrenForSwatches(children)}
      </h2>
    ),
    h3: ({ node, children, ...props }: MarkdownElementProps<'h3'>) => (
      <h3 className="text-text-100 mt-2 -mb-1 text-base font-bold" {...props}>
        {processChildrenForSwatches(children)}
      </h3>
    ),
    h4: ({ node, children, ...props }: MarkdownElementProps<'h4'>) => (
      <h4 className="text-text-100 mt-2 -mb-1 text-base font-bold" {...props}>
        {processChildrenForSwatches(children)}
      </h4>
    ),
    p: ({ node, children, ...props }: MarkdownElementProps<'p'>) => {
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
    blockquote: ({ node, children, ...props }: MarkdownElementProps<'blockquote'>) => (
      <blockquote className="ml-2 border-l-4 border-border-300/10 pl-4 text-text-300" {...props}>
        {processChildrenForSwatches(children)}
      </blockquote>
    ),
    li: ({ node, children, ...props }: MarkdownElementProps<'li'>) => (
      <li className="whitespace-normal break-words pl-2" {...props}>
        {processChildrenForSwatches(children)}
      </li>
    ),
    ul: ({ node, ...props }: MarkdownElementProps<'ul'>) => (
      <ul
        className="[li_&]:mb-0 [li_&]:mt-1 [li_&]:gap-1 [&:not(:last-child)_ul]:pb-1 [&:not(:last-child)_ol]:pb-1 list-disc flex flex-col gap-1 pl-8 mb-3"
        {...props}
      />
    ),
    ol: ({ node, ...props }: MarkdownElementProps<'ol'>) => (
      <ol
        className="[li_&]:mb-0 [li_&]:mt-1 [li_&]:gap-1 [&:not(:last-child)_ul]:pb-1 [&:not(:last-child)_ol]:pb-1 list-decimal flex flex-col gap-1 pl-8 mb-3"
        {...props}
      />
    ),
    img: ({ node, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & MarkdownExtraProps) => (
      <ImageShowButton {...props} />
    ),
    pre({ node, children, ...props }: MarkdownPreProps) {
      // Extract the single <code> child's text content
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
      // Fallback for unexpected pre content
      return <pre {...props}>{children}</pre>;
    },
    code: InlineCode,
    a({ node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & MarkdownExtraProps) {
      const linkClasses =
        'underline underline-offset-2 decoration-1 decoration-current/40 hover:decoration-current focus:decoration-current';
      return <ConfirmableLink className={linkClasses} {...props} />;
    },
    table: ({ node, ...props }: MarkdownElementProps<'table'>) => (
      <div className="overflow-x-auto w-full px-2 mb-6">
        <table
          className="min-w-full border-collapse text-sm leading-[1.7] whitespace-normal"
          {...props}
        />
      </div>
    ),
    thead: ({ node, ...props }: MarkdownElementProps<'thead'>) => (
      <thead className="text-left" {...props} />
    ),
    tr: ({ node, ...props }: MarkdownElementProps<'tr'>) => <tr {...props} />,
    td({ node, children, ...props }: MarkdownElementProps<'td'>) {
      return (
        <td className="border-b-0.5 border-border-300/30 py-2 pr-4 align-top" {...props}>
          {processChildrenForSwatches(flattenChildren(children))}
        </td>
      );
    },
    th({ node, children, ...props }: MarkdownElementProps<'th'>) {
      return (
        <th
          className="text-text-100 border-b-0.5 border-border-300/60 py-2 pr-4 align-top font-bold"
          {...props}
        >
          {processChildrenForSwatches(flattenChildren(children))}
        </th>
      );
    },
    hr: ({ node, ...props }: MarkdownElementProps<'hr'>) => (
      <hr className="border-border-200 border-t-0.5 my-3 mx-1.5" {...props} />
    )
  };
  return cachedStandardMarkdownComponents;
}

/**
 * The grid layout class for standard markdown (bundle's _o, line 2953)
 */
export const STANDARD_MARKDOWN_GRID_CLASS = 'grid-cols-1 grid [&_>_*]:min-w-0 gap-3';

// =============================================================================
// Math plugin support (bundle's ua — lazy-loads remark-math + rehype-katex)
// =============================================================================

let mathPluginsCache: { remarkMath: RemarkMathPlugin; rehypeKatex: RehypeKatexPlugin } | null = null;
let mathPluginsPromise:
  | Promise<{ remarkMath: RemarkMathPlugin; rehypeKatex: RehypeKatexPlugin } | null>
  | null = null;

/**
 * Hook to lazy-load remark-math and rehype-katex plugins.
 * Returns them once loaded, undefined before that.
 * Matches bundle's `ua` (lines 3285-3296).
 */
export function useMathPlugins(): {
  remarkMath?: RemarkMathPlugin;
  rehypeKatex?: RehypeKatexPlugin;
} {
  const [plugins, setPlugins] = useState<{
    remarkMath?: RemarkMathPlugin;
    rehypeKatex?: RehypeKatexPlugin;
  }>(
    () => mathPluginsCache ?? {}
  );

  React.useEffect(() => {
    if (mathPluginsCache) return;
    if (!mathPluginsPromise) {
      mathPluginsPromise = Promise.all([import('remark-math'), import('rehype-katex')]).then(
        ([rm, rk]) => {
          mathPluginsCache = {
            remarkMath: rm.default,
            rehypeKatex: rk.default
          };
          return mathPluginsCache;
        }
      );
    }
    const promise = mathPluginsPromise;
    promise.then((result) => {
      if (result) setPlugins(result);
    });
  }, []);

  return plugins;
}

/**
 * Build the full remarkPlugins array, optionally including math.
 * Matches bundle's N useMemo (lines 13660-13663).
 */
export function buildRemarkPlugins(remarkMath?: RemarkMathPlugin): PluggableList {
  const plugins: PluggableList = [];
  // remark-gfm is added externally
  if (remarkMath) {
    plugins.push(remarkMath);
  }
  return plugins;
}

/**
 * Build the full rehypePlugins array, optionally including katex.
 * Matches bundle's j useMemo (lines 13663-13666).
 */
export function buildRehypePlugins(rehypeKatex?: RehypeKatexPlugin): PluggableList {
  const plugins: PluggableList = [];
  if (rehypeKatex) {
    const options: RehypeKatexOptions = { errorColor: 'inherit' };
    plugins.push([rehypeKatex, options]);
  }
  return plugins;
}
