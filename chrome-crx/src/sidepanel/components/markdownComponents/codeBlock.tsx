import React, { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui';
import { useCopyToClipboard } from './clipboard';
import { darkTheme, lightTheme } from './themes';

const CODE_SIZE_LIMIT = 204800; // 200KB

function resolveDocumentIsDark(): boolean {
  if (typeof window === 'undefined') return true;
  const mode = document.documentElement.dataset.mode;
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return (
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function useCodeStyle() {
  const [isDark, setIsDark] = useState(resolveDocumentIsDark);

  React.useEffect(() => {
    const syncMode = () => setIsDark(resolveDocumentIsDark());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', syncMode);

    const observer = new MutationObserver(syncMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-mode']
    });

    syncMode();

    return () => {
      mq.removeEventListener('change', syncMode);
      observer.disconnect();
    };
  }, []);

  return isDark ? darkTheme : lightTheme;
}

export function CodeBlock({ className, children }: { className?: string; children: string }) {
  const { didCopy, copyToClipboard } = useCopyToClipboard();
  const codeStyle = useCodeStyle();

  const langMatch = /language-(\w+)/.exec(className || '');
  const languageLabel = langMatch?.[1] || '';
  const language = languageLabel.toLowerCase();
  const code = children.trimEnd();

  const exceedsSizeLimit = useMemo(
    () => (code ? new Blob([code]).size : 0) > CODE_SIZE_LIMIT,
    [code]
  );

  return (
    <div className="code-block-root relative group/copy rounded-lg border border-border bg-card">
      {/* Copy button + language label (sticky, appears on hover) */}
      <div className="sticky opacity-0 group-hover/copy:opacity-100 top-2 py-2 h-12 w-0 float-right">
        <div className="absolute right-0 h-8 px-2 items-center inline-flex z-10">
          <Button
            aria-label="Copy to clipboard"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 text-muted-foreground backdrop-blur-md hover:text-foreground"
            onClick={() => copyToClipboard(code)}
          >
            {didCopy ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        </div>
      </div>
      {languageLabel && (
        <div className="p-3.5 pb-0 text-xs text-muted-foreground">{languageLabel}</div>
      )}
      <div className="overflow-x-auto">
        {exceedsSizeLimit ? (
          <div>
            <div
              className={`${langMatch ? 'mt-3.5' : 'h-12 rounded-t-lg'} flex items-center gap-2 px-1.5 text-xs text-muted-foreground`}
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
            language={language}
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
