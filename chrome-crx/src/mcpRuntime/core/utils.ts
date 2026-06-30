import { isRecord } from '../../messageTypes';
import { coerceToolInputTypes, validateToolInput, type ToolDefinition } from '../browserAutomation';
import type { BridgeMessage, PermissionPromptRequest, ToolInputRecord } from './types';

export function coerceToolInput(
  toolName: string,
  input: unknown,
  tools: ToolDefinition[]
): unknown {
  return coerceToolInputTypes(toolName, input, tools);
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export function validateInput(
  toolName: string,
  input: unknown,
  tools: ToolDefinition[]
): { valid: boolean; errors: string[] } {
  return validateToolInput(toolName, input, tools);
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  return isRecord(value) && (value.type === undefined || typeof value.type === 'string');
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function toToolInputRecord(value: unknown): ToolInputRecord {
  return isRecord(value) ? value : {};
}

export function isPermissionPromptRequest(value: unknown): value is PermissionPromptRequest {
  return (
    isRecord(value) &&
    value.type === 'permission_required' &&
    typeof value.tool === 'string' &&
    typeof value.url === 'string'
  );
}

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
