export interface ToolContext {
  tabId?: number;
  toolUseId?: string;
  sessionId?: string;
  messages?: any[];
  permissionManager: any;
  createApiMessage?: (params: any, label: string) => Promise<any>;
  setTurnApprovedDomains?: (domains: string[]) => void;
  skipIndicator?: boolean;
  tabGroupId?: number;
  model?: string;
  messagesClient?: any;
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
  actionData?: any;
  tabContext?: {
    currentTabId?: number;
    executedOnTabId?: number;
    availableTabs?: any[];
    tabCount?: number;
    tabGroupId?: number;
  };
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (input: any, context?: any) => Promise<any>;
  toProviderSchema: (context?: any) => Promise<any> | any;
  setPromptsConfig?: (config: any) => void;
}
