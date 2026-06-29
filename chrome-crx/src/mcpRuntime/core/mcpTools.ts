import { formatTabsOutput } from './urlUtils';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition } from '../browserAutomation';

interface TabsContextMcpArgs {
  createIfEmpty?: boolean;
}

export const tabsContextMcpTool: ToolDefinition<TabsContextMcpArgs> = {
  name: 'tabs_context_mcp',
  description:
    'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Reuse one of the returned tab IDs for same-page navigation within the current group. When the current page should remain open, use tabs_create with a URL or navigate with newTab:true to open the target in a new background tab inside this group. Use tabs_create_mcp only when you need a fresh MCP tab group; it creates a new group and makes that group current.',
  parameters: {
    createIfEmpty: {
      type: 'boolean',
      description:
        'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
    }
  },
  execute: async (args) => {
    try {
      const { createIfEmpty } = args || {};
      await tabGroupManager.initialize();
      const context = await tabGroupManager.getOrCreateMcpTabContext({
        createIfEmpty
      });
      if (!context)
        return {
          output: 'No MCP tab groups found. Use createIfEmpty: true to create one.'
        };
      const tabGroupId = context.tabGroupId;
      const availableTabs = context.availableTabs;
      return {
        output: formatTabsOutput(availableTabs, tabGroupId),
        tabContext: { ...context, tabGroupId }
      };
    } catch (err) {
      return {
        error: `Failed to query tabs: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_context_mcp',
    description:
      'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Reuse one of the returned tab IDs for same-page navigation within the current group. When the current page should remain open, use tabs_create with a URL or navigate with newTab:true to open the target in a new background tab inside this group. Use tabs_create_mcp only when you need a fresh MCP tab group; it creates a new group and makes that group current.',
    input_schema: {
      type: 'object',
      properties: {
        createIfEmpty: {
          type: 'boolean',
          description:
            'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
        }
      },
      required: []
    }
  })
};

export const tabsCreateMcpTool: ToolDefinition = {
  name: 'tabs_create_mcp',
  description:
    'Creates a new empty tab in a fresh MCP tab group and makes that group current. IMPORTANT: Only use this when you need to start a separate MCP tab-group context. To keep the current MCP group and open another page inside it, use tabs_create with a URL or navigate with newTab:true instead.',
  parameters: {},
  execute: async () => {
    try {
      await tabGroupManager.initialize();
      const context = await tabGroupManager.createMcpTabGroup({ active: false });
      return {
        output: `Created new tab. Tab ID: ${context.currentTabId}`,
        tabContext: {
          ...context,
          executedOnTabId: context.currentTabId
        }
      };
    } catch (err) {
      return {
        error: `Failed to create tab: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_create_mcp',
    description:
      'Creates a new empty tab in a fresh MCP tab group and makes that group current. IMPORTANT: Only use this when you need to start a separate MCP tab-group context. To keep the current MCP group and open another page inside it, use tabs_create with a URL or navigate with newTab:true instead.',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

interface TabsFinalizeMcpArgs {
  keep?: {
    tabId?: number;
    status?: 'handoff' | 'deliverable';
  }[];
}

export const tabsFinalizeMcpTool: ToolDefinition<TabsFinalizeMcpArgs> = {
  name: 'tabs_finalize_mcp',
  description:
    'Finalize the current MCP tab group with Codex-compatible cleanup semantics. Use this once as the final SuperDuck browser action of the turn. Omit tabs by default. Tabs kept as handoff remain in the managed group for a later turn. Tabs kept as deliverable stay open but leave the managed group. Omitted SuperDuck-created tabs are closed; omitted user-origin tabs stay open and leave the managed group.',
  parameters: {
    keep: {
      type: 'array',
      description:
        "Optional list of tabs to keep after cleanup. Each entry is { tabId, status }, where status is 'handoff' or 'deliverable'.",
      items: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Integer tab ID to keep.' },
          status: {
            type: 'string',
            enum: ['handoff', 'deliverable'],
            description:
              'handoff keeps the tab in the MCP group for continuation; deliverable leaves it open outside the managed group.'
          }
        },
        required: ['tabId', 'status']
      }
    }
  },
  execute: async (args) => {
    try {
      await tabGroupManager.initialize();
      const keep = (args?.keep ?? []).map((entry) => {
        const tabId = entry?.tabId;
        const status = entry?.status;
        if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
          throw new Error('tabs_finalize_mcp keep entries require integer tabId');
        }
        if (status !== 'handoff' && status !== 'deliverable') {
          throw new Error(`tabs_finalize_mcp received invalid status ${String(status)}`);
        }
        return { tabId, status };
      });
      const context = await tabGroupManager.finalizeMcpTabGroup({ keep });
      if (!context) {
        return {
          output: 'Finalized MCP tab group. No tabs remain in the managed group.'
        };
      }
      return {
        output: formatTabsOutput(context.availableTabs, context.tabGroupId),
        tabContext: context
      };
    } catch (err) {
      return {
        error: `Failed to finalize MCP tab group: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_finalize_mcp',
    description:
      'Finalize the current MCP tab group. Use this once as the final SuperDuck browser action. Omit tabs by default. Use status handoff only when a later turn should continue from the live page, or deliverable when the tab itself is a user-facing output/requested open page. Omitted SuperDuck-created tabs are closed; omitted user-origin tabs are released and left open.',
    input_schema: {
      type: 'object',
      properties: {
        keep: {
          type: 'array',
          description:
            "Optional list of tabs to keep: { tabId, status } with status 'handoff' or 'deliverable'.",
          items: {
            type: 'object',
            properties: {
              tabId: { type: 'integer', description: 'Integer tab ID to keep.' },
              status: {
                type: 'string',
                enum: ['handoff', 'deliverable'],
                description: 'Post-finalize disposition for this tab.'
              }
            },
            required: ['tabId', 'status']
          }
        }
      },
      required: []
    }
  })
};
