import { domainCategoryCache } from '../tabState';
import type { PermissionManager } from '../../PermissionManager';
import type { ToolContext, ToolDefinition, ToolProviderSchema } from './types';

type TabSummary = Pick<chrome.tabs.Tab, 'id' | 'title' | 'url'>;

type TabsContextPayload = {
  availableTabs: Array<{
    tabId: number | undefined;
    title: string | undefined;
    url: string | undefined;
  }>;
  selectedTabId?: number;
  tabGroupId?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatTabsContext(
  tabs: TabSummary[],
  tabGroupId?: number,
  selectedTabId?: number
): string {
  const result: TabsContextPayload = {
    availableTabs: tabs.map((tab) => ({
      tabId: tab.id,
      title: tab.title,
      url: tab.url
    }))
  };
  if (void 0 !== selectedTabId) result.selectedTabId = selectedTabId;
  if (void 0 !== tabGroupId) result.tabGroupId = tabGroupId;
  return JSON.stringify(result);
}

export function shouldShowPlanMode(mode: string, hasPlan: boolean): boolean {
  return 'follow_a_plan' === mode && !hasPlan;
}

export function getPlanModeSystemReminder(): string {
  return '<system-reminder>You are in planning mode. Before executing any tools, you must first present a plan to the user using the update_plan tool. The plan should include: domains (list of domains you will visit) and approach (high-level steps you will take).</system-reminder>';
}

export async function filterDomainsByCategory(domains: string[]): Promise<{
  approved: string[];
  filtered: string[];
}> {
  const approved: string[] = [];
  const filtered: string[] = [];
  for (const domain of domains) {
    try {
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      const category = await domainCategoryCache.getCategory(url);
      if (
        !category ||
        ('category1' !== category &&
          'category2' !== category &&
          'category_org_blocked' !== category)
      ) {
        approved.push(domain);
      } else {
        filtered.push(domain);
      }
    } catch {
      approved.push(domain);
    }
  }
  return { approved, filtered };
}

export async function filterAndApproveDomains(
  domains: string[],
  permissionManager: Pick<PermissionManager, 'setTurnApprovedDomains'>
): Promise<string[]> {
  if (!domains || 0 === domains.length) return [];
  const { approved, filtered } = await filterDomainsByCategory(domains);
  filtered.length; // side effect from original (logging removed by minifier)
  permissionManager.setTurnApprovedDomains(approved);
  return approved;
}

export const toolsToProviderSchema = async (
  tools: ToolDefinition[],
  context?: ToolContext
): Promise<ToolProviderSchema[]> => {
  return Promise.all(tools.map((tool) => tool.toProviderSchema(context)));
};

export const coerceToolInputTypes = (
  toolName: string,
  input: unknown,
  toolDefinitions: ToolDefinition[]
): unknown => {
  const toolDef = toolDefinitions.find((t) => t.name === toolName);
  if (!toolDef || !toolDef.parameters || !isRecord(input)) return input;

  const coerced: Record<string, unknown> = { ...input };
  for (const [paramName, paramDef] of Object.entries(toolDef.parameters)) {
    if (paramName in coerced && paramDef && 'object' === typeof paramDef) {
      const value = coerced[paramName];
      const paramType = Array.isArray(paramDef.type) ? paramDef.type[0] : paramDef.type;
      if (('number' === paramType || 'integer' === paramType) && 'string' === typeof value) {
        const num = Number(value);
        if (!isNaN(num)) coerced[paramName] = num;
      } else if ('boolean' === paramType && 'string' === typeof value) {
        coerced[paramName] = 'true' === value;
      }
    }
  }
  return coerced;
};

/**
 * Validate a tool's input against the schema declared in its
 * `ToolDefinition.parameters`. Returns a list of human-readable error
 * messages; empty array means valid. Used as a runtime safety net
 * before the `execute()` function runs — `coerceToolInputTypes` only
 * does string→number/string→boolean coercion, so this is the only place
 * that enforces `minimum` / `maximum` / `enum` / `minItems` / `maxItems`
 * and the "required" contract.
 *
 * The validator is intentionally schema-driven (reads
 * `ToolSchemaProperty`) rather than hand-rolled per tool, so adding a
 * new constraint to a tool's `parameters` definition automatically
 * becomes a runtime check.
 *
 * Limitations vs. a full JSON Schema validator:
 *   - Does not deeply validate nested `properties` / `items`. We
 *     recurse into `properties` (object) and `items` (array) one level
 *     for the most common cases (nested object with primitive fields,
 *     array of primitives). Anything deeper is left to the tool's own
 *     `execute()` function.
 *   - Does not resolve `$ref`.
 *   - `required` may be either a `boolean` (per-property) or a
 *     `string[]` (root-level), matching the existing `ToolSchemaProperty`
 *     shape used elsewhere in the codebase.
 */
export const validateToolInput = (
  toolName: string,
  input: unknown,
  toolDefinitions: ToolDefinition[]
): { valid: boolean; errors: string[] } => {
  const toolDef = toolDefinitions.find((t) => t.name === toolName);
  if (!toolDef || !toolDef.parameters) return { valid: true, errors: [] };
  // Arrays are `typeof 'object'` in JS, so we exclude them here — the
  // tool input contract is "object with named fields", not a positional
  // argument list. `isRecord` in this file is intentionally permissive
  // (used elsewhere for narrow type guards on field values).
  if (!isRecord(input) || Array.isArray(input)) {
    return { valid: false, errors: ['input must be an object'] };
  }

  const errors: string[] = [];

  // Top-level `required` can be a string[]. We use it as a fallback when
  // individual property entries do not have an explicit `required: true`.
  const topLevelRequired = Array.isArray(toolDef.parameters.required)
    ? (toolDef.parameters.required as string[])
    : null;

  for (const [key, prop] of Object.entries(toolDef.parameters)) {
    if (key === 'required') continue; // top-level, handled per-property below
    if (!prop || typeof prop !== 'object') continue;
    const value = input[key];
    const isRequired =
      prop.required === true ||
      (Array.isArray(prop.required) && prop.required.length > 0) ||
      (topLevelRequired !== null && topLevelRequired.includes(key));

    if (isRequired && (value === undefined || value === null)) {
      errors.push(`${key} is required`);
      continue;
    }
    if (value === undefined || value === null) continue;

    collectFieldErrors(key, value, prop, errors);
  }

  return { valid: errors.length === 0, errors };
};

function collectFieldErrors(
  key: string,
  value: unknown,
  prop: Record<string, unknown>,
  errors: string[]
): void {
  // `prop.type` may be either a single string or a union like ["string", "null"].
  // We only validate against the first non-null type to keep the rule
  // shape simple — anything fancier should be in the tool's own execute().
  const typeRaw = prop.type;
  const types = Array.isArray(typeRaw) ? typeRaw : typeof typeRaw === 'string' ? [typeRaw] : [];

  // 1. Type check
  if (types.length > 0) {
    const actual = jsonTypeOf(value);
    const allowed = types.filter((t) => t !== 'null');
    const matches = allowed.some((allowedType) => {
      if (allowedType === 'integer') return typeof value === 'number' && Number.isInteger(value);
      if (allowedType === 'number') return typeof value === 'number';
      return allowedType === actual;
    });
    if (allowed.length > 0 && !matches) {
      errors.push(`${key} must be ${allowed.join(' or ')}, got ${actual}`);
      // Skip further checks since downstream ones assume the right type.
      return;
    }
  }

  // 2. Range checks (number)
  if (typeof value === 'number') {
    if (typeof prop.minimum === 'number' && value < prop.minimum) {
      errors.push(`${key} must be >= ${prop.minimum}, got ${value}`);
    }
    if (typeof prop.maximum === 'number' && value > prop.maximum) {
      errors.push(`${key} must be <= ${prop.maximum}, got ${value}`);
    }
  }

  // 3. String length (we use char count, not bytes — close enough for
  //    URL / text parameters and matches the schema's intent)
  if (typeof value === 'string') {
    if (typeof prop.maxLength === 'number' && value.length > prop.maxLength) {
      errors.push(`${key} too long (${value.length} > ${prop.maxLength})`);
    }
    if (typeof prop.minLength === 'number' && value.length < prop.minLength) {
      errors.push(`${key} too short (${value.length} < ${prop.minLength})`);
    }
  }

  // 4. Array length
  if (Array.isArray(value)) {
    if (typeof prop.minItems === 'number' && value.length < prop.minItems) {
      errors.push(`${key} must have >= ${prop.minItems} items, got ${value.length}`);
    }
    if (typeof prop.maxItems === 'number' && value.length > prop.maxItems) {
      errors.push(`${key} must have <= ${prop.maxItems} items, got ${value.length}`);
    }
  }

  // 5. Enum
  if (Array.isArray(prop.enum) && !prop.enum.includes(value)) {
    errors.push(`${key} must be one of: ${prop.enum.join(', ')}`);
  }

  // 6. Recurse one level into nested object / array schemas so common
  //    shapes (e.g. computer tool's coordinate = [number, number]) are
  //    checked. We do NOT attempt full JSON-Schema semantics.
  if (isRecord(value) && isRecord(prop.properties)) {
    for (const [subKey, subProp] of Object.entries(prop.properties)) {
      if (!subProp || typeof subProp !== 'object') continue;
      const subValue = (value as Record<string, unknown>)[subKey];
      if (subValue === undefined || subValue === null) continue;
      collectFieldErrors(`${key}.${subKey}`, subValue, subProp as Record<string, unknown>, errors);
    }
  }
  if (Array.isArray(value) && isRecord(prop.items)) {
    value.forEach((item, idx) => {
      if (item === undefined || item === null) return;
      collectFieldErrors(`${key}[${idx}]`, item, prop.items as Record<string, unknown>, errors);
    });
  }
}

function jsonTypeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export const parseArrayInput = (value: unknown, _context?: ToolContext): unknown[] => {
  if (Array.isArray(value)) return value;
  if ('string' === typeof value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
