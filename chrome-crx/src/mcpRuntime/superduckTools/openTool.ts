import type { ToolDefinition } from '../pageTools';
import type { OpenArgs } from './types';
import { claimTabForContext, resolveActiveTab } from './helpers';

export const superduckOpenTool: ToolDefinition<OpenArgs> = {
  name: 'superduck_open',
  description:
    "SuperDuck CLI: navigate user's active Chrome tab to a URL. Pass newTab=true to open in a new tab instead.",
  tabAccess: 'write',
  parameters: {
    url: { type: 'string', description: 'URL to open (http(s) or chrome://...)' },
    newTab: { type: 'boolean', description: 'Open in a new tab; default updates the active tab' },
    tabId: { type: 'number', description: 'Override active-tab resolution' }
  },
  execute: async (args, context) => {
    try {
      const url = String(args?.url || '');
      if (!url) return { error: 'url is required' };
      let tab: chrome.tabs.Tab;
      if (args?.newTab) {
        tab = await chrome.tabs.create({ url, active: true });
        if (tab.id !== undefined) {
          const groupId =
            typeof tab.groupId === 'number' && tab.groupId !== -1 ? tab.groupId : undefined;
          try {
            await claimTabForContext(tab.id, context, { groupId });
          } catch (claimErr) {
            await chrome.tabs.remove(tab.id).catch(() => {});
            throw claimErr;
          }
        }
      } else {
        const active = await resolveActiveTab(args?.tabId, context);
        if (active.id === undefined) return { error: 'active tab has no id' };
        const updated = await chrome.tabs.update(active.id, { url, active: true });
        if (!updated) return { error: 'failed to update tab' };
        tab = updated;
      }
      return {
        output: JSON.stringify({
          tabId: tab.id,
          windowId: tab.windowId,
          url,
          newTab: !!args?.newTab
        })
      };
    } catch (err) {
      return {
        error: `superduck_open failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_open',
    description: 'SuperDuck CLI: navigate active tab (or open new tab)',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        newTab: { type: 'boolean' },
        tabId: { type: 'number' }
      },
      required: ['url']
    }
  })
};
