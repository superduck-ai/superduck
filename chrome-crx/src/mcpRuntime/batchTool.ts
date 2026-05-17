import type { ToolContext, ToolDefinition, ToolResult } from './pageTools';
import { coerceToolInputTypes } from './pageTools';
import { waitForTabLoading } from './shared';

interface BatchAction {
  tool: string;
  input: Record<string, unknown>;
}

interface BatchToolParams {
  actions: BatchAction[];
  tabId?: number;
}

const NON_NAVIGATING_TOOLS = new Set([
  'read_page', 'find', 'get_page_text', 'read_console_messages',
  'read_network_requests', 'tabs_context', 'tabs_context_mcp',
  'turn_answer_start', 'update_plan', 'resize_window'
]);

let cachedRegistry: { tools: ToolDefinition[]; map: Map<string, ToolDefinition> } | null = null;

async function getToolRegistry(): Promise<{ tools: ToolDefinition[]; map: Map<string, ToolDefinition> }> {
  if (!cachedRegistry) {
    const { getAllTools } = await import('./core/tools');
    const tools = getAllTools();
    const map = new Map<string, ToolDefinition>();
    for (const t of tools) map.set(t.name, t);
    cachedRegistry = { tools, map };
  }
  return cachedRegistry;
}

export const batchTool: ToolDefinition<BatchToolParams> = {
  name: 'browser_batch',
  description:
    'Execute multiple browser actions sequentially in a single call. Prefer this over individual tool calls when you can predict 2+ steps ahead (e.g., click → type → click → screenshot). Actions run in order and stop on first error. Significantly faster than separate calls.',
  parameters: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Tool name (e.g., "computer", "form_input", "navigate")' },
          input: { type: 'object', description: 'Input parameters for the tool' }
        },
        required: ['tool', 'input']
      },
      description: 'Array of actions to execute sequentially'
    },
    tabId: {
      type: 'number',
      description: 'Tab ID. Applied to each action if not specified in the action input.'
    }
  },
  execute: async (params: BatchToolParams, context: ToolContext): Promise<ToolResult> => {
    if (!params.actions || !Array.isArray(params.actions) || params.actions.length === 0) {
      return { error: 'actions array is required and must not be empty' };
    }

    const { tools: allToolsList, map: toolRegistry } = await getToolRegistry();

    const completedOutputs: string[] = [];
    let lastImage: { base64Image: string; imageFormat: string } | undefined;

    for (let i = 0; i < params.actions.length; i++) {
      const action = params.actions[i];
      if (action.tool === 'browser_batch') {
        return { error: `actions[${i}]: browser_batch cannot be nested` };
      }
      const tool = toolRegistry.get(action.tool);
      if (!tool) {
        const errMsg = `actions[${i}] unknown tool: "${action.tool}" (${completedOutputs.length} completed, ${params.actions.length - i - 1} remaining)`;
        return {
          output: completedOutputs.length > 0 ? completedOutputs.join('\n') + '\n\n' + errMsg : undefined,
          error: errMsg,
          ...(lastImage || {})
        };
      }

      const input = { ...action.input };
      if (params.tabId != null && input.tabId == null) {
        input.tabId = params.tabId;
      }

      const coerced = coerceToolInputTypes(action.tool, input, allToolsList);

      let result: ToolResult;
      try {
        result = await tool.execute(coerced, context);
      } catch (err) {
        const errMsg = `actions[${i}] (${action.tool}) failed: ${err instanceof Error ? err.message : 'Unknown error'} (${completedOutputs.length} completed, ${params.actions.length - i - 1} remaining)`;
        return {
          output: completedOutputs.length > 0 ? completedOutputs.join('\n') + '\n\n' + errMsg : undefined,
          error: errMsg,
          ...(lastImage || {})
        };
      }

      if (result.error) {
        const errMsg = `actions[${i}] (${action.tool}) failed: ${result.error} (${completedOutputs.length} completed, ${params.actions.length - i - 1} remaining)`;
        return {
          output: completedOutputs.length > 0 ? completedOutputs.join('\n') + '\n\n' + errMsg : undefined,
          error: errMsg,
          ...(lastImage || {})
        };
      }

      if (result.type === 'permission_required') {
        return result;
      }

      if (result.output) {
        completedOutputs.push(`[${action.tool}] ${result.output}`);
      }
      if (result.base64Image) {
        lastImage = { base64Image: result.base64Image, imageFormat: result.imageFormat || 'jpeg' };
      }

      // 只在可能触发导航的 action 后等待页面加载
      if (i < params.actions.length - 1 && !NON_NAVIGATING_TOOLS.has(action.tool)) {
        const tabId = (input.tabId as number) ?? context.tabId;
        if (tabId != null) {
          await waitForTabLoading(tabId);
        }
      }
    }

    return {
      output: completedOutputs.join('\n'),
      ...(lastImage || {})
    };
  },
  toProviderSchema: async () => ({
    name: 'browser_batch',
    description:
      'Execute multiple browser actions sequentially in a single call. Prefer this over individual tool calls when you can predict 2+ steps ahead (e.g., click → type → click → screenshot). Significantly faster than separate calls. Stops on first error.',
    input_schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tool: {
                type: 'string',
                description: 'Tool name (e.g., "computer", "form_input", "navigate", "read_page")'
              },
              input: {
                type: 'object',
                description: 'Input parameters for the tool, same as calling it directly'
              }
            },
            required: ['tool', 'input']
          },
          description: 'Array of {tool, input} actions to execute sequentially'
        },
        tabId: {
          type: 'number',
          description: 'Default tab ID applied to each action if not specified in the action input'
        }
      },
      required: ['actions']
    }
  })
};
