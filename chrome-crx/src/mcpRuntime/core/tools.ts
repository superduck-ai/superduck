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
import { tabsContextMcpTool, tabsCreateMcpTool, tabsFinalizeMcpTool } from './mcpTools';
import { shortcutsListTool, shortcutsGetTool, shortcutsExecuteTool } from './shortcutTools';

type RuntimeToolExecute = {
  bivarianceHack(input: unknown, context: ToolContext): Promise<ToolResult>;
}['bivarianceHack'];
export type ToolRegistryEntry = Omit<ToolDefinition<unknown, ToolResult>, 'execute'> & {
  execute: RuntimeToolExecute;
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
  'shortcuts_list',
  'shortcuts_get',
  ...superduckToolNames
];
