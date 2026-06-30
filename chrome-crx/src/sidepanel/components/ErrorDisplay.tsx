import React, { useState, useEffect } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from '@/components/ui';

interface ErrorDisplayProps {
  error: string | null | undefined;
  tabId?: number;
  title?: string;
  onRetry?: () => void;
}

async function detectConflictingExtension(tabId: number): Promise<string | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const html = document.documentElement.outerHTML.toLowerCase();
          const extensionPatterns = [
            { name: 'LastPass', patterns: ['lastpass', 'lpform', 'data-lastpass'] },
            { name: 'Loom', patterns: ['loom-', 'loom.com'] }
          ];
          for (const ext of extensionPatterns) {
            for (const pattern of ext.patterns) {
              if (html.includes(pattern)) return ext.name;
            }
          }
          return null;
        } catch {
          return null;
        }
      }
    });

    if (results && results.length > 0 && results[0].result) {
      return results[0].result;
    }
    return null;
  } catch {
    return null;
  }
}

export function ErrorDisplay({ error, tabId, title, onRetry }: ErrorDisplayProps) {
  const intl = useIntl();
  const [conflictingExtension, setConflictingExtension] = useState<string | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const displayTitle = title ?? intl.formatMessage({ defaultMessage: 'Error', id: 'KN7zKn8z4F' });

  const isExtensionConflict = error?.includes(
    'Cannot access a chrome-extension:// URL of different extension'
  );
  const isConnectionError =
    error?.toLowerCase().includes('connection error') ||
    error?.toLowerCase().includes('network error') ||
    error?.toLowerCase().includes('failed to fetch');

  useEffect(() => {
    if (isExtensionConflict && tabId && !hasChecked) {
      (async () => {
        try {
          setHasChecked(true);
          const extensionName = await detectConflictingExtension(tabId);
          if (extensionName) setConflictingExtension(extensionName);
        } catch {
          // ignore
        }
      })();
    }
  }, [isExtensionConflict, tabId, hasChecked]);

  if (!error) return null;

  return (
    <div className="p-4 bg-danger-900 border border-danger-200 rounded-lg">
      <div className="flex items-start">
        <svg
          className="w-5 h-5 text-danger-200 mt-0.5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <h3 className="font-base-bold text-danger-000">{displayTitle}</h3>
          <p className="font-base-sm text-danger-000 mt-1 break-words whitespace-pre-wrap">
            {isExtensionConflict ? (
              conflictingExtension ? (
                <FormattedMessage
                  defaultMessage="Another extension you're using is preventing SuperDuck in Chrome from operating. Turn off extensions such as {extensionName} to use SuperDuck in your browser."
                  id="another_extension_youre_using_is_preventing"
                  values={{ extensionName: conflictingExtension }}
                />
              ) : (
                <FormattedMessage
                  defaultMessage="Another extension you're using is preventing SuperDuck in Chrome from operating."
                  id="another_extension_youre_using_is_preventing_2"
                />
              )
            ) : (
              error
            )}
          </p>
          {isConnectionError && onRetry && (
            <Button onClick={onRetry} variant="secondary" size="sm" className="mt-3">
              <FormattedMessage defaultMessage="Retry" id="retry" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
