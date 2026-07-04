import type { ToolDefinition } from '../pageTools';
import { filterTabsForContext, withChromeApiTimeout } from './helpers';

export const superduckListTabsTool: ToolDefinition<Record<string, never>> = {
  name: 'superduck_list_tabs',
  description:
    'SuperDuck CLI: list all tabs across all windows (id, windowId, url, title, active).',
  parameters: {},
  execute: async (_args, context) => {
    try {
      const [tabs, lastFocused] = await Promise.all([
        withChromeApiTimeout('chrome.tabs.query', chrome.tabs.query({})),
        withChromeApiTimeout(
          'chrome.windows.getLastFocused',
          chrome.windows.getLastFocused({ windowTypes: ['normal'] })
        )
      ]);
      const visibleTabs = await filterTabsForContext(tabs, context);
      const out = visibleTabs
        .filter((t) => t.id !== undefined)
        .map((t) => ({
          id: t.id,
          windowId: t.windowId,
          url: t.url,
          title: t.title,
          active: t.active,
          focusedWindow: t.windowId === lastFocused.id
        }));
      return { output: JSON.stringify({ activeWindowId: lastFocused.id, tabs: out }, null, 2) };
    } catch (err) {
      return {
        error: `superduck_list_tabs failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_list_tabs',
    description: 'SuperDuck CLI: list all tabs',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};
