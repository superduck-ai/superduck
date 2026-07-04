import type { MutableRefObject } from 'react';
import {
  tabGroupManager,
  shouldShowPlanMode,
  getPlanModeSystemReminder
} from '../../../mcpRuntime';
import { DEFAULT_BROWSER_SESSION_ID } from '../../../mcpRuntime/sessionScope';
import { normalizeImageMediaType } from '../../sidepanelGuards';
import { calculateMessageLimitFromUsage } from '../../conversation/messageLimits';
import type { ApiConversationMessage, ApiInputContentBlock } from '../../../messageTypes';
import type { PromptAttachmentPayload } from '../../sidepanelUtils';

const DEFAULT_BROWSER_SESSION_CONTEXT = {
  browserSessionScope: { sessionId: DEFAULT_BROWSER_SESSION_ID },
  tabAccess: 'read' as const
};

const ANNOTATION_REMINDER =
  "<system-reminder>\nCONTEXT ABOUT ANNOTATIONS IN USER SCREENSHOTS:\n\nThe GLOWING BLUE OUTLINES you see are USER-SELECTED REGIONS on the user's screenshot. These markings:\n- Are regions selected by the user to point out specific areas\n- Are NOT part of the website/interface/UI\n- Will NOT appear in screenshots you take yourself\n- Have white outlines for visibility on all backgrounds\n\nUser screenshots may show a different viewport/responsive layout than what you see. Page elements may be in different positions due to:\n- Different screen sizes or browser window dimensions\n- Responsive design breakpoints\n- Mobile vs desktop views\n- Zoom levels or scaling\n\nINSTRUCTIONS FOR HANDLING ANNOTATED USER SCREENSHOTS:\n1. FIRST, take your own screenshot to see the current page state and layout\n2. Compare the user's annotated screenshot with your view to identify layout differences\n3. The blue outlines indicate regions the user selected - focus on what's inside or near these areas\n4. Look for what UI element the annotation is highlighting based on visual context\n5. Account for responsive changes - an element marked on the right might be below on your screen\n6. Use the user's description combined with the annotation to determine intent\n7. Find and interact with the actual UI element being indicated\n\nFor example: If a blue outline highlights a menu item that appears horizontally in the user's screenshot but is in a hamburger menu on your view, open the hamburger menu first to find the item.\n</system-reminder>";

export interface PrepareUserMessageParams {
  trimmed: string;
  attachments: PromptAttachmentPayload[];
  isAnnotated: boolean;
  executionTabId: number | undefined;
  apiMessages: ApiConversationMessage[];
  serverContextLengthRef: MutableRefObject<number | undefined>;
  compactConversation: (force: boolean) => Promise<ApiConversationMessage[]>;
  permissionModeRef: MutableRefObject<string>;
  hasApprovedPlanRef: MutableRefObject<boolean>;
  setApiMessages: (messages: ApiConversationMessage[]) => void;
}

export async function prepareUserMessage(
  params: PrepareUserMessageParams
): Promise<{ workingMessages: ApiConversationMessage[]; baseMessages: ApiConversationMessage[] }> {
  let baseMessages = params.apiMessages;
  if (
    calculateMessageLimitFromUsage(
      baseMessages[baseMessages.length - 1]?.usage,
      params.serverContextLengthRef.current
    ).type === 'exceeded_limit'
  ) {
    baseMessages = await params.compactConversation(false);
  }

  const userContent: ApiInputContentBlock[] = [];
  if (params.trimmed) {
    userContent.push({ type: 'text', text: params.trimmed });
  }
  for (const attachment of params.attachments) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: normalizeImageMediaType(attachment.mediaType),
        data: attachment.base64
      }
    });
  }
  if (params.attachments.length > 0 && params.isAnnotated) {
    userContent.push({ type: 'text', text: ANNOTATION_REMINDER });
  }

  if (typeof params.executionTabId === 'number') {
    try {
      const availableTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        params.executionTabId,
        DEFAULT_BROWSER_SESSION_CONTEXT
      );
      if (availableTabs && availableTabs.length > 0) {
        const tabInfo = {
          availableTabs: availableTabs.map((t) => ({
            id: t.id,
            title: t.title,
            url: t.url
          })),
          ...(baseMessages.length === 0 ? { initialTabId: params.executionTabId } : {})
        };
        userContent.push({
          type: 'text',
          text: `<system-reminder>${JSON.stringify(tabInfo)}</system-reminder>`
        });
      }
    } catch {
      // silently fail tab context injection
    }
  }

  if (shouldShowPlanMode(params.permissionModeRef.current, params.hasApprovedPlanRef.current)) {
    userContent.push({ type: 'text', text: getPlanModeSystemReminder() });
  }

  const nextUserMessage: ApiConversationMessage = { role: 'user', content: userContent };
  const workingMessages: ApiConversationMessage[] = [...baseMessages, nextUserMessage];
  params.setApiMessages(workingMessages);

  return { workingMessages, baseMessages };
}
