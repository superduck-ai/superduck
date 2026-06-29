import type { ToolDefinition } from '../pageToolsSupport/types';
import type { BatchAction } from './types';
import {
  READ_ONLY_TOOLS,
  PAGE_OBSERVATION_TOOLS,
  SUMMARY_STEP_OUTPUT_MAX_CHARS
} from './constants';

let cachedRegistry: { tools: ToolDefinition[]; map: Map<string, ToolDefinition> } | null = null;

export async function getToolRegistry(): Promise<{
  tools: ToolDefinition[];
  map: Map<string, ToolDefinition>;
}> {
  if (!cachedRegistry) {
    const { getAllTools } = await import('../core/tools');
    const tools = getAllTools();
    const map = new Map<string, ToolDefinition>();
    for (const t of tools) map.set(t.name, t);
    cachedRegistry = { tools, map };
  }
  return cachedRegistry;
}

export function summarizeStepInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'computer') {
    const action = typeof input.action === 'string' ? input.action : 'action';
    if (typeof input.ref === 'string') return `${action} ${input.ref}`;
    if (typeof input.text === 'string') {
      const preview = input.text.length > 30 ? `${input.text.slice(0, 30)}...` : input.text;
      return `${action} "${preview}"`;
    }
    return action;
  }
  if (toolName === 'navigate' && typeof input.url === 'string') {
    return input.url.length > 48 ? `${input.url.slice(0, 48)}...` : input.url;
  }
  if (toolName === 'find' && typeof input.query === 'string') {
    return input.query.length > 48 ? `${input.query.slice(0, 48)}...` : input.query;
  }
  if (toolName === 'read_page' && typeof input.filter === 'string') return `filter=${input.filter}`;
  return toolName;
}

export function getBatchActionToolName(action: BatchAction): string | undefined {
  if (typeof action.tool === 'string') return action.tool;
  const alias = (action as { name?: unknown }).name;
  return typeof alias === 'string' ? alias : undefined;
}

export function isReadOnlyAction(toolName: string, input: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true;
  if (toolName !== 'computer') return false;
  const computerAction = input.action;
  return computerAction === 'screenshot' || computerAction === 'wait' || computerAction === 'zoom';
}

export function isPageObservationAction(toolName: string): boolean {
  return PAGE_OBSERVATION_TOOLS.has(toolName);
}

export function isMutationOrInteractionAction(
  toolName: string,
  input: Record<string, unknown>
): boolean {
  if (toolName === 'navigate' || toolName === 'form_input' || toolName === 'resize_window')
    return true;
  if (toolName !== 'computer') return false;
  const action = typeof input.action === 'string' ? input.action : '';
  if (!action) return true;
  return !isReadOnlyAction(toolName, input);
}

export function isSubmitBoundaryAction(toolName: string, input: Record<string, unknown>): boolean {
  if (toolName !== 'computer' || input.action !== 'key' || typeof input.text !== 'string') {
    return false;
  }
  return getKeyTokens(input.text).some(isSubmitBoundaryKey);
}

export function hasKeyAfterSubmitBoundary(
  toolName: string,
  input: Record<string, unknown>
): boolean {
  if (toolName !== 'computer' || input.action !== 'key' || typeof input.text !== 'string') {
    return false;
  }
  const tokens = getKeyTokens(input.text);
  const submitIndex = tokens.findIndex(isSubmitBoundaryKey);
  return submitIndex >= 0 && submitIndex < tokens.length - 1;
}

function getKeyTokens(text: string): string[] {
  return text.split(/[\s+]+/).filter(Boolean);
}

function isSubmitBoundaryKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === 'enter' || normalized === 'return';
}

export function summarizeStepOutput(output: string): string {
  const compact = output.replace(/\s+/g, ' ').trim();
  if (compact.length <= SUMMARY_STEP_OUTPUT_MAX_CHARS) return compact;
  return `${compact.slice(0, SUMMARY_STEP_OUTPUT_MAX_CHARS - 3)}...`;
}
