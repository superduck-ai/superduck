import type { PermissionManager } from '@/permissions/PermissionManager';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  CreateApiMessageParams
} from '../../messageTypes';
import type { BrowserSessionScope } from '../sessionScope';

export interface ToolSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, ToolSchemaProperty>;
  items?: ToolSchemaProperty;
  required?: boolean | string[];
  [key: string]: unknown;
}

export interface ToolProviderSchema {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, ToolSchemaProperty>;
    required?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ToolTabSummary {
  id?: number;
  title?: string;
  url?: string;
}

export interface ToolContext {
  tabId?: number;
  toolUseId?: string;
  /**
   * Executor/conversation session used for tracing and in-memory tool caches.
   * This does not imply ownership of browser tabs.
   */
  sessionId?: string;
  /**
   * Real browser lease scope supplied by CLI/MCP callers. Only this scope may
   * claim, resume, or release managed browser tabs.
   */
  browserSessionScope?: BrowserSessionScope;
  messages?: ApiConversationMessage[];
  permissionManager: PermissionManager;
  createApiMessage?: (
    params: CreateApiMessageParams,
    label?: string
  ) => Promise<ApiResponseMessage>;
  setTurnApprovedDomains?: (domains: string[]) => void;
  skipIndicator?: boolean;
  tabGroupId?: number;
  model?: string;
  messagesClient?: unknown;
  availableTools?: ToolDefinition[];
}

export interface ToolResult {
  output?: string;
  error?: string;
  base64Image?: string;
  imageFormat?: string;
  imageId?: string;
  type?: string;
  tool?: string;
  url?: string;
  toolUseId?: string;
  actionData?: Record<string, unknown>;
  tabContext?: {
    currentTabId?: number;
    executedOnTabId?: number;
    availableTabs?: ToolTabSummary[];
    tabCount?: number;
    tabGroupId?: number;
  };
  [key: string]: unknown;
}

export interface ToolDefinition<TInput = unknown, TResult extends ToolResult = ToolResult> {
  name: string;
  description: string;
  parameters: Record<string, ToolSchemaProperty>;
  execute: (input: TInput, context: ToolContext) => Promise<TResult>;
  toProviderSchema: (context?: ToolContext) => Promise<ToolProviderSchema> | ToolProviderSchema;
  setPromptsConfig?: (config: Record<string, unknown>) => void;
}
