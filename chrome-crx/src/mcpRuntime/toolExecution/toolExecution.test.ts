import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  beginTool: vi.fn(),
  endTool: vi.fn(),
  getSelectedModel: vi.fn(),
  getTabForMcp: vi.fn(),
  getOrCreateToolExecutor: vi.fn(),
  getToolTabAccess: vi.fn(),
  hasTool: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock('../agentActivity', () => ({
  beginTool: fixtures.beginTool,
  endTool: fixtures.endTool
}));

vi.mock('../analytics', () => ({
  trackEvent: fixtures.trackEvent
}));

vi.mock('../browserAutomation', () => ({
  cdpDebugger: {
    isDebuggerAttached: vi.fn(),
    attachDebugger: vi.fn()
  }
}));

vi.mock('../core/tools', () => ({
  getToolTabAccess: fixtures.getToolTabAccess,
  hasTool: fixtures.hasTool,
  mcpToolNames: []
}));

vi.mock('../providerClient', () => ({
  getSelectedModel: fixtures.getSelectedModel,
  invalidateCachedClient: vi.fn()
}));

vi.mock('../tabState', () => ({
  tabGroupManager: {
    getTabForMcp: fixtures.getTabForMcp
  }
}));

vi.mock('../tabState/tabLeases', () => ({
  BrowserSessionConflictError: class BrowserSessionConflictError extends Error {}
}));

vi.mock('./permissionPrompt', () => ({
  showPermissionPrompt: vi.fn()
}));

vi.mock('../domainPermissions', () => ({
  createBridgePermissionManager: vi.fn()
}));

vi.mock('./toolContextState', () => ({
  startToolContext: vi.fn(),
  cleanupAfterToolExecution: vi.fn()
}));

vi.mock('./toolExecutor', () => ({
  MCP_NATIVE_SESSION_ID: 'native',
  createErrorResponse: (text: string) => ({
    content: [{ type: 'text', text }],
    is_error: true
  }),
  getOrCreateToolExecutor: fixtures.getOrCreateToolExecutor
}));

const { executeTool } = await import('./toolExecution');

describe('executeTool', () => {
  beforeEach(() => {
    for (const fn of Object.values(fixtures)) fn.mockReset();
    fixtures.getSelectedModel.mockResolvedValue('test-model');
    fixtures.getToolTabAccess.mockReturnValue('read');
    fixtures.hasTool.mockReturnValue(true);
  });

  it('rejects unknown tools before resolving or claiming a tab', async () => {
    fixtures.hasTool.mockReturnValueOnce(false);

    const result = await executeTool({
      toolName: 'missing_tool',
      args: { tabId: 7 },
      tabId: 7,
      browserSessionId: 'session-a'
    });

    expect(result).toMatchObject({
      is_error: true,
      content: [{ type: 'text', text: 'Unknown tool: missing_tool' }]
    });
    expect(fixtures.getToolTabAccess).not.toHaveBeenCalled();
    expect(fixtures.getTabForMcp).not.toHaveBeenCalled();
    expect(fixtures.getOrCreateToolExecutor).not.toHaveBeenCalled();
    expect(fixtures.trackEvent).toHaveBeenCalledWith(
      'superduck.mcp.tool_called',
      expect.objectContaining({
        tool_name: 'missing_tool',
        success: false,
        error_type: 'unknown_tool'
      })
    );
  });
});
