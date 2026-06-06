import { type AnnouncementFeatureValue, PermissionActionType } from '../extensionServices';
import type { PermissionMode } from './sidepanelUtils';
import type { PromptAttachmentPayload } from './sidepanelUtils';
import type { PlanStructure } from './planMode';
import type { LightningMessage, ParsedCommand } from './lightningCommands';
import type {
  ApiConversationMessage,
  ApiImageContentBlock,
  ApiMessageBlock,
  ApiResponseMessage,
  ApiToolResultBlock,
  ApiToolUseBlock
} from '../messageTypes';

// ─── Chat types ────────────────────────────────────────────────────────────────

export type ChatRole = 'system' | 'user' | 'assistant';
export type VisibleChatRole = Exclude<ChatRole, 'system'>;
export type NotificationPreference = 'enabled' | 'disabled' | undefined;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

// ─── Permission types ──────────────────────────────────────────────────────────

export interface PermissionPromptData {
  type: 'permission_required';
  tool: PermissionActionType;
  url: string;
  toolUseId?: string;
  actionData?: {
    screenshot?: string;
    coordinate?: [number, number];
    text?: string;
    fromDomain?: string;
    toDomain?: string;
    plan?: PlanStructure;
    imageId?: string;
    start_coordinate?: [number, number];
    remoteMcp?: {
      serverName: string;
      serverIconUrl: string;
      toolDisplayName: string;
      toolDescription: string;
      alwaysApprovedKey: string;
    };
  };
}

export type PermissionGrantScope = {
  type: 'netloc' | 'domain_transition';
  netloc?: string;
  fromDomain?: string;
  toDomain?: string;
};

export const PERMISSION_ACTION_TYPES = new Set<string>(Object.values(PermissionActionType));

// ─── Runtime / messaging types ─────────────────────────────────────────────────

export interface RuntimeMessage {
  type?: string;
  prompt?: string;
  permissionMode?: PermissionMode;
  selectedModel?: string;
  sessionId?: string;
  attachments?: PromptAttachmentPayload[];
  conversationUuid?: string;
  targetTabId?: number;
  windowSessionId?: string;
  isScheduledTask?: boolean;
  taskName?: string;
  mainTabId?: number;
  secondaryTabId?: number;
  request_id?: string;
  client_type?: string;
  current_name?: string;
}

export interface PairingPromptState {
  requestId: string;
  clientType: string;
  currentName?: string;
}

export interface PendingPromptPayload {
  prompt: string;
  attachments: PromptAttachmentPayload[];
  isAnnotated: boolean;
}

// ─── Tab / domain types ────────────────────────────────────────────────────────

export interface BlockedTabInfo {
  tabId: number;
  title: string;
  url: string;
  category: string;
}

// ─── Session types ─────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  uiMessages: ChatMessage[];
  apiMessages: ApiConversationMessage[];
  selectedModel: string;
  permissionMode: PermissionMode;
  createdAt?: number;
  conversationUuid?: string;
  remoteSessionId?: string;
}

export interface SessionIndexEntry {
  sessionId: string;
  conversationUuid?: string;
  remoteSessionId?: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
  preview?: string;
}

// ─── Tool / block types ────────────────────────────────────────────────────────

export interface ToolUseBlock {
  id: string;
  name: string;
  input: unknown;
  type: 'tool_use';
}

export type ToolInputRecord = Record<string, unknown>;

export type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export type Base64ImageSource = {
  type: 'base64';
  media_type: string;
  data: string;
  metadata?: Record<string, unknown>;
};

export type Base64ImageBlock = ApiImageContentBlock & {
  source: Base64ImageSource;
};

export type ToolResultDisplayContent =
  | string
  | {
      text: string;
      images: Base64ImageBlock[];
    };

// ─── Lightning mode types ──────────────────────────────────────────────────────

export type LightningContentArray = Exclude<LightningMessage['content'], string>;
export type LightningSystemPromptBlock = Extract<LightningContentArray[number], { type: 'text' }>;
export type LightningCreateApiMessageParams = {
  model?: string;
  maxTokens: number;
  messages: LightningMessage[];
  system: LightningSystemPromptBlock[] | string;
};

export type CommandExecutionResult = {
  action: string;
  input: ParsedCommand['args'] | PlanStructure | Record<string, unknown>;
  output: string;
  durationMs: number;
};

// ─── API response types ────────────────────────────────────────────────────────

export type ResponseWithMessageLimit = ApiResponseMessage & {
  message_limit?: unknown;
};

// ─── Message grouping types ────────────────────────────────────────────────────

export interface ConversationGroup {
  type: 'conversation';
  userMessage: ApiConversationMessage;
  hasVisibleUser: boolean;
  toolResults: ApiToolResultBlock[];
  assistantBlocks: ApiMessageBlock[];
}

export interface SummaryGroup {
  type: 'summary';
  message: ApiConversationMessage;
}

export type MessageGroup = ConversationGroup | SummaryGroup;

export interface TimelineGroupItemData {
  block: ApiToolUseBlock | ApiToolResultBlock;
  index: number;
  renderable: boolean;
}

export interface TimelineGroupData {
  items: TimelineGroupItemData[];
  startIndex: number;
  isLastBlockOfMessage: boolean;
}

export type GroupedContentBlock =
  | {
      type: 'single';
      content: ApiMessageBlock;
      index: number;
    }
  | {
      type: 'group';
      content: TimelineGroupData;
      index: number;
    };

// ─── Streaming types ───────────────────────────────────────────────────────────

export interface StreamingTextStore {
  getSnapshot: () => string;
  subscribe: (cb: () => void) => () => void;
  set: (value: string) => void;
}

// ─── Config types ──────────────────────────────────────────────────────────────

export type AnnouncementConfig = AnnouncementFeatureValue;
