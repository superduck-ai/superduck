import { describe, expect, it, vi } from 'vitest';

type MockTool = {
  name: string;
  tabAccess: 'read' | 'write';
};

const fixtures = vi.hoisted(() => {
  const tool = (name: string, tabAccess: 'read' | 'write' = 'write'): MockTool => ({
    name,
    tabAccess
  });

  return { tool };
});

vi.mock('../browserAutomation', () => ({
  computerTool: fixtures.tool('computer'),
  findTool: fixtures.tool('find', 'read'),
  formInputTool: fixtures.tool('form_input'),
  getPageTextTool: fixtures.tool('get_page_text', 'read'),
  gifCreatorTool: fixtures.tool('create_gif'),
  javascriptTool: fixtures.tool('javascript'),
  navigateTool: fixtures.tool('navigate'),
  readConsoleMessagesTool: fixtures.tool('read_console_messages', 'read'),
  readNetworkRequestsTool: fixtures.tool('read_network_requests', 'read'),
  readPageTool: fixtures.tool('read_page', 'read'),
  resizeWindowTool: fixtures.tool('resize_window'),
  tabsContextTool: fixtures.tool('tabs_context', 'read'),
  tabsCreateTool: fixtures.tool('tabs_create'),
  turnAnswerStartTool: fixtures.tool('turn_answer_start', 'read'),
  updatePlanTool: fixtures.tool('update_plan', 'read'),
  uploadImageTool: fixtures.tool('upload_image'),
  uploadFileTool: fixtures.tool('upload_file'),
  batchTool: fixtures.tool('browser_batch')
}));

vi.mock('../superduckTools', () => ({
  superduckTools: [],
  superduckToolNames: []
}));

vi.mock('./mcpTools', () => ({
  tabsContextMcpTool: fixtures.tool('tabs_context_mcp'),
  tabsCreateMcpTool: fixtures.tool('tabs_create_mcp'),
  tabsFinalizeMcpTool: fixtures.tool('tabs_finalize_mcp'),
  tabsNameSessionMcpTool: fixtures.tool('tabs_name_session_mcp')
}));

vi.mock('./shortcutTools', () => ({
  shortcutsListTool: fixtures.tool('shortcuts_list', 'read'),
  shortcutsGetTool: fixtures.tool('shortcuts_get', 'read'),
  shortcutsExecuteTool: fixtures.tool('shortcuts_execute')
}));

const { getToolTabAccess } = await import('./tools');

describe('getToolTabAccess', () => {
  it('uses static tab access for regular tools', () => {
    expect(getToolTabAccess('read_page')).toBe('read');
    expect(getToolTabAccess('computer')).toBe('write');
  });

  it('treats unknown tools as read-only for pre-validation tab lookup', () => {
    expect(getToolTabAccess('missing_tool')).toBe('read');
  });

  it('downgrades browser_batch to read when every action is read-only', () => {
    expect(
      getToolTabAccess('browser_batch', {
        actions: [
          { tool: 'read_page', input: {} },
          { tool: 'computer', input: { action: 'screenshot' } }
        ]
      })
    ).toBe('read');
  });

  it('keeps browser_batch as write for interaction or malformed batches', () => {
    expect(
      getToolTabAccess('browser_batch', {
        actions: [
          { tool: 'read_page', input: {} },
          { tool: 'computer', input: { action: 'left_click', ref: 'ref_1' } }
        ]
      })
    ).toBe('write');
    expect(getToolTabAccess('browser_batch', { actions: [{ tool: 'read_page', input: {} }] })).toBe(
      'write'
    );
  });
});
