import { PromptService } from '../extensionServices';

export const PermissionTools = {
  EXECUTE_JAVASCRIPT: 'execute_javascript',
  NAVIGATE: 'navigate',
  READ_PAGE_CONTENT: 'read_page_content',
  UPLOAD_IMAGE: 'upload_image',
  TYPE: 'type',
  CLICK: 'click',
  READ_CONSOLE_MESSAGES: 'read_console_messages',
  READ_NETWORK_REQUESTS: 'read_network_requests',
  PLAN_APPROVAL: 'plan_approval'
} as const;

export const PermissionDuration = {
  ONCE: 'once',
  SESSION: 'session',
  ALWAYS: 'always'
} as const;

export const PermissionType = {
  DOMAIN_TRANSITION: 'domain_transition'
} as const;

export async function checkUrlSecurity(
  _tabId: number,
  url: string,
  actionName: string
): Promise<any | null> {
  try {
    const blockedProtocols = ['chrome:', 'chrome-extension:', 'about:', 'data:', 'javascript:'];
    for (const protocol of blockedProtocols) {
      if (url.startsWith(protocol)) {
        return { error: `Cannot perform ${actionName} on ${protocol} URLs` };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const screenRecorder = {
  isRecording: (_groupId: number): boolean => false,
  getFrames: (_groupId: number): any[] => [],
  addFrame: (_groupId: number, _frame: any): void => {},
  startRecording: (_groupId: number): void => {},
  stopRecording: (_groupId: number): void => {}
};

export const MCP_NATIVE_SESSION_ID = `mcp_native_${Date.now()}`;

// Thin re-export so callers can swap implementations later (e.g. cache layer)
// without touching every call site. Also normalizes find-by-X to `null` so
// callers can `if (!shortcut)` without distinguishing missing vs undefined.
export const promptManager = {
  getAllPrompts: () => PromptService.getAllPrompts(),
  getPromptById: async (id: string) =>
    (await PromptService.getPromptById(id)) ?? null,
  getPromptByCommand: async (cmd: string) =>
    (await PromptService.getPromptByCommand(cmd)) ?? null,
  recordPromptUsage: (id: string) => PromptService.recordPromptUsage(id)
};

export function extractAppName(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return hostname;
  } catch {
    return undefined;
  }
}

export function formatTabsOutput(tabs: any[], tabGroupId?: number, activeTabId?: number): string {
  if (!tabs || tabs.length === 0) return 'No tabs available.';
  const lines = tabs.map((t: any) => {
    const active = activeTabId !== undefined && t.id === activeTabId ? ' (active)' : '';
    return `- tabId ${t.id}: "${t.title}" (${t.url})${active}`;
  });
  return `Tab Group ${tabGroupId ?? 'unknown'}:\n${lines.join('\n')}`;
}

export function normalizeUrl(url: string): string {
  if (!url.match(/^https?:\/\//)) return `https://${url}`;
  return url;
}

interface ScreenshotDimensionConfig {
  pxPerToken: number;
  maxTargetPx: number;
  maxTargetTokens: number;
}

interface ScreenshotContext {
  viewportWidth: number;
  viewportHeight: number;
  screenshotWidth: number;
  screenshotHeight: number;
}

function calculateTileCount(pixels: number, pxPerToken: number): number {
  return Math.floor((pixels - 1) / pxPerToken) + 1;
}

function calculateTokenCount(width: number, height: number, pxPerToken: number): number {
  return calculateTileCount(width, pxPerToken) * calculateTileCount(height, pxPerToken);
}

export function calculateOptimalDimensions(
  width: number,
  height: number,
  config: ScreenshotDimensionConfig
): [number, number] {
  const { pxPerToken, maxTargetPx, maxTargetTokens } = config;
  if (
    width <= maxTargetPx &&
    height <= maxTargetPx &&
    calculateTokenCount(width, height, pxPerToken) <= maxTargetTokens
  )
    return [width, height];
  if (height > width) {
    const [h, w] = calculateOptimalDimensions(height, width, config);
    return [w, h];
  }
  const aspectRatio = width / height;
  let upper = width;
  let lower = 1;
  for (;;) {
    if (lower + 1 === upper) return [lower, Math.max(Math.round(lower / aspectRatio), 1)];
    const midWidth = Math.floor((lower + upper) / 2);
    const midHeight = Math.max(Math.round(midWidth / aspectRatio), 1);
    if (
      midWidth <= maxTargetPx &&
      calculateTokenCount(midWidth, midHeight, pxPerToken) <= maxTargetTokens
    )
      lower = midWidth;
    else upper = midWidth;
  }
}

export const screenshotContextManager = new (class {
  contexts = new Map<number, ScreenshotContext>();

  setContext(
    tabId: number,
    info: {
      viewportWidth?: number;
      viewportHeight?: number;
      width: number;
      height: number;
    }
  ) {
    if (info.viewportWidth && info.viewportHeight) {
      this.contexts.set(tabId, {
        viewportWidth: info.viewportWidth,
        viewportHeight: info.viewportHeight,
        screenshotWidth: info.width,
        screenshotHeight: info.height
      });
    }
  }

  getContext(tabId: number) {
    return this.contexts.get(tabId);
  }

  clearContext(tabId: number) {
    this.contexts.delete(tabId);
  }

  clearAllContexts() {
    this.contexts.clear();
  }
})();
