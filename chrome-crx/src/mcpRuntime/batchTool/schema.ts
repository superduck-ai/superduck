import { MAX_BATCH_ACTIONS, MIN_BATCH_ACTIONS, BROWSER_BATCH_DESCRIPTION } from './constants';

export const batchToolParameters = {
  actions: {
    type: 'array' as const,
    minItems: MIN_BATCH_ACTIONS,
    maxItems: MAX_BATCH_ACTIONS,
    items: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string' as const,
          description: 'Optional caller label used in the per-step result.'
        },
        tool: {
          type: 'string' as const,
          description:
            'Allowed browser tool name. Observation tools may end a batch but their results cannot be used by later actions in the same batch. Control-flow, shortcut, superduck_* and JavaScript tools are intentionally excluded.'
        },
        input: { type: 'object' as const, description: 'Input parameters for the selected tool' },
        waitAfter: {
          type: 'string' as const,
          enum: ['auto', 'load', 'none'],
          description: 'Optional per-action wait override. Default: auto.'
        }
      },
      required: ['tool', 'input']
    },
    description: 'Array of actions to execute sequentially'
  },
  tabId: {
    type: 'number' as const,
    description:
      'Default tab ID. Applied to every action; P1 requires all actions in a batch to target the same tab.'
  },
  onError: {
    type: 'string' as const,
    enum: ['stop', 'continue'],
    description: 'Failure policy. Default stop. Continue is only honored for read-only actions.'
  },
  resultMode: {
    type: 'string' as const,
    enum: ['summary', 'detailed'],
    description: 'summary returns concise step lines; detailed appends per-step JSON.'
  },
  screenshot: {
    type: 'string' as const,
    enum: ['last', 'none'],
    description:
      'Return the last child screenshot image, or none. Default: last. Returned images are batch results and are not available as planning input for later actions in the same batch.'
  }
};

export async function batchToolProviderSchema() {
  return {
    name: 'browser_batch',
    description: `${BROWSER_BATCH_DESCRIPTION} Use ${MIN_BATCH_ACTIONS}-${MAX_BATCH_ACTIONS} actions per batch.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        actions: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              id: {
                type: 'string' as const,
                description: 'Optional caller label used in the per-step result'
              },
              tool: {
                type: 'string' as const,
                description:
                  'Allowed browser tool name. Use one of computer, form_input, read_page, find, get_page_text, read_console_messages, read_network_requests, resize_window. Navigation must run as a separate navigate tool call. Observation tools may end a batch but their results cannot be used by later actions in that same batch.'
              },
              input: {
                type: 'object' as const,
                description: 'Input parameters for the tool, same as calling it directly'
              },
              waitAfter: {
                type: 'string' as const,
                enum: ['auto', 'load', 'none'],
                description: 'Optional per-action wait override. Default auto.'
              }
            },
            required: ['tool', 'input']
          },
          description: `Array of {tool, input} actions to execute sequentially (${MIN_BATCH_ACTIONS}-${MAX_BATCH_ACTIONS} actions)`,
          minItems: MIN_BATCH_ACTIONS,
          maxItems: MAX_BATCH_ACTIONS
        },
        tabId: {
          type: 'number' as const,
          description:
            'Default tab ID applied to every action. All actions in one batch must target this same tab.'
        },
        onError: {
          type: 'string' as const,
          enum: ['stop', 'continue'],
          description:
            'Failure policy. Default stop. Continue is only honored for read-only actions.'
        },
        resultMode: {
          type: 'string' as const,
          enum: ['summary', 'detailed'],
          description: 'summary returns concise step lines; detailed appends per-step JSON.'
        },
        screenshot: {
          type: 'string' as const,
          enum: ['last', 'none'],
          description:
            'Return the last child screenshot image, or none. Default last. Returned images are batch results and are not available as planning input for later actions in the same batch.'
        }
      },
      required: ['actions']
    }
  };
}
