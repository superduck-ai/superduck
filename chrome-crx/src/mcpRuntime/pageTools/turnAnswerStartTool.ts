import type { ToolDefinition, ToolSchemaProperty } from '../pageToolsSupport/types';
import type { EmptyToolInput } from './types';

const turnAnswerStartSchema: {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required: string[];
} = {
  type: 'object',
  properties: {},
  required: []
};

export const turnAnswerStartTool: ToolDefinition<EmptyToolInput> = {
  name: 'turn_answer_start',
  description:
    'Call this immediately before your text response to the user for this turn. Required every turn - whether or not you made tool calls. After calling, write your response. No more tools after this.',
  parameters: {},
  execute: async () => ({ output: 'Proceed with your response.' }),
  toProviderSchema() {
    return {
      type: 'custom',
      name: this.name,
      description: this.description,
      input_schema: turnAnswerStartSchema
    };
  }
};
