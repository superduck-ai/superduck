import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './pageToolsSupport/types';

const fixtures = vi.hoisted(() => {
  const checkPermission = vi.fn();
  const getCategory = vi.fn();
  const resolveTabForContext = vi.fn();
  const getMainTabId = vi.fn();
  const getValidTabsWithMetadata = vi.fn();
  const hideIndicator = vi.fn();
  const restoreIndicator = vi.fn();
  const resolveTabId = vi.fn();
  const sendCommand = vi.fn();
  const rememberPolicy = vi.fn();
  const adoptChild = vi.fn();
  const filterPolicy = vi.fn();
  const moveSearch = vi.fn();

  return {
    checkPermission,
    getCategory,
    resolveTabForContext,
    getMainTabId,
    getValidTabsWithMetadata,
    hideIndicator,
    restoreIndicator,
    resolveTabId,
    sendCommand,
    rememberPolicy,
    adoptChild,
    filterPolicy,
    moveSearch
  };
});

vi.mock('./tabState', () => ({
  domainCategoryCache: {
    getCategory: fixtures.getCategory
  },
  tabGroupManager: {
    resolveTabForContext: fixtures.resolveTabForContext,
    getMainTabId: fixtures.getMainTabId,
    getValidTabsWithMetadata: fixtures.getValidTabsWithMetadata,
    getValidTabsWithMetadataForContext: fixtures.getValidTabsWithMetadata,
    hideIndicatorForToolUse: fixtures.hideIndicator,
    restoreIndicatorAfterToolUse: fixtures.restoreIndicator,
    rememberChildTabNavigationPolicy: fixtures.rememberPolicy,
    withPreservedActiveTab: async (_tabId: number, fn: () => Promise<unknown>) => await fn(),
    adoptChildTabsFromOpener: fixtures.adoptChild
  }
}));

vi.mock('./cdp', () => ({
  cdpDebugger: {
    sendCommand: fixtures.sendCommand,
    clearWindowOpenEvents: vi.fn(),
    enablePageEvents: vi.fn(),
    consumeWindowOpenEvents: vi.fn(() => [])
  }
}));

vi.mock('./navigationIsolation', () => ({
  createPolicyCheckedChildTab: vi.fn(),
  filterPolicyAllowedTabs: fixtures.filterPolicy,
  moveSearchNavigationToNewTab: fixtures.moveSearch
}));

vi.mock('./tabState/tabLeases', () => ({
  tabLeaseManager: {
    claimTab: vi.fn()
  }
}));

vi.mock('./axSnapshot', () => ({
  takeSnapshotUnlocked: vi.fn(),
  SnapshotMaxCharsError: class SnapshotMaxCharsError extends Error {},
  normalizeSnapshotForDiff: vi.fn((value: string) => value),
  withSnapshotLock: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn())
}));

vi.mock('./screenshot/refBridge', () => ({
  registerRefsInPage: vi.fn(),
  pruneStaleRefs: vi.fn()
}));

vi.mock('./domainPermissions', () => ({
  PermissionTools: {
    EXECUTE_JAVASCRIPT: 'execute_javascript'
  },
  checkUrlSecurity: vi.fn(() => null)
}));

const chromeMock = vi.hoisted(() => ({
  tabs: {
    get: vi.fn(),
    onRemoved: {
      addListener: vi.fn()
    },
    onUpdated: {
      addListener: vi.fn()
    }
  },
  webNavigation: {
    onCommitted: {
      addListener: vi.fn()
    },
    onHistoryStateUpdated: {
      addListener: vi.fn()
    }
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1
  },
  debugger: {
    sendCommand: vi.fn()
  }
}));

vi.stubGlobal('chrome', chromeMock);

const { javascriptTool } = await import('./pageTools');

const context: ToolContext = {
  tabId: 10,
  toolUseId: 'tool-use-1',
  browserSessionScope: { sessionId: 'session-a' },
  tabAccess: 'write',
  resolveTabId: async (requestedTabId) => await fixtures.resolveTabId(requestedTabId ?? 10),
  permissionManager: {
    checkPermission: fixtures.checkPermission
  } as unknown as ToolContext['permissionManager']
};

// Strings are returned via Runtime.evaluate with type 'string'; structured
// values (objects/arrays) come back as type 'object' with a subtype.
function stubEvalValue(value: unknown, type: 'string' | 'object' = 'object'): void {
  fixtures.sendCommand.mockResolvedValueOnce({
    result:
      type === 'string'
        ? { type: 'string', value: value as string }
        : { type: 'object', subtype: 'object', value }
  });
}

beforeEach(() => {
  fixtures.checkPermission.mockReset();
  fixtures.getCategory.mockReset();
  fixtures.resolveTabForContext.mockReset();
  fixtures.getMainTabId.mockReset();
  fixtures.getValidTabsWithMetadata.mockReset();
  fixtures.hideIndicator.mockReset();
  fixtures.restoreIndicator.mockReset();
  fixtures.resolveTabId.mockReset();
  fixtures.sendCommand.mockReset();
  fixtures.rememberPolicy.mockReset();
  fixtures.adoptChild.mockReset();
  fixtures.filterPolicy.mockReset();
  fixtures.moveSearch.mockReset();
  chromeMock.tabs.get.mockReset();
  chromeMock.debugger.sendCommand.mockReset();

  fixtures.checkPermission.mockResolvedValue({ allowed: true });
  fixtures.getCategory.mockResolvedValue(null);
  fixtures.resolveTabId.mockImplementation(async (requested: number | undefined) => {
    return requested ?? 10;
  });
  fixtures.getMainTabId.mockResolvedValue(10);
  fixtures.getValidTabsWithMetadata.mockResolvedValue([
    { id: 10, title: 'Source', url: 'https://example.com/' }
  ]);
  fixtures.adoptChild.mockResolvedValue([]);
  fixtures.filterPolicy.mockResolvedValue([]);
  fixtures.moveSearch.mockResolvedValue([]);
  chromeMock.tabs.get.mockResolvedValue({
    id: 10,
    groupId: 123,
    url: 'https://example.com/'
  });
});

describe('javascript_tool sanitizeValue: truncation before credential detection', () => {
  it('no longer blocks rich-text innerHTML containing style/data attributes', async () => {
    // Long rich-text HTML: style="color:red;..." + data-x="a=1;b=2" used to
    // trip the '=' + ';' credential-shape rule and nuke the whole output.
    const richTextHtml =
      '<p style="color:red;font-weight:bold">Title</p><div data-x="a=1;b=2"><span>Hello world</span></div>' +
      '<p>'.repeat(600) + // push total length far past the 1000-char truncation point
      'body text with = and ; inside attributes';
    stubEvalValue(richTextHtml, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.querySelector("#editor").innerHTML', tabId: 10 },
      context
    );

    expect(result.error).toBeUndefined();
    const output = (result as { output: string }).output;
    expect(output).not.toContain('[BLOCKED: Cookie/query string data]');
    // Truncated to 1000 chars with the marker, so the tail beyond that is dropped.
    expect(output).toContain('[TRUNCATED]');
    expect(output.startsWith('<p style="color:red;font-weight:bold">Title</p>')).toBe(true);
  });

  it('still blocks short cookie/query strings (security unchanged)', async () => {
    stubEvalValue('session_id=abc123; theme=dark', 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks LONG cookie/query strings (>512 chars, no length exemption)', async () => {
    // Aggregated document.cookie or query strings can exceed 512 chars; they
    // must NOT bypass the shape check just because they are long.
    const longCookie = 'session_id=' + 'a'.repeat(600) + '; theme=dark';
    stubEvalValue(longCookie, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks cookie-wrapped JWTs over 512 chars (no length exemption)', async () => {
    // A JWT wrapped in a cookie ("session=<700-char JWT>; theme=dark") does not
    // match the anchored full-string JWT rule, so the cookie/query rule is the
    // only defense — it must fire regardless of length.
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const longPayload = Buffer.from('a'.repeat(700), 'utf8').toString('base64url');
    const signature = 's852-RscV2afMwhvV-QC2sBkVAqcbtDEkCr79A6cgXy';
    const cookieWrappedJwt = `session=${header}.${longPayload}.${signature}; theme=dark`;
    expect(cookieWrappedJwt.length).toBeGreaterThan(512);
    stubEvalValue(cookieWrappedJwt, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks credential strings with an HTML suffix (no HTML exemption)', async () => {
    // A cookie/query string concatenated with HTML (e.g. page code doing
    // `document.cookie + "<span></span>"`) must NOT skip the check just
    // because the value contains a tag. The anchored key=value grammar matches
    // from the start, so the HTML suffix does not defeat it.
    const cookieWithHtmlSuffix = 'session_id=abc123; theme=dark<span></span>';
    stubEvalValue(cookieWithHtmlSuffix, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie + "<span></span>"', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks long cookie-wrapped JWTs with an HTML suffix', async () => {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const longPayload = Buffer.from('b'.repeat(700), 'utf8').toString('base64url');
    const signature = 's852-RscV2afMwhvV-QC2sBkVAqcbtDEkCr79A6cgXy';
    const value = `session=${header}.${longPayload}.${signature}<div>leak</div>`;
    stubEvalValue(value, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie + "<div>leak</div>"', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks location.search values with a leading "?"', async () => {
    // location.search returns "?token=secret&theme=dark" — the query grammar
    // must accept the optional leading "?".
    stubEvalValue('?token=secret&theme=dark', 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'location.search', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks cookie values containing "=" (base64 padding)', async () => {
    // document.cookie values can contain '=' (base64 padding):
    // session=YWJjZA==; theme=dark — the value part must allow '='.
    stubEvalValue('session=YWJjZA==; theme=dark', 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.cookie', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks credentials followed by &amp;-encoded HTML', async () => {
    stubEvalValue('token=secret&amp;theme=dark', 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'location.search.replace(/&/g, "&amp;")', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Cookie/query string data]');
  });

  it('still blocks short JWT tokens (security unchanged)', async () => {
    stubEvalValue(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      'string'
    );

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'localStorage.getItem("jwt")', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: JWT token]');
  });

  it('still blocks short base64 payloads (security unchanged)', async () => {
    stubEvalValue('dXNlcjpwYXNzd29yZDEyMzQ1Njc4OTAw', 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'atob(credentials)', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: Base64 encoded data]');
  });

  it('still blocks JWTs longer than the 512-char cookie-detection cap', async () => {
    // A real JWT with several claims exceeds 512 chars. The anchored JWT rule
    // runs on the FULL value (not the truncated 1000-char prefix), so an
    // oversized credential must not leak.
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const longPayload = Buffer.from('a'.repeat(700), 'utf8').toString('base64url');
    const signature = 's852-RscV2afMwhvV-QC2sBkVAqcbtDEkCr79A6cgXy';
    const longJwt = `${header}.${longPayload}.${signature}`;
    expect(longJwt.length).toBeGreaterThan(512);
    stubEvalValue(longJwt, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'localStorage.getItem("jwt")', tabId: 10 },
      context
    );

    expect((result as { output: string }).output).toBe('[BLOCKED: JWT token]');
  });

  it('returns long non-credential strings truncated with marker instead of blocked', async () => {
    // No '=' + ';'/'&' combination — plain prose, not a credential shape.
    const longText = 'plain prose text without any credential shape ' + 'x'.repeat(3000);
    stubEvalValue(longText, 'string');

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'document.body.textContent', tabId: 10 },
      context
    );

    const output = (result as { output: string }).output;
    expect(output).not.toContain('[BLOCKED');
    expect(output).toContain('[TRUNCATED]');
    expect(output.length).toBeLessThanOrEqual(1015);
  });

  it('still blocks sensitive object keys recursively (security unchanged)', async () => {
    stubEvalValue({
      user: { name: 'alice', password: 'hunter2' },
      cookies: ['session=abc', 'theme=dark'],
      data: 'hello'
    });

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'window.state', tabId: 10 },
      context
    );

    const output = (result as { output: string }).output;
    expect(output).toContain('[BLOCKED: Sensitive key]');
    expect(output).toContain('[BLOCKED: Cookie access]');
    expect(output).toContain('"name": "alice"');
    expect(output).toContain('"data": "hello"');
  });

  it('truncates arrays past 100 items with a count marker', async () => {
    // Top-level arrays are returned via result.description; sanitizeValue only
    // sees arrays when they are nested inside an object.
    const manyItems = Array.from({ length: 120 }, (_v, i) => `item-${i}`);
    stubEvalValue({ items: manyItems });

    const result = await javascriptTool.execute(
      { action: 'javascript_exec', text: 'window.state', tabId: 10 },
      context
    );

    const output = (result as { output: string }).output;
    expect(output).toContain('"item-0"');
    expect(output).toContain('[TRUNCATED: 20 more items]');
  });
});
