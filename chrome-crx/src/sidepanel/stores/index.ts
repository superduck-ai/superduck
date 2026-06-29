// =============================================================================
// Stores Index — 统一导出所有 Zustand stores
// =============================================================================

// Chat — 消息与聊天状态
export { useChatStore } from './chatStore';

// Agent — Agent 执行状态
export { useAgentStore } from './agentStore';

// Session — 会话管理
export { useSessionStore } from './sessionStore';

// Permission — 权限管理
export { usePermissionStore } from './permissionStore';

// Model — 模型/Provider 配置
export { useModelStore } from './modelStore';

// Attachment — 截图与附件
export { useAttachmentStore } from './attachmentStore';

// UI — UI 模态框/菜单/标志位 (legacy, 从 stores.ts 迁移)
export { useUIStore } from './uiStore';

// Notification — 通知与消息限制
export { useNotificationStore } from './notificationStore';

// Tab — 当前标签页与输入目标
export { useTabStore } from './tabStore';

// Chat Actions — ChatInputArea 的回调函数（避免 prop drilling）
export { useChatActionsStore } from './chatActionsStore';

// Chat Input — ChatInputArea 的状态和 refs（避免 prop drilling）
export { useChatInputStore } from './chatInputStore';
