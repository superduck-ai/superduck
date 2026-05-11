import React from 'react';
import { PromptService, type SavedPrompt } from '../extensionServices';
import type { ApiConversationMessage } from '../messageTypes';
import { Tooltip } from './Tooltip';

export const SHORTCUT_MARKER_RE = /\[\[shortcut:([^:]+):([^\]]+)\]\]/g;

function ShortcutChipIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.5 3C15.8807 3 17 4.11929 17 5.5V14.5C17 15.7943 16.0164 16.8592 14.7559 16.9873L14.5 17H5.5L5.24414 16.9873C4.06772 16.8677 3.13227 15.9323 3.0127 14.7559L3 14.5V5.5C3 4.11929 4.11929 3 5.5 3H14.5ZM5.5 4C4.67157 4 4 4.67157 4 5.5V14.5C4 15.3284 4.67157 16 5.5 16H14.5C15.3284 16 16 15.3284 16 14.5V5.5C16 4.67157 15.3284 4 14.5 4H5.5ZM11.1377 6.01953C11.403 6.09555 11.5563 6.37231 11.4805 6.6377L9.48047 13.6377C9.40445 13.903 9.12769 14.0563 8.8623 13.9805C8.59702 13.9044 8.44371 13.6277 8.51953 13.3623L10.5195 6.3623C10.5956 6.09702 10.8723 5.94371 11.1377 6.01953Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShortcutChipInMessage({
  name,
  content,
  onClick
}: {
  name: string;
  content?: string;
  onClick?: () => void;
}) {
  const chip = (
    <span
      onClick={onClick}
      className="inline-flex relative group/chip text-accent-secondary-100 select-none mx-0.5 cursor-pointer"
    >
      <span className="absolute -inset-y-0.5 -left-0.5 -right-1 rounded-md pointer-events-none opacity-0 group-hover/chip:opacity-100 bg-accent-secondary-900 transition-opacity duration-150" />
      <span className="relative pl-5 flex items-center">
        <span className="absolute top-1/2 -translate-y-1/2 left-0 w-4 h-4 flex items-center justify-center">
          <ShortcutChipIcon size={16} />
        </span>
        <span className="relative">{name}</span>
      </span>
    </span>
  );

  return content ? (
    <Tooltip
      tooltipContent={
        <div className="max-w-[200px] max-h-[100px] overflow-hidden text-xs">
          {content.length > 150 ? `${content.slice(0, 150)}...` : content}
        </div>
      }
      side="top"
    >
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}

function resolveShortcutMarkersInText(
  text: string,
  promptsById: Map<string, Pick<SavedPrompt, 'prompt'>>
): string {
  if (!text.includes('[[shortcut:')) return text;
  SHORTCUT_MARKER_RE.lastIndex = 0;
  return text.replace(SHORTCUT_MARKER_RE, (_match, id: string, name: string) => {
    const saved = promptsById.get(id);
    return saved?.prompt ? saved.prompt : `/${name}`;
  });
}

export function hasShortcutMarkers(text: string): boolean {
  SHORTCUT_MARKER_RE.lastIndex = 0;
  return SHORTCUT_MARKER_RE.test(text);
}

export function renderTextWithShortcutChips(
  text: string,
  onEditShortcut?: (id: string) => void
): React.ReactNode[] | string {
  const result: React.ReactNode[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  SHORTCUT_MARKER_RE.lastIndex = 0;
  while ((match = SHORTCUT_MARKER_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    const [, id, name] = match;
    result.push(
      <ShortcutChipInMessage
        key={`chip-${match.index}`}
        name={name}
        onClick={onEditShortcut ? () => onEditShortcut(id) : undefined}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : text;
}

export async function resolveShortcutMarkersForCopy(text: string): Promise<string> {
  if (!text.includes('[[shortcut:')) return text;

  const allPrompts = await PromptService.getAllPrompts();
  const promptsById = new Map(allPrompts.map((prompt) => [prompt.id, prompt]));
  return resolveShortcutMarkersInText(text, promptsById);
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    'text' in block &&
    (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  );
}

export async function resolveShortcutMarkersInMessages(
  messages: ApiConversationMessage[]
): Promise<ApiConversationMessage[]> {
  const hasMarkers = messages.some((message) => {
    if (typeof message.content === 'string') {
      return message.content.includes('[[shortcut:');
    }

    if (Array.isArray(message.content)) {
      return message.content.some((block) => isTextBlock(block) && block.text.includes('[[shortcut:'));
    }

    return false;
  });

  if (!hasMarkers) return messages;

  const allPrompts = await PromptService.getAllPrompts();
  const promptsById = new Map(allPrompts.map((prompt) => [prompt.id, prompt]));

  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return { ...message, content: resolveShortcutMarkersInText(message.content, promptsById) };
    }

    if (Array.isArray(message.content)) {
      const content = message.content.map((block) => {
        if (isTextBlock(block)) {
          return { ...block, text: resolveShortcutMarkersInText(block.text, promptsById) };
        }

        return block;
      });

      return { ...message, content };
    }

    return message;
  });
}
