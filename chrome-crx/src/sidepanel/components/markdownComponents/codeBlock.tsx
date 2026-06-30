import React, { useState, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from './clipboard';
import { darkTheme, lightTheme } from './themes';

const CODE_SIZE_LIMIT = 204800; // 200KB

function useCodeStyle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
    return true;
  });

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);

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
      {languageLabel && <div className="text-text-500 font-small p-3.5 pb-0">{languageLabel}</div>}
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
