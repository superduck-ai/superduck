import { StorageKeys, setStorageValue } from '../../extensionServices';
import { formatTabsOutput, promptManager } from '../shared';
import { tabGroupManager } from '../tabState';
import { resolveBrowserSessionScope } from '../sessionScope';
import {
  computerTool,
  findTool,
  formInputTool,
  getPageTextTool,
  gifCreatorTool,
  javascriptTool,
  navigateTool,
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  readPageTool,
  resizeWindowTool,
  tabsContextTool,
  tabsCreateTool,
  turnAnswerStartTool,
  updatePlanTool,
  uploadImageTool,
  batchTool,
  type ToolContext,
  type ToolDefinition,
  type ToolResult
} from '../browserAutomation';
import { superduckTools, superduckToolNames } from '../superduckTools';

interface TabsContextMcpArgs {
  createIfEmpty?: boolean;
  name?: string;
  sessionId?: string;
  session_id?: string;
  turnId?: string;
  turn_id?: string;
}

interface TabsFinalizeMcpArgs {
  keep?: {
    tabId?: number;
    status?: 'handoff' | 'deliverable';
  }[];
  sessionId?: string;
  session_id?: string;
  turnId?: string;
  turn_id?: string;
}

interface TabsNameSessionMcpArgs {
  name?: string;
  sessionId?: string;
  session_id?: string;
  turnId?: string;
  turn_id?: string;
}

interface TabsCreateMcpArgs {
  force?: boolean;
  sessionId?: string;
  session_id?: string;
  turnId?: string;
  turn_id?: string;
}

interface ShortcutLookupArgs {
  shortcutId?: string;
  command?: string;
}

type ShortcutRecord = NonNullable<Awaited<ReturnType<typeof promptManager.getPromptById>>>;
type RuntimeToolExecute = {
  bivarianceHack(input: unknown, context: ToolContext): Promise<ToolResult>;
}['bivarianceHack'];
type ToolRegistryEntry = Omit<ToolDefinition<unknown, ToolResult>, 'execute'> & {
  execute: RuntimeToolExecute;
};

function scopedMcpOptions(
  args: { sessionId?: string; session_id?: string; turnId?: string; turn_id?: string } | undefined,
  context?: ToolContext
): { sessionId?: string; turnId?: string } {
  return context?.browserSessionScope ?? resolveBrowserSessionScope(args) ?? {};
}

async function executeShortcutTask(options: {
  tabId: number;
  prompt: string;
  taskName: string;
  skipPermissions?: boolean;
  model?: string;
  tabGroupId?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { tabId, prompt, taskName, skipPermissions, model } = options;
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const runLogId = `shortcut_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  await setStorageValue(StorageKeys.TARGET_TAB_ID, tabId);

  await (async function openSidepanelWindow(opts: {
    sessionId: string;
    skipPermissions?: boolean;
    model?: string;
  }) {
    const { sessionId, skipPermissions, model } = opts;
    const url = chrome.runtime.getURL(
      `sidepanel.html?mode=window&sessionId=${sessionId}${skipPermissions ? '&skipPermissions=true' : ''}${model ? `&model=${encodeURIComponent(model)}` : ''}`
    );
    const win = await chrome.windows.create({
      url,
      type: 'popup',
      width: 500,
      height: 768,
      left: 100,
      top: 100,
      focused: true
    });
    if (!win) throw new Error('Failed to create sidepanel window');
    return win;
  })({ sessionId, skipPermissions, model });

  await (async function waitAndExecuteTask(opts: {
    tabId: number;
    prompt: string;
    taskName: string;
    runLogId: string;
    sessionId: string;
    isScheduledTask: boolean;
  }) {
    const { tabId, prompt, taskName, runLogId, sessionId, isScheduledTask } = opts;
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      let sent = false;
      const poll = async () => {
        try {
          if (Date.now() - startTime > 30000) {
            return reject(new Error('Timeout waiting for tab to load for task execution'));
          }
          const tab = await chrome.tabs.get(tabId);
          if ('complete' === tab.status) {
            setTimeout(() => {
              if (sent) return;
              sent = true;
              chrome.runtime.sendMessage(
                {
                  type: 'EXECUTE_TASK',
                  prompt,
                  taskName,
                  runLogId,
                  windowSessionId: sessionId,
                  isScheduledTask
                },
                () => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(`Failed to send prompt: ${chrome.runtime.lastError.message}`));
                  } else {
                    resolve();
                  }
                }
              );
            }, 3000);
          } else {
            setTimeout(poll, 500);
          }
        } catch (err) {
          reject(err);
        }
      };
      setTimeout(poll, 1000);
    });
  })({
    tabId,
    prompt,
    taskName,
    runLogId,
    sessionId,
    isScheduledTask: false
  });

  return { success: true };
}

const tabsContextMcpTool: ToolDefinition<TabsContextMcpArgs> = {
  name: 'tabs_context_mcp',
  description:
    'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Reuse one of the returned tab IDs for same-page navigation within the current group. When the current page should remain open, use tabs_create with a URL or navigate with newTab:true to open the target in a new background tab inside this group. Use tabs_create_mcp only when you need a fresh MCP tab group; it creates a new group and makes that group current.',
  parameters: {
    createIfEmpty: {
      type: 'boolean',
      description:
        'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
    },
    name: {
      type: 'string',
      description:
        'Title for the MCP tab group when createIfEmpty creates one. The 🦆 marker is auto-prepended. Ignored if a group already exists or createIfEmpty is not set.'
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
      if (!tabContext)
        return {
          output: 'No MCP tab groups found. Use createIfEmpty: true to create one.'
        };
      const tabGroupId = tabContext.tabGroupId;
      const availableTabs = tabContext.availableTabs;
      let grpTitle = '';
      try {
        const g = await chrome.tabGroups.get(tabGroupId);
        grpTitle = g?.title ?? '';
      } catch {
        // ignore
      }
      return {
        output: `${grpTitle ? `[${grpTitle}] ` : ''}${formatTabsOutput(availableTabs, tabGroupId)}`,
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
            'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.'
        },
        name: {
          type: 'string',
          description:
            'Title for the MCP tab group when createIfEmpty creates one. The 🦆 marker is auto-prepended. Ignored if a group already exists or createIfEmpty is not set.'
        }
      },
      required: []
    }
  })
};

const tabsCreateMcpTool: ToolDefinition<TabsCreateMcpArgs> = {
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

const tabsFinalizeMcpTool: ToolDefinition<TabsFinalizeMcpArgs> = {
  name: 'tabs_finalize_mcp',
  description:
    'Finalize the current MCP tab group with explicit tab disposition semantics. Use this only when you are explicitly deciding which tabs become handoff, deliverable, closed, or released. Tabs kept as handoff remain in the managed group for a later turn. Tabs kept as deliverable stay open but leave the managed group. Omitted SuperDuck-created tabs are closed; omitted user-origin tabs stay open and leave the managed group.',
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
      'Finalize the current MCP tab group by explicitly choosing tab dispositions. Use status handoff when a later turn should continue from the live page, or deliverable when the tab itself is a user-facing output/requested open page. Omitted SuperDuck-created tabs are closed; omitted user-origin tabs are released and left open.',
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

const tabsNameSessionMcpTool: ToolDefinition<TabsNameSessionMcpArgs> = {
  name: 'tabs_name_session_mcp',
  description:
    'Name the current browser session so its tab group is visually distinguishable from other concurrent sessions. Call once at the start of a browser task with a short, task-relevant name (an emoji prefix is fine). The name becomes the Chrome tab group title for this session. Requires a browser session scope (session_id).',
  parameters: {
    name: {
      type: 'string',
      description:
        'Short task-relevant name for the session. Pass an empty string to clear the name and revert to the default group title.'
    }
  },
  execute: async (args, context) => {
    try {
      const scope =
        context?.browserSessionScope ??
        resolveBrowserSessionScope(
          args as { sessionId?: string; session_id?: string; turnId?: string; turn_id?: string }
        );
      const name = typeof args?.name === 'string' ? args.name : '';
      await tabGroupManager.initialize();
      // Scoped callers (CLI/MCP with --session) name their own session group;
      // unscoped callers (sidepanel) name the active global MCP tab group.
      const result = scope
        ? await tabGroupManager.nameSession(scope.sessionId, name)
        : await tabGroupManager.nameActiveMcpGroup(name);
      return {
        output: result
          ? `Session group titled "${result.title}".`
          : `Session name stored. No active tab group yet; the title will apply when the session creates or reuses a group.`
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

const SHORTCUT_PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

function extractShortcutVars(prompt: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of prompt.matchAll(SHORTCUT_PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

const shortcutsListTool: ToolDefinition = {
  name: 'shortcuts_list',
  description:
    'List all available shortcuts and workflows (shortcuts and workflows are interchangeable). Returns each shortcut with its command, type, starting URL, declared {{var}} placeholders, model, and skipPermissions flag — enough for an external agent to plan execution without a follow-up shortcuts_get call.',
  parameters: {},
  execute: async () => {
    try {
      const allPrompts = (await promptManager.getAllPrompts()).map((p) => ({
        id: p.id,
        ...(p.command && { command: p.command }),
        ...(p.type && { type: p.type }),
        ...(p.url && { url: p.url }),
        ...(p.model && { model: p.model }),
        ...(p.skipPermissions && { skipPermissions: true }),
        vars: typeof p.prompt === 'string' ? extractShortcutVars(p.prompt) : []
      }));
      if (allPrompts.length === 0) {
        return {
          output: JSON.stringify({ message: 'No shortcuts found', shortcuts: [] }, null, 2)
        };
      }
      return {
        output: JSON.stringify(
          {
            message: `Found ${allPrompts.length} shortcut(s)`,
            shortcuts: allPrompts
          },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `Failed to list shortcuts: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_list',
    description:
      'List all available shortcuts and workflows. Each entry includes id, command, type, url, vars (declared {{var}} placeholder names), model, skipPermissions.',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

const shortcutsGetTool: ToolDefinition<ShortcutLookupArgs> = {
  name: 'shortcuts_get',
  description:
    'Fetch the raw prompt text of a shortcut by id or command, without executing it. Use this when an external agent (e.g. CLI) wants to retrieve the shortcut definition and run it locally instead of triggering the in-browser sidepanel agent.',
  parameters: {
    shortcutId: { type: 'string', description: 'The ID of the shortcut to fetch' },
    command: {
      type: 'string',
      description:
        "The command name of the shortcut to fetch (e.g., 'debug'). Do not include the leading slash."
    }
  },
  execute: async (args) => {
    try {
      const { shortcutId, command } = args || {};
      if (!shortcutId && !command) {
        return { error: 'Either shortcutId or command is required.' };
      }
      let shortcut: ShortcutRecord | null = null;
      if (shortcutId) {
        shortcut = await promptManager.getPromptById(shortcutId);
      }
      if (!shortcut && command) {
        const cmd = command.startsWith('/') ? command.slice(1) : command;
        shortcut = await promptManager.getPromptByCommand(cmd);
      }
      if (!shortcut) {
        const tried = [shortcutId && `ID "${shortcutId}"`, command && `command "/${command}"`]
          .filter(Boolean)
          .join(' or ');
        return { error: `Shortcut not found (tried ${tried}).` };
      }
      return {
        output: JSON.stringify(
          {
            id: shortcut.id,
            command: shortcut.command,
            type: shortcut.type,
            prompt: shortcut.prompt,
            url: shortcut.url,
            model: shortcut.model,
            skipPermissions: shortcut.skipPermissions
          },
          null,
          2
        )
      };
    } catch (err) {
      return {
        error: `Failed to get shortcut: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_get',
    description: 'Fetch the raw prompt text of a shortcut by id or command, without executing it.',
    input_schema: {
      type: 'object',
      properties: {
        shortcutId: { type: 'string', description: 'The ID of the shortcut to fetch' },
        command: {
          type: 'string',
          description:
            "The command name of the shortcut to fetch (e.g., 'debug'). Do not include the leading slash."
        }
      },
      required: []
    }
  })
};

const shortcutsExecuteTool: ToolDefinition<ShortcutLookupArgs> = {
  name: 'shortcuts_execute',
  description:
    'Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.',
  parameters: {
    shortcutId: {
      type: 'string',
      description: 'The ID of the shortcut to execute'
    },
    command: {
      type: 'string',
      description:
        "The command name of the shortcut to execute (e.g., 'debug', 'summarize'). Do not include the leading slash."
    }
  },
  execute: async (args, context) => {
    try {
      const { shortcutId, command } = args;
      if (!shortcutId && !command)
        return {
          error:
            'Either shortcutId or command is required. Use shortcuts_list to see available shortcuts.'
        };
      const tabId = context?.tabId;
      if (!tabId)
        return {
          error: 'No tab context available. Cannot execute shortcut without a target tab.'
        };
      let shortcut: ShortcutRecord | null = null;
      if (shortcutId) {
        shortcut = await promptManager.getPromptById(shortcutId);
      } else if (command) {
        const cmd = command.startsWith('/') ? command.slice(1) : command;
        shortcut = await promptManager.getPromptByCommand(cmd);
      }
      if (!shortcut)
        return {
          error: `Shortcut not found. ${shortcutId ? `No shortcut with ID "${shortcutId}"` : `No shortcut with command "/${command}"`}. Use shortcuts_list to see available shortcuts.`
        };
      await promptManager.recordPromptUsage(shortcut.id);
      const cmdName = shortcut.command || shortcut.id;
      const promptText = `[[shortcut:${shortcut.id}:${cmdName}]]`;
      const result = await executeShortcutTask({
        tabId,
        tabGroupId: context?.tabGroupId,
        prompt: promptText,
        taskName: shortcut.command || shortcut.id,
        skipPermissions: shortcut.skipPermissions,
        model: shortcut.model
      });
      if (result.success) {
        return {
          output: JSON.stringify(
            {
              success: true,
              message: `Shortcut "${shortcut.command || shortcut.id}" started. Execution is running in a separate sidepanel window.`,
              shortcut: { id: shortcut.id, command: shortcut.command }
            },
            null,
            2
          )
        };
      }
      return { error: result.error || 'Shortcut execution failed' };
    } catch (err) {
      return {
        error: `Failed to execute shortcut: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'shortcuts_execute',
    description:
      'Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.',
    input_schema: {
      type: 'object',
      properties: {
        shortcutId: {
          type: 'string',
          description: 'The ID of the shortcut to execute'
        },
        command: {
          type: 'string',
          description:
            "The command name of the shortcut to execute (e.g., 'debug', 'summarize'). Do not include the leading slash."
        }
      },
      required: []
    }
  })
};

let _allTools: ToolRegistryEntry[] | null = null;

export function getAllTools(): ToolRegistryEntry[] {
  if (!_allTools) {
    _allTools = [
      javascriptTool,
      navigateTool,
      computerTool,
      findTool,
      formInputTool,
      getPageTextTool,
      readPageTool,
      resizeWindowTool,
      tabsContextTool,
      tabsCreateTool,
      turnAnswerStartTool,
      updatePlanTool,
      uploadImageTool,
      readConsoleMessagesTool,
      readNetworkRequestsTool,
      gifCreatorTool,
      tabsContextMcpTool,
      tabsCreateMcpTool,
      tabsFinalizeMcpTool,
      tabsNameSessionMcpTool,
      shortcutsListTool,
      shortcutsGetTool,
      shortcutsExecuteTool,
      batchTool,
      ...superduckTools
    ];
  }
  return _allTools;
}

export const allTools: ToolRegistryEntry[] = [
  javascriptTool,
  navigateTool,
  computerTool,
  findTool,
  formInputTool,
  getPageTextTool,
  readPageTool,
  resizeWindowTool,
  tabsContextTool,
  tabsCreateTool,
  turnAnswerStartTool,
  updatePlanTool,
  uploadImageTool,
  readConsoleMessagesTool,
  readNetworkRequestsTool,
  gifCreatorTool,
  tabsContextMcpTool,
  tabsCreateMcpTool,
  tabsFinalizeMcpTool,
  tabsNameSessionMcpTool,
  shortcutsListTool,
  shortcutsGetTool,
  shortcutsExecuteTool,
  batchTool,
  ...superduckTools
];

export const mcpToolNames = [
  'tabs_context_mcp',
  'tabs_create_mcp',
  'tabs_finalize_mcp',
  'tabs_name_session_mcp',
  'shortcuts_list',
  'shortcuts_get',
  ...superduckToolNames
];
