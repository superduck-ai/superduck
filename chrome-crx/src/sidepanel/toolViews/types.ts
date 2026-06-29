import type { ApiImageContentBlock, ApiTextContentBlock } from '../../messageTypes';
import { isImageContentBlock, isRecord, isTextContentBlock } from '../../messageTypes';

export type ToolRenderMode = 'Standard' | 'TimelineGroup';

export type ToolInputLike = string | Record<string, unknown> | null | undefined;

export interface KnowledgeContentBlock {
  type: 'knowledge';
  title?: string;
  url?: string;
  metadata?: {
    type?: string;
    favicon_url?: string;
  };
  text?: string;
}

export type ToolResultContentBlock =
  | ApiTextContentBlock
  | ApiImageContentBlock
  | KnowledgeContentBlock;

export interface ToolResultLike {
  content?: string | readonly unknown[];
  is_error?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  faviconUrl?: string;
}

export type KnowledgeSearchResultBlock = KnowledgeContentBlock & {
  url: string;
};

export type ParsedSearchEntry = Record<string, unknown> & {
  url: string;
};

export function isKnowledgeContentBlock(block: unknown): block is KnowledgeContentBlock {
  return isRecord(block) && block.type === 'knowledge';
}

export function getToolResultContentArray(
  content: ToolResultLike['content']
): ToolResultContentBlock[] | null {
  if (!Array.isArray(content)) return null;
  return content.filter(
    (block): block is ToolResultContentBlock =>
      isKnowledgeContentBlock(block) || isTextContentBlock(block) || isImageContentBlock(block)
  );
}

export function getToolInputField(input: ToolInputLike, field: string): string {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return isRecord(parsed) && typeof parsed[field] === 'string' ? parsed[field] : '';
    } catch {
      return '';
    }
  }

  return isRecord(input) && typeof input[field] === 'string' ? input[field] : '';
}
