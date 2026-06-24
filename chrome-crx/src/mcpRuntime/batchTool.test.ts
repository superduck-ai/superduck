import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext, ToolResult } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const executeComputer = vi.fn();
  const executeNavigate = vi.fn();
  const executeReadPage = vi.fn();
  const executeFind = vi.fn();
  const executeFormInput = vi.fn();
  const waitForTabLoading = vi.fn();
  const attachDebugger = vi.fn();
  const isDebuggerAttached = vi.fn();

  const computerTool = {
    name: 'computer',
    description: 'computer',
    parameters: {
      required: ['action', 'tabId'],
      action: { type: 'string', enum: ['wait', 'screenshot', 'left_click', 'key'] },
      duration: { type: 'number', minimum: 0, maximum: 30 },
      ref: { type: 'string' },
      text: { type: 'string' },
      tabId: { type: 'number' }
    },
    execute: executeComputer,
    toProviderSchema: async () => ({
      name: 'computer',
      description: 'computer',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    })
  };

  const navigateTool = {
    name: 'navigate',
    description: 'navigate',
    parameters: {
      required: ['url', 'tabId'],
      url: { type: 'string' },
      tabId: { type: 'number' }
    },
    execute: executeNavigate,
    toProviderSchema: async () => ({
      name: 'navigate',
      description: 'navigate',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    })
  };

  const readPageTool = {
    name: 'read_page',
    description: 'read_page',
    parameters: {
      tabId: { type: 'number' },
      max_chars: { type: 'number', minimum: 1, maximum: 1000 }
    },
    execute: executeReadPage,
    toProviderSchema: async () => ({
      name: 'read_page',
      description: 'read_page',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    })
  };

  const findTool = {
    name: 'find',
    description: 'find',
    parameters: {
      required: ['query', 'tabId'],
      query: { type: 'string' },
      tabId: { type: 'number' }
    },
    execute: executeFind,
    toProviderSchema: async () => ({
      name: 'find',
      description: 'find',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    })
  };

  const formInputTool = {
    name: 'form_input',
    description: 'form_input',
    parameters: {
      required: ['ref', 'value', 'tabId'],
      ref: { type: 'string' },
      value: { type: ['string', 'boolean', 'number'] },
      tabId: { type: 'number' }
    },
    execute: executeFormInput,
    toProviderSchema: async () => ({
      name: 'form_input',
      description: 'form_input',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    })
  };

  return {
    executeComputer,
    executeNavigate,
    executeReadPage,
    executeFind,
    executeFormInput,
    waitForTabLoading,
    attachDebugger,
    isDebuggerAttached,
    tools: [computerTool, navigateTool, readPageTool, findTool, formInputTool]
  };
});

vi.mock('./core/tools', () => ({
  getAllTools: () => fixtures.tools
}));

vi.mock('./shared', () => ({
  waitForTabLoading: fixtures.waitForTabLoading
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    attachDebugger: fixtures.attachDebugger,
    isDebuggerAttached: fixtures.isDebuggerAttached
  }
}));

vi.stubGlobal('chrome', {
  tabs: {
    get: vi.fn().mockResolvedValue({ id: 7, url: 'https://example.com' }),
    onRemoved: {
      addListener: vi.fn()
    }
  }
});

const { batchTool } = await import('./batchTool');

const context: ToolContext = {
  tabId: 7,
  toolUseId: 'batch-test',
  permissionManager: {} as ToolContext['permissionManager']
};

function parseOutput(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.output || '{}') as Record<string, unknown>;
}

function mockChromeTab(tab: Partial<chrome.tabs.Tab>): void {
  (
    chrome.tabs.get as unknown as {
      mockResolvedValue: (value: Partial<chrome.tabs.Tab>) => void;
    }
  ).mockResolvedValue(tab);
}

function mockChromeTabError(error: Error): void {
  (
    chrome.tabs.get as unknown as {
      mockRejectedValue: (value: Error) => void;
    }
  ).mockRejectedValue(error);
}

describe('browser_batch runtime contract', () => {
  beforeEach(() => {
    fixtures.executeComputer.mockReset();
    fixtures.executeNavigate.mockReset();
    fixtures.executeReadPage.mockReset();
    fixtures.executeFind.mockReset();
    fixtures.executeFormInput.mockReset();
    fixtures.waitForTabLoading.mockReset();
    fixtures.attachDebugger.mockReset();
    fixtures.isDebuggerAttached.mockReset();
    fixtures.isDebuggerAttached.mockResolvedValue(true);
    mockChromeTab({ id: 7, url: 'https://example.com' });
  });

  it('rejects single-action batches so one-off actions run directly', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [{ tool: 'computer', input: { action: 'screenshot' } }]
      },
      context
    );

    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      remaining: 1,
      stoppedReason: 'invalid_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('requires at least 2 deterministic actions');
  });

  it('coerces child action inputs before execution and returns structured success', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'computer action' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: '1' } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      1,
      { action: 'wait', duration: 1, tabId: 7 },
      context
    );
    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      2,
      { action: 'screenshot', tabId: 7 },
      context
    );
    expect(result).toMatchObject({
      completed: 2,
      failedIndex: null,
      remaining: 0,
      stoppedReason: 'completed'
    });
    expect(parseOutput(result)).toMatchObject({
      completed: 2,
      failedIndex: null,
      remaining: 0,
      stoppedReason: 'completed'
    });
  });

  it('validates every child action before running any tool', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'computer', input: {} }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 1,
      remaining: 0,
      stoppedReason: 'validation_error'
    });
    expect(result.is_error).toBe(true);
    expect(String(result.output)).toContain('action is required');
  });

  it('accepts Claude-style name aliases for child actions', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'computer action' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          {
            name: 'computer',
            input: { action: 'wait', duration: '1' }
          } as unknown as { tool: string; input: Record<string, unknown> },
          {
            name: 'computer',
            input: { action: 'screenshot' }
          } as unknown as { tool: string; input: Record<string, unknown> }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      1,
      { action: 'wait', duration: 1, tabId: 7 },
      context
    );
    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      2,
      { action: 'screenshot', tabId: 7 },
      context
    );
    expect(result).toMatchObject({
      completed: 2,
      failedIndex: null,
      remaining: 0,
      stoppedReason: 'completed'
    });
  });

  it('keeps summary mode child outputs concise', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot captured' });
    fixtures.executeReadPage.mockResolvedValue({ output: 'x'.repeat(500) });

    const result = await batchTool.execute(
      {
        tabId: 7,
        resultMode: 'summary',
        actions: [
          { tool: 'computer', input: { action: 'screenshot' } },
          { tool: 'read_page', input: { max_chars: 1000 } }
        ]
      },
      context
    );

    const output = parseOutput(result);
    const steps = output.steps as Array<{ output?: string }>;
    expect(steps[1].output).toHaveLength(160);
    expect(output.summary).not.toContain('x'.repeat(300));
  });

  it('ensures debugger attach before CDP-dependent child actions', async () => {
    fixtures.isDebuggerAttached.mockResolvedValue(false);
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot' });

    await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.attachDebugger).toHaveBeenCalledWith(7);
    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'screenshot', tabId: 7 },
      context
    );
  });

  it('rejects system pages before child execution or debugger attach', async () => {
    mockChromeTab({ id: 7, url: 'chrome://newtab/' });
    fixtures.executeComputer.mockResolvedValue({ output: 'computer action' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.attachDebugger).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failedIndex: 0,
      stoppedReason: 'system_page',
      is_error: true
    });
  });

  it('returns a structured batch error when the target tab disappears before execution', async () => {
    mockChromeTabError(new Error('No tab with id: 7'));
    fixtures.executeComputer.mockResolvedValue({ output: 'computer action' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.attachDebugger).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'tab_unavailable',
      is_error: true
    });
    const parsed = parseOutput(result);
    const steps = parsed.steps as Array<{ errorCode?: string; error?: string }>;
    expect(steps[0]?.errorCode).toBe('tab_unavailable');
    expect(steps[0]?.error).toContain('tab 7 is no longer available');
  });

  it('rejects navigate followed by read_page because new-page discovery must observe separately', async () => {
    fixtures.executeNavigate.mockResolvedValue({ output: 'navigated' });
    fixtures.executeReadPage.mockResolvedValue({ output: 'page' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com/form' } },
          { tool: 'read_page', input: { max_chars: 100 } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeReadPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects navigate followed by wait and read_page observation', async () => {
    fixtures.executeNavigate.mockResolvedValue({ output: 'navigated' });
    fixtures.executeComputer.mockResolvedValue({ output: 'waited' });
    fixtures.executeReadPage.mockResolvedValue({ output: 'page' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com/form' } },
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'read_page', input: { max_chars: 100 } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(fixtures.executeReadPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects navigate followed by find inside the same batch', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com' } },
          { tool: 'find', input: { query: 'search box' } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeFind).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects navigate followed by wait and find inside the same batch', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com' } },
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'find', input: { query: 'search box' } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(fixtures.executeFind).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects observation results followed by ref-dependent mutation in one batch', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'read_page', input: { max_chars: 100 } },
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      context
    );

    expect(fixtures.executeReadPage).not.toHaveBeenCalled();
    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 2,
      remaining: 1,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('cannot be consumed by later actions');
  });

  it('rejects observation-first discovery batches', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'read_page', input: { max_chars: 100 } },
          { tool: 'find', input: { query: 'search box' } }
        ]
      },
      context
    );

    expect(fixtures.executeReadPage).not.toHaveBeenCalled();
    expect(fixtures.executeFind).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('should not start with read_page/find/get_page_text');
  });

  it('rejects stale ref-consuming actions after navigation before side effects', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com/form' } },
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects stale ref-consuming actions after navigation even when separated by wait', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'navigate', input: { url: 'https://example.com/form' } },
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('navigate should not run inside browser_batch');
  });

  it('rejects placeholder refs because same-batch observation outputs cannot be interpolated', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: '{{searchBoxRef}}', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'invalid_batch_input',
      is_error: true
    });
    const parsed = parseOutput(result);
    const steps = parsed.steps as Array<{ error?: string }>;
    expect(steps[0]?.error).toContain('requires concrete refs like "ref_1"');
  });

  it('gives specific guidance for form_input ref_id misuse', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref_id: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'invalid_batch_input',
      is_error: true
    });
    const parsed = parseOutput(result);
    const steps = parsed.steps as Array<{ error?: string }>;
    expect(steps[0]?.error).toContain('form_input uses "ref", not "ref_id"');
  });

  it('rejects wait actions that exceed the child action timeout', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 20 } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'invalid_batch_input',
      is_error: true
    });
    expect(String(result.output)).toContain('too long for browser_batch child timeout');
  });

  it('does not continue from a failed read-only action into later mutation', async () => {
    fixtures.executeReadPage.mockResolvedValue({ error: 'page unavailable' });
    fixtures.executeFormInput.mockResolvedValue({ output: 'set value' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        onError: 'continue',
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'read_page', input: { max_chars: 100 } },
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } }
        ]
      },
      context
    );

    expect(fixtures.executeReadPage).not.toHaveBeenCalled();
    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 2,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
  });

  it('does not report completed when onError continue skips a trailing read-only failure', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'waited' });
    fixtures.executeReadPage.mockResolvedValue({ error: 'page unavailable' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        onError: 'continue',
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1 } },
          { tool: 'read_page', input: { max_chars: 100 } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledTimes(1);
    expect(fixtures.executeReadPage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      remaining: 0,
      stoppedReason: 'tool_error',
      is_error: true
    });
    expect(parseOutput(result)).toMatchObject({
      completed: 1,
      failedIndex: 1,
      remaining: 0,
      stoppedReason: 'tool_error'
    });
  });

  it('allows ref-based form input followed by Enter when refs were observed before the batch', async () => {
    fixtures.executeFormInput.mockResolvedValue({ output: 'set value' });
    fixtures.executeComputer.mockResolvedValue({ output: 'pressed Enter' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).toHaveBeenCalledWith(
      { ref: 'ref_1', value: 'deepseek', tabId: 7 },
      context
    );
    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'key', text: 'Enter', tabId: 7 },
      context
    );
    expect(result).toMatchObject({
      completed: 2,
      failedIndex: null,
      stoppedReason: 'completed'
    });
    expect(fixtures.waitForTabLoading).toHaveBeenCalledWith(7);
  });

  it('clears child action timeout timers after successful batch actions', async () => {
    vi.useFakeTimers();
    try {
      fixtures.executeComputer.mockResolvedValue({ output: 'screenshot' });
      fixtures.executeReadPage.mockResolvedValue({ output: 'read page' });

      const resultPromise = batchTool.execute(
        {
          tabId: 7,
          actions: [
            { tool: 'computer', input: { action: 'screenshot' } },
            { tool: 'read_page', input: { max_chars: 1000 } }
          ]
        },
        context
      );

      await expect(resultPromise).resolves.toMatchObject({
        completed: 2,
        failedIndex: null,
        stoppedReason: 'completed'
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preflights page permission before executing child actions', async () => {
    const permissionManager = {
      checkPermission: vi.fn().mockResolvedValue({ allowed: false, needsPrompt: true }),
      getTurnApprovedDomains: vi.fn(() => []),
      setTurnApprovedDomains: vi.fn()
    };

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      {
        ...context,
        toolUseId: 'batch-tool-use',
        permissionManager: permissionManager as unknown as ToolContext['permissionManager']
      }
    );

    expect(result).toMatchObject({
      type: 'permission_required',
      tool: 'browser_batch',
      url: 'https://example.com',
      toolUseId: 'batch-tool-use'
    });
    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
  });

  it('turn-approves the preflighted domain after batch permission succeeds', async () => {
    const permissionManager = {
      checkPermission: vi.fn().mockResolvedValue({ allowed: true }),
      getTurnApprovedDomains: vi.fn(() => ['existing.test']),
      setTurnApprovedDomains: vi.fn()
    };
    fixtures.executeFormInput.mockResolvedValue({ output: 'set value' });
    fixtures.executeComputer.mockResolvedValue({ output: 'pressed Enter' });

    await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } }
        ]
      },
      {
        ...context,
        toolUseId: 'batch-tool-use',
        permissionManager: permissionManager as unknown as ToolContext['permissionManager']
      }
    );

    expect(permissionManager.setTurnApprovedDomains).toHaveBeenCalledWith([
      'existing.test',
      'example.com'
    ]);
    expect(fixtures.executeFormInput).toHaveBeenCalled();
    expect(fixtures.executeComputer).toHaveBeenCalled();
  });

  it('rejects actions after Enter because submit may change page state', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter' } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 2,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('actions after Enter/Return should not run');
  });

  it('rejects actions after modifier+Enter because submit shortcuts may change page state', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'cmd+Enter' } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 2,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('actions after Enter/Return should not run');
  });

  it('rejects key tokens after Enter inside the same key action', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'form_input', input: { ref: 'ref_1', value: 'deepseek' } },
          { tool: 'computer', input: { action: 'key', text: 'Enter Tab' } }
        ]
      },
      context
    );

    expect(fixtures.executeFormInput).not.toHaveBeenCalled();
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 1,
      stoppedReason: 'unsafe_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('key tokens after Enter/Return should not run');
  });

  it('rejects cross-tab child actions before execution', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'wait', duration: 1, tabId: 8 } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      remaining: 1,
      stoppedReason: 'cross_tab'
    });
    expect(result.is_error).toBe(true);
  });

  it('rejects tools outside the batch allowlist', async () => {
    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'tabs_create', input: {} },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      remaining: 1,
      stoppedReason: 'disallowed_tool'
    });
    expect(result.is_error).toBe(true);
    expect(String(result.output)).toContain('not allowed in browser_batch');
  });

  it('returns the original permission request when the first child action needs approval', async () => {
    fixtures.executeComputer.mockResolvedValue({
      type: 'permission_required',
      tool: 'computer',
      url: 'https://example.org',
      toolUseId: 'child-tool'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'left_click', ref: 'ref_1' } },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(result).toMatchObject({
      type: 'permission_required',
      tool: 'computer',
      url: 'https://example.org',
      toolUseId: 'child-tool'
    });
  });

  it('keeps last image and tab context when a later child action needs permission', async () => {
    const tabContext = {
      currentTabId: 7,
      executedOnTabId: 7,
      availableTabs: [{ id: 7, title: 'Example', url: 'https://example.com' }],
      tabCount: 1
    };
    fixtures.executeComputer.mockResolvedValueOnce({
      output: 'screenshot',
      base64Image: 'image-data',
      imageFormat: 'png',
      tabContext
    });
    fixtures.executeComputer.mockResolvedValueOnce({
      type: 'permission_required',
      tool: 'computer',
      url: 'https://example.org',
      toolUseId: 'child-tool'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { tool: 'computer', input: { action: 'screenshot' } },
          { tool: 'computer', input: { action: 'left_click', ref: 'ref_1' } }
        ]
      },
      context
    );

    expect(result.type).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      remaining: 0,
      stoppedReason: 'permission_required',
      base64Image: 'image-data',
      imageFormat: 'png',
      tabContext
    });
    expect(result.is_error).toBe(true);
    expect(parseOutput(result)).toMatchObject({
      completed: 1,
      failedIndex: 1,
      remaining: 0,
      stoppedReason: 'permission_required'
    });
    expect(String(result.output)).toContain('https://example.org');
  });
});
