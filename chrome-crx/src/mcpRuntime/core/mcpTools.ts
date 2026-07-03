import { formatTabsOutput } from './urlUtils';
import { tabGroupManager } from '../tabState';
import { resolveBrowserSessionScope } from '../sessionScope';
import type { ToolContext, ToolDefinition } from '../browserAutomation';

type SessionScopedArgs = {
  sessionId?: string;
  session_id?: string;
};

interface TabsContextMcpArgs extends SessionScopedArgs {
  createIfEmpty?: boolean;
  name?: string;
}

interface TabsCreateMcpArgs extends SessionScopedArgs {
  force?: boolean;
}

interface TabsFinalizeMcpArgs extends SessionScopedArgs {
  keep?: {
    tabId?: number;
    status?: 'handoff' | 'deliverable';
  }[];
}

interface TabsNameSessionMcpArgs extends SessionScopedArgs {
  name?: string;
}

function scopedMcpOptions(
  args: SessionScopedArgs | undefined,
  context?: ToolContext
): { sessionId?: string } {
  return context?.browserSessionScope ?? resolveBrowserSessionScope(args) ?? {};
}

export const tabsContextMcpTool: ToolDefinition<TabsContextMcpArgs> = {
  name: 'tabs_context_mcp',
  description:
    'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Reuse one of the returned tab IDs for same-page navigation within the current group. When the current page should remain open, use tabs_create with a URL or navigate with newTab:true to open the target in a new background tab inside this group. Use tabs_create_mcp only when you need a fresh MCP tab group; it creates a new group and makes that group current.',
  parameters: {
    createIfEmpty: {
      type: 'boolean',
      description:
        'Creates a new MCP tab group if none exists, creating an empty tab that can be used for this conversation. If an MCP tab group already exists, this parameter has no effect.'
    },
    name: {
      type: 'string',
      description:
        'Title for the MCP tab group when createIfEmpty creates one. The duck marker is auto-prepended. Ignored if a group already exists or createIfEmpty is not set.'
    }
  },
  execute: async (args, context) => {
    try {
      const { createIfEmpty, name } = args || {};
      await tabGroupManager.initialize();
      const tabContext = await tabGroupManager.getOrCreateMcpTabContext({
        createIfEmpty,
        name,
        ...scopedMcpOptions(args, context)
      });
      if (!tabContext) {
        return {
          output: 'No MCP tab groups found. Use createIfEmpty: true to create one.'
        };
      }

      const tabGroupId = tabContext.tabGroupId;
      const availableTabs = tabContext.availableTabs;
      let groupTitle = '';
      try {
        const group = await chrome.tabGroups.get(tabGroupId);
        groupTitle = group?.title ?? '';
      } catch {
        // ignore
      }

      return {
        output: `${groupTitle ? `[${groupTitle}] ` : ''}${formatTabsOutput(availableTabs, tabGroupId)}`,
        tabContext: { ...tabContext, tabGroupId }
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
            'Creates a new MCP tab group if none exists, creating an empty tab that can be used for this conversation. If an MCP tab group already exists, this parameter has no effect.'
        },
        name: {
          type: 'string',
          description:
            'Title for the MCP tab group when createIfEmpty creates one. The duck marker is auto-prepended. Ignored if a group already exists or createIfEmpty is not set.'
        }
      },
      required: []
    }
  })
};

export const tabsCreateMcpTool: ToolDefinition<TabsCreateMcpArgs> = {
  name: 'tabs_create_mcp',
  description:
    'Creates a new empty tab in a fresh MCP tab group and makes that group current. IMPORTANT: Only use this when you need to start a separate MCP tab-group context. If this session already has a group, this tool fails unless force is true. To keep the current MCP group, reuse a tab from tabs_context_mcp.',
  parameters: {
    force: {
      type: 'boolean',
      description:
        'Replace the current session group with a fresh group. Leave false for normal browser work.'
    }
  },
  execute: async (args, context) => {
    try {
      await tabGroupManager.initialize();
      const input = args ?? {};
      const tabContext = await tabGroupManager.createMcpTabGroup({
        active: false,
        replaceExisting: input.force === true,
        ...scopedMcpOptions(input, context)
      });
      return {
        output: `Created new tab. Tab ID: ${tabContext.currentTabId}`,
        tabContext: {
          ...tabContext,
          executedOnTabId: tabContext.currentTabId
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
      'Creates a new empty tab in a fresh MCP tab group and makes that group current. IMPORTANT: Only use this when you need to start a separate MCP tab-group context. If this session already has a group, this tool fails unless force is true. To keep the current MCP group, reuse a tab from tabs_context_mcp.',
    input_schema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description:
            'Replace the current session group with a fresh group. Leave false for normal browser work.'
        }
      },
      required: []
    }
  })
};

export const tabsFinalizeMcpTool: ToolDefinition<TabsFinalizeMcpArgs> = {
  name: 'tabs_finalize_mcp',
  description:
    'Finalize the current MCP tab group with explicit tab disposition semantics. Use this only when you are explicitly deciding which tabs become handoff, deliverable, or released. Tabs kept as handoff remain in the managed group for a later turn. Tabs kept as deliverable stay open but leave the managed group. Omitted tabs are ungrouped and left open.',
  parameters: {
    keep: {
      type: 'array',
      description:
        "Optional list of tabs to keep after finalization. Each entry is { tabId, status }, where status is 'handoff' or 'deliverable'.",
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
  execute: async (args, context) => {
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
      const tabContext = await tabGroupManager.finalizeMcpTabGroup({
        keep,
        ...scopedMcpOptions(args, context)
      });
      if (!tabContext) {
        return {
          output: 'Finalized MCP tab group. No tabs remain in the managed group.'
        };
      }
      return {
        output: formatTabsOutput(tabContext.availableTabs, tabContext.tabGroupId),
        tabContext
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
      'Finalize the current MCP tab group by explicitly choosing tab dispositions. Use status handoff when a later turn should continue from the live page, or deliverable when the tab itself is a user-facing output/requested open page. Omitted tabs are ungrouped and left open.',
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

export const tabsNameSessionMcpTool: ToolDefinition<TabsNameSessionMcpArgs> = {
  name: 'tabs_name_session_mcp',
  description:
    'Name the current browser session so its tab group is visually distinguishable from other concurrent sessions. Call once at the start of a browser task with a short, task-relevant name. The name becomes the Chrome tab group title for this session. Requires a browser session scope (session_id).',
  parameters: {
    name: {
      type: 'string',
      description:
        'Short task-relevant name for the session. Pass an empty string to clear the name and revert to the default group title.'
    }
  },
  execute: async (args, context) => {
    try {
      const scope = scopedMcpOptions(args, context);
      const name = typeof args?.name === 'string' ? args.name : '';
      await tabGroupManager.initialize();
      const result = scope.sessionId
        ? await tabGroupManager.nameSession(scope.sessionId, name)
        : await tabGroupManager.nameActiveMcpGroup(name);
      return {
        output: result
          ? `Session group titled "${result.title}".`
          : 'Session name stored. No active tab group yet; the title will apply when the session creates or reuses a group.'
      };
    } catch (err) {
      return {
        error: `Failed to name session: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'tabs_name_session_mcp',
    description:
      'Name the current browser session so its tab group is visually distinguishable from other concurrent sessions. Call once at the start of a browser task with a short, task-relevant name. Requires a browser session scope (session_id).',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Short task-relevant name for the session. Empty string clears the name and reverts to the default group title.'
        }
      },
      required: ['name']
    }
  })
};
