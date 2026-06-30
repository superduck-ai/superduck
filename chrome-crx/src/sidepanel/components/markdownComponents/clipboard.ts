import { useState, useCallback } from 'react';

export function useCopyToClipboard() {
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
