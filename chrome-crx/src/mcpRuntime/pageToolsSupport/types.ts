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

export type ToolTabAccess = 'read' | 'write';

export interface ToolContext {
  /**
   * Current executor anchor tab. Tool implementations should not use this as a
   * target tab for browser operations. Resolve requested/default tab targets
   * through resolveTabId so browser-session lease checks are applied.
   */
  tabId?: number;
  resolveTabId: (
    requestedTabId?: number,
    options?: { tabAccess?: ToolTabAccess }
  ) => Promise<number>;
  toolUseId?: string;
  /**
   * Executor/conversation session used for tracing and in-memory tool caches.
   * This does not imply ownership of browser tabs.
   */
  sessionId?: string;
  /**
   * Real browser lease scope. The executor always supplies this, using the
   * explicit transport session when present and the default browser session for
   * in-extension UI calls.
   */
  browserSessionScope: BrowserSessionScope;
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
  /**
   * Effective tab access level for the current execution. This may differ
   * from a tool's static ToolDefinition.tabAccess, for example inside batch
   * execution, so tool implementations should use this value for lease checks.
   */
  tabAccess: ToolTabAccess;
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
  tabAccess: ToolTabAccess;
  parameters: Record<string, ToolSchemaProperty>;
  execute: (input: TInput, context: ToolContext) => Promise<TResult>;
  toProviderSchema: (context?: ToolContext) => Promise<ToolProviderSchema> | ToolProviderSchema;
  setPromptsConfig?: (config: Record<string, unknown>) => void;
}
