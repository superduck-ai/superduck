import type { ApiToolResultBlock } from '../../messageTypes';
import type { PermissionManager as PermissionManagerClass } from '@/permissions/PermissionManager';
import type { ToolContext, ToolResult } from '../pageToolsSupport/types';
import type { tabGroupManager } from '../tabState';

export type BridgeMessage = Record<string, unknown> & { type?: string };
export type PermissionPromptRequest = ToolResult & {
  type: 'permission_required';
  tool: string;
  url: string;
  toolUseId?: string;
  actionData?: Record<string, unknown>;
};
export type PermissionPromptHandler = (
  permission: PermissionPromptRequest,
  tabId: number
) => Promise<boolean>;
export type RuntimeCreateApiMessage = NonNullable<ToolContext['createApiMessage']>;
export type ErrorResponse = {
  content: NonNullable<ApiToolResultBlock['content']>;
  is_error: boolean;
};
export type ExecuteToolResponse = {
  actionData?: Record<string, unknown>;
  base64Image?: string;
  content?: ApiToolResultBlock['content'];
  error?: string;
  imageFormat?: string;
  is_error?: boolean;
  output?: string;
  tabContext?: ToolResult['tabContext'];
  tool?: string;
  toolUseId?: string;
  tool_use_id?: string;
  type?: string;
  url?: string;
};
export type ToolUseRequest = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};
export type ToolExecutorProcessOptions = {
  permissionManager?: PermissionManagerClass;
  onPermissionRequired?: PermissionPromptHandler;
};
export type TabGroupRecord = Awaited<ReturnType<typeof tabGroupManager.findGroupByTab>>;
export type RecordedFrame = {
  base64: string;
  action?: Record<string, unknown>;
  frameNumber?: number;
  timestamp?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
};
export type RecordedAction = {
  type: string;
  coordinate?: unknown;
  description?: string;
  start_coordinate?: unknown;
  text?: string;
  timestamp?: number;
  [key: string]: unknown;
};
export type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};
export interface ToolInputRecord extends Record<string, unknown> {
  action?: string;
  coordinate?: unknown;
  start_coordinate?: unknown;
  tabGroupId?: unknown;
  tabId?: unknown;
  text?: string;
  url?: string;
}
