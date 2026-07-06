import type { ToolDefinition } from '../pageToolsSupport/types';
import type { BatchToolParams } from './types';
import { BROWSER_BATCH_DESCRIPTION } from './constants';
import { batchToolParameters, batchToolProviderSchema } from './schema';
import { executeBatch } from './runner';

export const batchTool: ToolDefinition<BatchToolParams> = {
  name: 'browser_batch',
  description: BROWSER_BATCH_DESCRIPTION,
  tabAccess: 'write',
  parameters: batchToolParameters,
  execute: executeBatch,
  toProviderSchema: batchToolProviderSchema
};
