import { describe, it, expect, vi } from 'vitest';
import type { ToolDefinition } from './types';

// `helpers.ts` imports `domainCategoryCache` from `tabState`, which
// dereferences `chrome.*` APIs at module load. We stub just enough to
// keep the import chain alive; the validator under test does not use
// any chrome API. Use a dynamic import so the stub is in place before
// the helpers module is evaluated.
vi.stubGlobal('chrome', {
  tabs: {
    onRemoved: { addListener: () => {}, removeListener: () => {} },
    onUpdated: { addListener: () => {}, removeListener: () => {} },
    onActivated: { addListener: () => {}, removeListener: () => {} },
    onAttached: { addListener: () => {}, removeListener: () => {} },
    onCreated: { addListener: () => {}, removeListener: () => {} },
    onMoved: { addListener: () => {}, removeListener: () => {} },
    onDetached: { addListener: () => {}, removeListener: () => {} },
    onReplaced: { addListener: () => {}, removeListener: () => {} }
  },
  tabGroups: { TAB_GROUP_ID_NONE: -1 },
  storage: { local: { get: () => Promise.resolve({}) } }
});

const { validateToolInput } = await import('./helpers');

/**
 * Tests for `validateToolInput`, the schema-driven runtime input
 * validator added to close architectural problem E in
 * `docs/architectural-improvements-todo.md`:
 * `ToolDefinition.parameters` was previously used only to generate the
 * JSON schema sent to the LLM. The runtime path (`coerceToolInputTypes`)
 * only did string→number / string→boolean coercion, so a malicious or
 * buggy model that passed an out-of-range value would let it flow into
 * the tool's `execute()`. `validateToolInput` is the enforcement layer
 * that reads `minimum` / `maximum` / `enum` / `required` / `minItems` /
 * `maxItems` / `maxLength` / `minLength` and rejects non-conforming
 * input before `execute()` runs.
 *
 * The tests focus on the contract — not on integration with the
 * `core.ts` dispatch path, which is exercised by the broader e2e flow.
 */

const computerToolDef: ToolDefinition = {
  name: 'computer',
  description: 'Drive the browser via synthesized input events',
  tabAccess: 'write',
  parameters: {
    action: {
      type: 'string',
      enum: [
        'left_click',
        'right_click',
        'double_click',
        'triple_click',
        'type',
        'key',
        'wait',
        'screenshot'
      ],
      required: true,
      description: 'The action to perform'
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description: '[x, y] viewport pixel coordinates'
    },
    duration: {
      type: 'number',
      minimum: 0,
      maximum: 30,
      description: 'Seconds to wait (for wait action)'
    },
    text: {
      type: 'string',
      maxLength: 10_000,
      description: 'Text to type or key to press'
    },
    tabId: {
      type: 'number',
      description: 'Tab to act on'
    }
  },
  execute: () => Promise.resolve({ output: 'ok' }),
  toProviderSchema: () => ({
    name: 'computer',
    description: '',
    input_schema: { type: 'object', properties: {} }
  })
};

const navigateToolDef: ToolDefinition = {
  name: 'navigate',
  description: 'Navigate to a URL',
  tabAccess: 'write',
  parameters: {
    url: { type: 'string', required: true, description: 'Destination URL' },
    tabId: { type: 'number', description: 'Tab to navigate' }
  },
  execute: () => Promise.resolve({ output: 'ok' }),
  toProviderSchema: () => ({
    name: 'navigate',
    description: '',
    input_schema: { type: 'object', properties: {} }
  })
};

const allTools: ToolDefinition[] = [computerToolDef, navigateToolDef];

describe('validateToolInput — required fields', () => {
  it('flags a missing required field', () => {
    const result = validateToolInput('computer', { coordinate: [10, 20] }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('action is required');
  });

  it('passes when all required fields are present', () => {
    const result = validateToolInput('computer', { action: 'left_click' }, allTools);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('flags null as missing (matches `null` → "not provided" semantics)', () => {
    const result = validateToolInput('computer', { action: null }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('action is required');
  });

  it('honors the top-level `required` array (string[])', () => {
    // Some schemas put `required: ['url']` at the root, with the per-field
    // entries carrying only `type` / `description`. The validator should
    // honor this shape too. The cast is because `ToolSchemaProperty`
    // widens the `required` field to `boolean | string[]` but does not
    // surface it as an indexable key on the parameters object.
    const rootRequiredTool: ToolDefinition = {
      name: 'rootRequired',
      description: '',
      tabAccess: 'write',
      parameters: {
        required: ['url'],
        url: { type: 'string' }
      } as unknown as ToolDefinition['parameters'],
      execute: () => Promise.resolve({ output: 'ok' }),
      toProviderSchema: () => ({
        name: 'rootRequired',
        description: '',
        input_schema: { type: 'object', properties: {} }
      })
    };
    const result = validateToolInput('rootRequired', {}, [rootRequiredTool]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('url is required');
  });
});

describe('validateToolInput — type checks', () => {
  it('rejects a number when string is expected', () => {
    const result = validateToolInput('computer', { action: 42, coordinate: [10, 20] }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('action must be string'))).toBe(true);
  });

  it('rejects a string when number is expected', () => {
    const result = validateToolInput(
      'computer',
      { action: 'left_click', duration: 'ten' },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duration must be number'))).toBe(true);
  });

  it('rejects a fractional number when integer is expected', () => {
    const integerTool: ToolDefinition = {
      name: 'integerTool',
      description: '',
      tabAccess: 'write',
      parameters: {
        keep: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tabId: { type: 'integer' }
            }
          }
        }
      },
      execute: () => Promise.resolve({ output: 'ok' }),
      toProviderSchema: () => ({
        name: 'integerTool',
        description: '',
        input_schema: { type: 'object', properties: {} }
      })
    };

    const valid = validateToolInput('integerTool', { keep: [{ tabId: 12 }] }, [integerTool]);
    const invalid = validateToolInput('integerTool', { keep: [{ tabId: 12.5 }] }, [integerTool]);

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('keep[0].tabId must be integer, got number');
  });

  it('rejects a non-array when array is expected', () => {
    const result = validateToolInput(
      'computer',
      { action: 'left_click', coordinate: 'oops' },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('coordinate must be array'))).toBe(true);
  });

  it('tolerates the `["string", "null"]` union type', () => {
    const unionTool: ToolDefinition = {
      name: 'unionTool',
      description: '',
      tabAccess: 'write',
      parameters: {
        text: { type: ['string', 'null'] }
      },
      execute: () => Promise.resolve({ output: 'ok' }),
      toProviderSchema: () => ({
        name: 'unionTool',
        description: '',
        input_schema: { type: 'object', properties: {} }
      })
    };
    const r1 = validateToolInput('unionTool', { text: 'hello' }, [unionTool]);
    expect(r1.valid).toBe(true);
    const r2 = validateToolInput('unionTool', { text: 42 }, [unionTool]);
    expect(r2.valid).toBe(false);
  });
});

describe('validateToolInput — range / length / count', () => {
  it('rejects a number below minimum', () => {
    const result = validateToolInput('computer', { action: 'wait', duration: -1 }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duration must be >= 0, got -1');
  });

  it('rejects a number above maximum', () => {
    const result = validateToolInput('computer', { action: 'wait', duration: 999 }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('duration must be <= 30, got 999');
  });

  it('accepts a number at the boundary (inclusive)', () => {
    const r0 = validateToolInput('computer', { action: 'wait', duration: 0 }, allTools);
    expect(r0.valid).toBe(true);
    const r30 = validateToolInput('computer', { action: 'wait', duration: 30 }, allTools);
    expect(r30.valid).toBe(true);
  });

  it('rejects a string longer than maxLength', () => {
    const result = validateToolInput(
      'computer',
      { action: 'type', text: 'x'.repeat(10_001) },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('text too long'))).toBe(true);
  });

  it('rejects an array shorter than minItems', () => {
    const result = validateToolInput(
      'computer',
      { action: 'left_click', coordinate: [10] },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('coordinate must have >= 2 items'))).toBe(true);
  });

  it('rejects an array longer than maxItems', () => {
    const result = validateToolInput(
      'computer',
      { action: 'left_click', coordinate: [10, 20, 30] },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('coordinate must have <= 2 items'))).toBe(true);
  });
});

describe('validateToolInput — enum', () => {
  it('rejects a value not in the enum', () => {
    const result = validateToolInput('computer', { action: 'definitely_not_an_action' }, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('action must be one of:'))).toBe(true);
  });

  it('accepts a value in the enum', () => {
    const result = validateToolInput('computer', { action: 'left_click' }, allTools);
    expect(result.valid).toBe(true);
  });
});

describe('validateToolInput — degenerate inputs', () => {
  it('returns valid for an unknown tool name (no schema → no rules)', () => {
    // Conservative: we cannot enforce a schema we have not seen. Better
    // to let the tool's own execute() surface the issue than to fail
    // closed and break unknown tools.
    const result = validateToolInput('unknownTool', { anything: 'goes' }, allTools);
    expect(result.valid).toBe(true);
  });

  it('rejects a non-object input', () => {
    const result = validateToolInput('computer', 'not an object', allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('input must be an object');
  });

  it('rejects null input', () => {
    const result = validateToolInput('computer', null, allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('input must be an object');
  });

  it('rejects array input (records only)', () => {
    const result = validateToolInput('computer', [1, 2, 3], allTools);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('input must be an object');
  });

  it('skips fields not declared in the schema (extra fields are allowed)', () => {
    const result = validateToolInput(
      'computer',
      { action: 'left_click', notInSchema: 'whatever' },
      allTools
    );
    expect(result.valid).toBe(true);
  });
});

describe('validateToolInput — multiple errors aggregated', () => {
  it('returns ALL errors, not just the first one', () => {
    const result = validateToolInput(
      'computer',
      { duration: 999, text: 'x'.repeat(20_000), action: 'bogus' },
      allTools
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors).toContain('duration must be <= 30, got 999');
    expect(result.errors.some((e) => e.includes('text too long'))).toBe(true);
    expect(result.errors.some((e) => e.includes('action must be one of:'))).toBe(true);
  });
});
