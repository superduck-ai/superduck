import { isRecord } from '../../messageTypes';
import { trackEvent } from '../analytics';
import type { PermissionPromptRequest } from '../core/types';
import { tabGroupManager } from '../tabState';
import { getPendingPrefixTimeout, setPendingPrefixTimeout } from './toolContextState';

let permissionPromptChain: Promise<boolean> = Promise.resolve(true);

export async function showPermissionPrompt(
  permission: PermissionPromptRequest,
  tabId: number
): Promise<boolean> {
  const next = permissionPromptChain.then(() => showPermissionPromptInner(permission, tabId));
  permissionPromptChain = next.catch(() => false);
  return next;
}

async function showPermissionPromptInner(
  permission: PermissionPromptRequest,
  tabId: number
): Promise<boolean> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const existingTimeout = getPendingPrefixTimeout(tabId);
  if (existingTimeout) clearTimeout(existingTimeout);

  await tabGroupManager.addPermissionPrefix(tabId);
  setPendingPrefixTimeout(tabId, null);

  await chrome.storage.local.set({
    [`mcp_prompt_${requestId}`]: {
      prompt: permission,
      tabId,
      timestamp: Date.now()
    }
  });

  trackEvent('superduck.permission.prompted', {
    permission_type: permission.type,
    tool_type: permission.tool,
    tab_id: tabId
  });

  return new Promise<boolean>((resolve) => {
    let windowId: number | undefined;
    let responded = false;

    const respond = async (allowed: boolean = false) => {
      if (responded) return;
      responded = true;
      chrome.runtime.onMessage.removeListener(messageListener);
      trackEvent('superduck.permission.responded', {
        permission_type: permission.type,
        tool_type: permission.tool,
        tab_id: tabId,
        allowed,
        response_time_ms: Date.now() - startTime
      });
      await chrome.storage.local.remove(`mcp_prompt_${requestId}`);
      if (windowId) {
        chrome.windows.remove(windowId).catch(() => {});
      }
      await tabGroupManager.addLoadingPrefix(tabId);
      setPendingPrefixTimeout(tabId, null);
      resolve(allowed);
    };

    const messageListener = (msg: unknown) => {
      if (isRecord(msg) && 'MCP_PERMISSION_RESPONSE' === msg.type && msg.requestId === requestId) {
        respond(msg.allowed === true);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    chrome.windows.create(
      {
        url: chrome.runtime.getURL(
          `sidepanel.html?tabId=${tabId}&mcpPermissionOnly=true&requestId=${requestId}`
        ),
        type: 'popup',
        width: 600,
        height: 600,
        focused: true
      },
      (win) => {
        if (win) {
          windowId = win.id;
        } else {
          respond(false);
        }
      }
    );

    setTimeout(() => {
      respond(false);
    }, 30000);
  });
}
