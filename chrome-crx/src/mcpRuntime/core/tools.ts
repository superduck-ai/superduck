import { StorageKeys, setStorageValue } from '../../extensionServices';
import { formatTabsOutput, promptManager } from '../shared';
import { tabGroupManager } from '../tabState';
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
  type ToolContext,
  type ToolDefinition,
  type ToolResult
} from '../browserAutomation';
import { superduckTools, superduckToolNames } from '../superduckTools';

interface TabsContextMcpArgs {
  createIfEmpty?: boolean;
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
    'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. IMPORTANT: Always reuse existing tabs for navigation. Only create a new tab (using tabs_create_mcp) when the user explicitly requests opening a new tab or when you need to keep multiple pages open simultaneously.',
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
      'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. IMPORTANT: Always reuse existing tabs for navigation. Only create a new tab (using tabs_create_mcp) when the user explicitly requests opening a new tab or when you need to keep multiple pages open simultaneously.',
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

const tabsCreateMcpTool: ToolDefinition = {
  name: 'tabs_create_mcp',
  description:
    'Creates a new empty tab in the MCP tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
  parameters: {},
  execute: async () => {
    try {
      await tabGroupManager.initialize();
      const context = await tabGroupManager.getOrCreateMcpTabContext({
        createIfEmpty: false
      });
      if (!context?.tabGroupId)
        return {
          error:
            'No MCP tab group exists. Use tabs_context_mcp with createIfEmpty: true first to create one.'
        };
      const tabGroupId = context.tabGroupId;
      const newTab = await chrome.tabs.create({
        url: 'chrome://newtab',
        active: true
      });
      if (!newTab.id) throw new Error('Failed to create tab - no tab ID returned');
      await chrome.tabs.group({ tabIds: newTab.id, groupId: tabGroupId });
      const groupTabs = (await chrome.tabs.query({ groupId: tabGroupId }))
        .filter((tab) => tab.id !== undefined)
        .map((tab) => ({
          id: tab.id!,
          title: tab.title || '',
          url: tab.url || ''
        }));
      return {
        output: `Created new tab. Tab ID: ${newTab.id}`,
        tabContext: {
          currentTabId: newTab.id,
          executedOnTabId: newTab.id,
          availableTabs: groupTabs,
          tabCount: groupTabs.length,
          tabGroupId
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
      'Creates a new empty tab in the MCP tab group. IMPORTANT: Only use this when the user explicitly asks to open a new tab, or when you need to keep multiple pages open at the same time. For simple navigation tasks, reuse existing tabs with the navigate tool instead.',
    input_schema: { type: 'object', properties: {}, required: [] }
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
        const tried = [
          shortcutId && `ID "${shortcutId}"`,
          command && `command "/${command}"`
        ]
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
    description:
      'Fetch the raw prompt text of a shortcut by id or command, without executing it.',
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
      shortcutsListTool,
      shortcutsGetTool,
      shortcutsExecuteTool,
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
  shortcutsListTool,
  shortcutsGetTool,
  shortcutsExecuteTool,
  ...superduckTools
];

export const mcpToolNames = [
  'tabs_context_mcp',
  'tabs_create_mcp',
  'shortcuts_list',
  'shortcuts_get',
  ...superduckToolNames
];
