import type { MutableRefObject } from 'react';
import { tabGroupManager, formatTabsOutput, cdpDebugger } from '../../mcpRuntime';
import { shouldShowPlanMode } from '../../mcpRuntime/pageToolsSupport/helpers';
import { DEFAULT_BROWSER_SESSION_ID } from '../../mcpRuntime/sessionScope';
import { getLightningScreenshotReminder, normalizeImageMediaType } from '../sidepanelGuards';
import type { LightningMessage } from './commands';
import type { LightningContentArray } from '../types';
import type { LightningConfigController } from './config';

const DEFAULT_BROWSER_SESSION_CONTEXT = {
  browserSessionScope: { sessionId: DEFAULT_BROWSER_SESSION_ID },
  tabAccess: 'read' as const
};

export interface BuildUserMessageParams {
  message: string;
  attachments: Array<{ base64: string; mediaType: string }> | undefined;
  tabId: number | null;
  config: LightningConfigController;
  permissionMode: string;
  planApprovedRef: MutableRefObject<boolean>;
  maybeCompactLightningMessages: (messages: LightningMessage[]) => Promise<LightningMessage[]>;
  lnMessagesRef: MutableRefObject<LightningMessage[]>;
  setLnMessages: (messages: LightningMessage[]) => void;
  cancelledRef: MutableRefObject<boolean>;
  tabContextHashRef: MutableRefObject<string | null>;
}

const PLAN_MODE_REMINDER =
  '<system-reminder>You are in planning mode. Before executing any other commands, you must first present a plan using the PL command. The plan is a JSON object with "domains" (list of domains you will visit) and "approach" (high-level steps you will take). If the user denies your plan, ask them what changes they would like you to make. Example:\nPlanning to search for weather.\nPL {"domains": ["google.com"], "approach": ["Search for weather in San Francisco", "Read the results"]}\n<<END>></system-reminder>';

export async function buildUserMessage(
  params: BuildUserMessageParams
): Promise<{ allMessages: LightningMessage[] } | null> {
  const userContent: LightningContentArray = [];

  if (params.tabId) {
    try {
      const tabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        params.tabId,
        DEFAULT_BROWSER_SESSION_CONTEXT
      );
      if (tabs.length > 0) {
        params.tabContextHashRef.current =
          tabs
            .map((t) => t.id)
            .sort((a: number, b: number) => a - b)
            .join(',') + `:${params.tabId}`;
        const tabContext = formatTabsOutput(tabs, undefined, params.tabId);
        userContent.push({
          type: 'text',
          text: `<system-reminder>${tabContext}</system-reminder>`
        });
      }
    } catch {
      /* ignore */
    }
  }

  userContent.push({ type: 'text', text: params.message });

  if (params.attachments?.length) {
    for (const att of params.attachments) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizeImageMediaType(att.mediaType),
          data: att.base64
        }
      });
    }
  }

  if (!params.attachments?.length && params.tabId) {
    try {
      const screenshot = await cdpDebugger.screenshot(
        params.tabId,
        {
          pxPerToken: 28,
          maxTargetPx: params.config.maxImageDimension,
          maxTargetTokens: 1568
        },
        { skipIndicator: true }
      );
      userContent.push({
        type: 'text',
        text: getLightningScreenshotReminder(screenshot.width, screenshot.height)
      });
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizeImageMediaType(screenshot.format),
          data: screenshot.base64
        },
        _autoScreenshot: true
      });
    } catch {
      /* ignore */
    }
  }

  if (shouldShowPlanMode(params.permissionMode, params.planApprovedRef.current)) {
    userContent.push({ type: 'text', text: PLAN_MODE_REMINDER });
  }

  const compactedHistory = await params.maybeCompactLightningMessages(params.lnMessagesRef.current);
  if (params.cancelledRef.current) return null;
  if (compactedHistory !== params.lnMessagesRef.current) {
    params.lnMessagesRef.current = compactedHistory;
    params.setLnMessages(compactedHistory);
  }

  const allMessages: LightningMessage[] = [
    ...compactedHistory,
    { role: 'user', content: userContent }
  ];
  return { allMessages };
}
