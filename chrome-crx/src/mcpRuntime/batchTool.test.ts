import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext, ToolResult } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const executeComputer = vi.fn();
  const executeNavigate = vi.fn();
  const executeReadPage = vi.fn();
  const executeFind = vi.fn();
  const executeFormInput = vi.fn();
  const executeTabsCreate = vi.fn();
  const waitForTabLoading = vi.fn();
  const attachDebugger = vi.fn();
  const isDebuggerAttached = vi.fn();

  const computerTool = {
    name: 'computer',
    description: 'computer',
    parameters: {
      required: ['action', 'tabId'],
      action: {
        type: 'string',
        enum: ['wait', 'screenshot', 'left_click', 'key', 'type', 'scroll']
      },
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
      tabId: { type: 'number' },
      newTab: { type: 'boolean' }
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
      filter: { type: 'string', enum: ['interactive', 'all'] },
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

  const tabsCreateTool = {
    name: 'tabs_create',
    description: 'tabs_create',
    parameters: {
      url: { type: 'string' },
      tabId: { type: 'number' }
    },
    execute: executeTabsCreate,
    toProviderSchema: async () => ({
      name: 'tabs_create',
      description: 'tabs_create',
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
    executeTabsCreate,
    waitForTabLoading,
    attachDebugger,
    isDebuggerAttached,
    tools: [computerTool, navigateTool, readPageTool, findTool, formInputTool, tabsCreateTool]
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

describe('browser_batch Claude-like runtime contract', () => {
  beforeEach(() => {
    fixtures.executeComputer.mockReset();
    fixtures.executeNavigate.mockReset();
    fixtures.executeReadPage.mockReset();
    fixtures.executeFind.mockReset();
    fixtures.executeFormInput.mockReset();
    fixtures.executeTabsCreate.mockReset();
    fixtures.waitForTabLoading.mockReset();
    fixtures.attachDebugger.mockReset();
    fixtures.isDebuggerAttached.mockReset();
    fixtures.isDebuggerAttached.mockResolvedValue(true);
    (
      chrome.tabs.get as unknown as {
        mockResolvedValue: (value: Partial<chrome.tabs.Tab>) => void;
      }
    ).mockResolvedValue({ id: 7, url: 'https://example.com' });
  });

  it('exposes Claude-style {name, input} actions and allows one or more actions', async () => {
    const schema = await batchTool.toProviderSchema();
    const actions = schema.input_schema.properties.actions;
    const item = actions.items as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(actions.minItems).toBe(1);
    expect(actions.maxItems).toBeUndefined();
    expect(item.required).toEqual(['name', 'input']);
    expect(item.properties.name).toMatchObject({ type: 'string' });
    expect(item.properties).not.toHaveProperty('tool.enum');
    expect(schema.description).toContain('{name, input}');
    expect(schema.description).toContain('navigate');
  });

  it('runs a single action instead of rejecting it', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot captured' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [{ name: 'computer', input: { action: 'screenshot' } }]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'screenshot', tabId: 7 },
      expect.objectContaining({ tabId: 7, availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: null,
      remaining: 0,
      stoppedReason: 'completed',
      batchItems: [{ label: 'computer:screenshot', output: 'screenshot captured' }]
    });
  });

  it('executes navigate and read_page sequentially inside one batch', async () => {
    fixtures.executeNavigate.mockResolvedValue({
      output: 'navigated',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 7,
        availableTabs: [{ id: 7, title: 'Example', url: 'https://example.com/form' }],
        tabCount: 1
      }
    });
    fixtures.executeReadPage.mockResolvedValue({ output: 'page content' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'navigate', input: { url: 'https://example.com/form' } },
          { name: 'read_page', input: { filter: 'interactive' } }
        ]
      },
      context
    );

    expect(fixtures.executeNavigate).toHaveBeenCalledWith(
      { url: 'https://example.com/form', tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(fixtures.waitForTabLoading).toHaveBeenCalledWith(7);
    expect(fixtures.executeReadPage).toHaveBeenCalledWith(
      { filter: 'interactive', tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({
      completed: 2,
      failedIndex: null,
      stoppedReason: 'completed'
    });
  });

  it('allows tabs_create inside the generic batch wrapper', async () => {
    fixtures.executeTabsCreate.mockResolvedValue({
      output: 'Opened https://example.com/search in new tab. Tab ID: 8',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 8,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 8, title: 'Search', url: 'https://example.com/search' }
        ],
        tabCount: 2
      }
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [{ name: 'tabs_create', input: { url: 'https://example.com/search' } }]
      },
      context
    );

    expect(fixtures.executeTabsCreate).toHaveBeenCalledWith(
      { url: 'https://example.com/search', tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: null,
      tabContext: {
        executedOnTabId: 8,
        tabCount: 2
      }
    });
  });

  it('carries a tabs_create tab id into later steps that omit tabId', async () => {
    fixtures.executeTabsCreate.mockResolvedValue({
      output: 'Opened https://example.com/search in new tab. Tab ID: 8',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 8,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 8, title: 'Search', url: 'https://example.com/search' }
        ],
        tabCount: 2
      }
    });
    fixtures.executeReadPage.mockResolvedValue({ output: 'search page content' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'tabs_create', input: { url: 'https://example.com/search' } },
          { name: 'read_page', input: { filter: 'all' } }
        ]
      },
      context
    );

    expect(fixtures.executeTabsCreate).toHaveBeenCalledWith(
      { url: 'https://example.com/search', tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(fixtures.waitForTabLoading).toHaveBeenCalledWith(8);
    expect(fixtures.executeReadPage).toHaveBeenCalledWith(
      { filter: 'all', tabId: 8 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({ completed: 2, failedIndex: null, stoppedReason: 'completed' });
  });

  it('carries a navigate newTab id into later steps that omit tabId', async () => {
    fixtures.executeNavigate.mockResolvedValue({
      output: 'Opened https://example.com/results in new tab. Tab ID: 9',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 9,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 9, title: 'Results', url: 'https://example.com/results' }
        ],
        tabCount: 2
      }
    });
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot captured' });

    await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'navigate', input: { url: 'https://example.com/results', newTab: true } },
          { name: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'screenshot', tabId: 9 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
  });

  it('keeps legacy {tool, input} action aliases working', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'waited' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [{ tool: 'computer', input: { action: 'wait', duration: '1' } }]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'wait', duration: 1, tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({ completed: 1, failedIndex: null });
  });

  it('validates child input when that child step is reached', async () => {
    fixtures.executeComputer.mockResolvedValueOnce({ output: 'waited' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'computer', input: { action: 'wait', duration: 1 } },
          { name: 'computer', input: {} }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledTimes(1);
    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'wait', duration: 1, tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      stoppedReason: 'validation_error',
      is_error: true
    });
    expect(String(result.output)).toContain('action is required');
  });

  it('allows cross-tab child actions when the child inputs target explicit tabs', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'ok' });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'computer', input: { action: 'wait', duration: 1, tabId: 8 } },
          { name: 'computer', input: { action: 'screenshot', tabId: 9 } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      1,
      { action: 'wait', duration: 1, tabId: 8 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(fixtures.executeComputer).toHaveBeenNthCalledWith(
      2,
      { action: 'screenshot', tabId: 9 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(fixtures.waitForTabLoading).toHaveBeenCalledWith(8);
    expect(result).toMatchObject({
      completed: 2,
      failedIndex: null,
      stoppedReason: 'completed'
    });
  });

  it('rejects nested browser_batch actions', async () => {
    const result = await batchTool.execute(
      {
        actions: [{ name: 'browser_batch', input: { actions: [] } }]
      },
      context
    );

    expect(result).toMatchObject({
      completed: 0,
      failedIndex: 0,
      stoppedReason: 'nested_batch',
      is_error: true
    });
    expect(String(result.output)).toContain('browser_batch cannot be nested');
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
        actions: [{ name: 'computer', input: { action: 'left_click', ref: 'ref_1' } }]
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

  it('returns a permission request after safe prior wait actions', async () => {
    fixtures.executeComputer.mockResolvedValueOnce({ output: 'waited' });
    fixtures.executeNavigate.mockResolvedValueOnce({
      type: 'permission_required',
      tool: 'navigate',
      url: 'https://example.org',
      toolUseId: 'nav-tool'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'computer', input: { action: 'wait', duration: 1 } },
          { name: 'navigate', input: { url: 'https://example.org' } }
        ]
      },
      context
    );

    expect(result).toMatchObject({
      type: 'permission_required',
      tool: 'navigate',
      url: 'https://example.org',
      toolUseId: 'nav-tool'
    });
  });

  it('stops and asks for standalone permission after unsafe prior actions', async () => {
    fixtures.executeComputer.mockResolvedValueOnce({ output: 'clicked' });
    fixtures.executeNavigate.mockResolvedValueOnce({
      type: 'permission_required',
      tool: 'navigate',
      url: 'https://example.org',
      toolUseId: 'nav-tool'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'computer', input: { action: 'left_click', ref: 'ref_1' } },
          { name: 'navigate', input: { url: 'https://example.org' } }
        ]
      },
      context
    );

    expect(result.type).toBeUndefined();
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      stoppedReason: 'permission_required',
      is_error: true
    });
    expect(String(result.output)).toContain('call navigate standalone');
  });

  it('keeps summary mode child outputs concise and exposes batchItems', async () => {
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot captured' });
    fixtures.executeReadPage.mockResolvedValue({ output: 'x'.repeat(500) });

    const result = await batchTool.execute(
      {
        tabId: 7,
        resultMode: 'summary',
        actions: [
          { name: 'computer', input: { action: 'screenshot' } },
          { name: 'read_page', input: { max_chars: 1000 } }
        ]
      },
      context
    );

    const output = parseOutput(result);
    const steps = output.steps as Array<{ output?: string }>;
    expect(steps[1].output).toHaveLength(160);
    expect(result.batchItems).toMatchObject([
      { label: 'computer:screenshot', output: 'screenshot captured' },
      { label: 'read_page', output: 'x'.repeat(500) }
    ]);
  });

  it('rejects a computer wait longer than the per-step timeout with a clear error', async () => {
    const result = await batchTool.execute(
      { tabId: 7, actions: [{ name: 'computer', input: { action: 'wait', duration: 20 } }] },
      context
    );

    expect(result).toMatchObject({
      failedIndex: 0,
      stoppedReason: 'validation_error',
      is_error: true
    });
    expect(String(result.error)).toContain('too long for the browser_batch per-step timeout');
    expect(fixtures.executeComputer).not.toHaveBeenCalled();
  });

  it('propagates a later permission prompt after an allowed navigate', async () => {
    fixtures.executeNavigate.mockResolvedValue({
      output: 'navigated',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 7,
        availableTabs: [{ id: 7, title: 'Example', url: 'https://example.com/' }],
        tabCount: 1
      }
    });
    fixtures.executeReadPage.mockResolvedValue({
      type: 'permission_required',
      tool: 'read_page',
      url: 'https://example.com/',
      toolUseId: 'rp'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'navigate', input: { url: 'https://example.com/' } },
          { name: 'read_page', input: { filter: 'all' } }
        ]
      },
      context
    );

    expect(result).toMatchObject({
      type: 'permission_required',
      tool: 'read_page',
      url: 'https://example.com/'
    });
  });

  it('does not propagate a later permission prompt after tabs_create opens a tab', async () => {
    fixtures.executeTabsCreate.mockResolvedValue({
      output: 'Opened https://example.com/search in new tab. Tab ID: 8',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 8,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 8, title: 'Search', url: 'https://example.com/search' }
        ],
        tabCount: 2
      }
    });
    fixtures.executeReadPage.mockResolvedValue({
      type: 'permission_required',
      tool: 'read_page',
      url: 'https://example.com/search',
      toolUseId: 'rp'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'tabs_create', input: { url: 'https://example.com/search' } },
          { name: 'read_page', input: { filter: 'all' } }
        ]
      },
      context
    );

    expect(fixtures.executeReadPage).toHaveBeenCalledWith(
      { filter: 'all', tabId: 8 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result.type).toBeUndefined();
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      stoppedReason: 'permission_required',
      is_error: true
    });
    expect(String(result.output)).toContain('call read_page standalone');
  });

  it('does not propagate a later permission prompt after navigate newTab opens a tab', async () => {
    fixtures.executeNavigate.mockResolvedValue({
      output: 'Opened https://example.com/results in new tab. Tab ID: 9',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 9,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 9, title: 'Results', url: 'https://example.com/results' }
        ],
        tabCount: 2
      }
    });
    fixtures.executeReadPage.mockResolvedValue({
      type: 'permission_required',
      tool: 'read_page',
      url: 'https://example.com/results',
      toolUseId: 'rp'
    });

    const result = await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'navigate', input: { url: 'https://example.com/results', newTab: true } },
          { name: 'read_page', input: { filter: 'all' } }
        ]
      },
      context
    );

    expect(fixtures.executeReadPage).toHaveBeenCalledWith(
      { filter: 'all', tabId: 9 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
    expect(result.type).toBeUndefined();
    expect(result).toMatchObject({
      completed: 1,
      failedIndex: 1,
      stoppedReason: 'permission_required',
      is_error: true
    });
    expect(String(result.output)).toContain('call read_page standalone');
  });

  it('does not retarget later default steps when a step explicitly targets another tab', async () => {
    fixtures.executeReadPage.mockResolvedValue({
      output: 'read tab 8',
      tabContext: {
        currentTabId: 7,
        executedOnTabId: 8,
        availableTabs: [
          { id: 7, title: 'Home', url: 'https://example.com' },
          { id: 8, title: 'Other', url: 'https://example.com/other' }
        ],
        tabCount: 2
      }
    });
    fixtures.executeComputer.mockResolvedValue({ output: 'screenshot captured' });

    await batchTool.execute(
      {
        tabId: 7,
        actions: [
          { name: 'read_page', input: { tabId: 8, filter: 'all' } },
          { name: 'computer', input: { action: 'screenshot' } }
        ]
      },
      context
    );

    expect(fixtures.executeComputer).toHaveBeenCalledWith(
      { action: 'screenshot', tabId: 7 },
      expect.objectContaining({ availableTools: fixtures.tools })
    );
  });
});
