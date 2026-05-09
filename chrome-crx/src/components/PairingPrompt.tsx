import { useState, useRef, useEffect, useCallback } from "react";
import { useIntl, FormattedMessage } from "react-intl";

type ClientType = string;

interface PairingPromptProps {
  /** Unique identifier for this pairing request */
  requestId: string;
  /** Type of client requesting to connect */
  clientType: ClientType;
  /** Current/default name for the browser */
  currentName?: string;
  /** Callback when user confirms pairing */
  onConfirm: (requestId: string, name: string) => void;
  /** Callback when user dismisses the prompt */
  onDismiss: (requestId: string) => void;
}

/**
 * PairingPrompt - Dialog shown when an external desktop client wants to pair
 * Allows user to name the browser session for identification
 */
export function PairingPrompt({
  requestId,
  clientType,
  currentName,
  onConfirm,
  onDismiss,
}: PairingPromptProps) {
  const intl = useIntl();
  const [name, setName] = useState(currentName || "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onConfirm(requestId, trimmedName);
    }
  }, [name, requestId, onConfirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleConfirm();
      }
    },
    [handleConfirm],
  );

  const clientLabel =
    clientType.toLowerCase().includes("code") ? "Code Client" : "Desktop Client";

  return (
    <div className="flex flex-col gap-4 p-5 bg-bg-100 rounded-xl border border-border-300 shadow-lg">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-text-000">
          <FormattedMessage
            id="wants_to_connect"
            defaultMessage="{clientLabel} wants to connect"
            values={{ clientLabel }}
          />
        </h3>
        <p className="text-sm text-text-300">
          <FormattedMessage
            id="name_this_browser_so_you_can"
            defaultMessage="Name this browser so you can identify it later."
          />
        </p>
      </div>

      {/* Name Input */}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={intl.formatMessage({
          id: "HnoThnsyPP",
          defaultMessage: 'e.g., "Work laptop", "Personal Chrome"',
        })}
        className="w-full px-3 py-2 text-sm rounded-lg border border-border-300 bg-bg-000 text-text-000 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-main-100 focus:border-transparent"
      />

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => onDismiss(requestId)}
          className="px-4 py-2 text-sm rounded-lg border border-border-300 text-text-200 hover:bg-bg-200 transition-colors"
        >
          <FormattedMessage id="ignore" defaultMessage="Ignore" />
        </button>
        <button
          onClick={handleConfirm}
          disabled={!name.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-accent-main-100 text-oncolor-100 hover:bg-accent-main-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FormattedMessage id="connect" defaultMessage="Connect" />
        </button>
      </div>
    </div>
  );
}
