import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MemoizedFormattedMessage, useIntlSafe } from '../index-react-dom-intl';
import {
  PermissionActionType,
  PermissionDuration,
  getPermissionActionText
} from '../extensionServices';
import { trackEvent } from '../mcpRuntime';
import { PermissionActionButton, PlanApprovalModal } from './MessageComponents';
import type { PermissionGrantScope, PermissionPromptData } from './types';
import { PERMISSION_ACTION_TYPES } from './types';
import { isRecord } from '../messageTypes';

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isPermissionPromptData(value: unknown): value is PermissionPromptData {
  return (
    isRecord(value) &&
    value.type === 'permission_required' &&
    typeof value.url === 'string' &&
    typeof value.tool === 'string' &&
    PERMISSION_ACTION_TYPES.has(value.tool)
  );
}

// ─── InlinePermissionPrompt — rendered at bottom of chat (bundle's UH/BH/$H/ZH) ───

export function InlinePermissionPrompt({
  prompt,
  onAllow,
  onDeny,
  disableAlwaysAllow
}: {
  prompt: PermissionPromptData;
  onAllow: (duration: PermissionDuration, scope: PermissionGrantScope) => void;
  onDeny: () => void;
  disableAlwaysAllow?: boolean;
}) {
  const intl = useIntlSafe();
  const [activeButton, setActiveButton] = useState<string | null>(null);

  const hostname = useMemo(() => {
    try {
      return prompt.url ? new URL(prompt.url).hostname : 'this page';
    } catch {
      return 'this page';
    }
  }, [prompt.url]);

  const getActionTextKey = (action: PermissionActionType): string => {
    const keyMap: Record<string, string> = {
      [PermissionActionType.NAVIGATE]: 'action_navigate_to',
      [PermissionActionType.READ_PAGE_CONTENT]: 'action_read_page_content_on',
      [PermissionActionType.READ_CONSOLE_MESSAGES]: 'action_read_debugging_information_on',
      [PermissionActionType.READ_NETWORK_REQUESTS]: 'action_read_debugging_information_on',
      [PermissionActionType.CLICK]: 'action_click_on',
      [PermissionActionType.TYPE]: 'action_type_text_into',
      [PermissionActionType.UPLOAD_IMAGE]: 'action_upload_an_image_to',
      [PermissionActionType.DOMAIN_TRANSITION]: 'action_navigate_from',
      [PermissionActionType.EXECUTE_JAVASCRIPT]: 'action_execute_javascript_on'
    };
    return keyMap[action] || 'action_navigate_to';
  };

  const actionText =
    intl.formatMessage({
      id: getActionTextKey(prompt.tool),
      defaultMessage: getPermissionActionText(prompt.tool) || 'perform an action on'
    }) || 'perform an action on';

  const handleAllow = useCallback(
    (duration: PermissionDuration) => {
      setActiveButton(duration === PermissionDuration.ONCE ? 'allow' : 'always');
      const scope =
        prompt.tool === PermissionActionType.DOMAIN_TRANSITION
          ? {
              type: 'domain_transition' as const,
              fromDomain: prompt.actionData?.fromDomain || '',
              toDomain: prompt.actionData?.toDomain || ''
            }
          : { type: 'netloc' as const, netloc: hostname };
      setTimeout(() => onAllow(duration, scope), 150);
    },
    [onAllow, prompt, hostname]
  );

  const handleDeny = useCallback(() => {
    setActiveButton('deny');
    setTimeout(() => onDeny(), 150);
  }, [onDeny]);

  // Keyboard shortcuts: Enter = allow once, Cmd/Ctrl+Enter = always allow, Escape = deny
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!disableAlwaysAllow) handleAllow(PermissionDuration.ALWAYS);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAllow(PermissionDuration.ONCE);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDeny();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAllow, handleDeny, disableAlwaysAllow]);

  // Domain transition prompt
  if (prompt.tool === PermissionActionType.DOMAIN_TRANSITION) {
    return (
      <div className="p-4">
        <div className="text-sm text-text-300 mb-3">
          <MemoizedFormattedMessage
            id="superduck_wants_to_navigate_from_to"
            defaultMessage="SuperDuck wants to navigate from {fromDomain} to {toDomain}"
            values={{
              fromDomain: (
                <span className="font-medium text-text-100">
                  {prompt.actionData?.fromDomain || '?'}
                </span>
              ),
              toDomain: (
                <span className="font-medium text-text-100">
                  {prompt.actionData?.toDomain || '?'}
                </span>
              )
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <PermissionActionButton
            onClick={() => handleAllow(PermissionDuration.ONCE)}
            isPrimary
            isActive={activeButton === 'allow'}
          >
            <span>
              <MemoizedFormattedMessage id="continue" defaultMessage="Continue" />
            </span>
            <span className="text-xs opacity-60">Enter</span>
          </PermissionActionButton>
          <PermissionActionButton onClick={handleDeny} isActive={activeButton === 'deny'}>
            <span>
              <MemoizedFormattedMessage id="stop" defaultMessage="Stop" />
            </span>
            <span className="text-xs opacity-60">Esc</span>
          </PermissionActionButton>
          {!disableAlwaysAllow && (
            <>
              <div className="border-t border-border-200 my-1" />
              <PermissionActionButton
                onClick={() => handleAllow(PermissionDuration.ALWAYS)}
                isActive={activeButton === 'always'}
              >
                <span>
                  <MemoizedFormattedMessage id="always_continue" defaultMessage="Always continue" />
                </span>
                <span className="text-xs opacity-60">
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
                  navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
                    ? '⌘'
                    : 'Ctrl'}
                  +Enter
                </span>
              </PermissionActionButton>
            </>
          )}
        </div>
      </div>
    );
  }

  // Plan approval prompt — bundle's UH dispatcher renders Ny (PlanApprovalModal) when plan exists
  if (prompt.tool === PermissionActionType.PLAN_APPROVAL && prompt.actionData?.plan) {
    return (
      <PlanApprovalModal
        planStructure={prompt.actionData.plan}
        onApprove={() => {
          void trackEvent('superduck.sidebar.plan_approved', {});
          onAllow(PermissionDuration.ONCE, { type: 'netloc', netloc: '' });
        }}
        onReject={() => {
          void trackEvent('superduck.sidebar.plan_rejected', {});
          onDeny();
        }}
      />
    );
  }

  // MCP tool prompt
  if (prompt.tool === PermissionActionType.REMOTE_MCP) {
    const mcp = prompt.actionData?.remoteMcp;
    return (
      <div className="p-4">
        <div className="text-sm text-text-300 mb-3">
          {mcp ? (
            <MemoizedFormattedMessage
              id="server_wants_to_use_tool"
              defaultMessage="{serverName} wants to use {toolName}"
              values={{
                serverName: <span className="font-medium text-text-100">{mcp.serverName}</span>,
                toolName: <span className="font-medium text-text-100">{mcp.toolDisplayName}</span>
              }}
            />
          ) : (
            <MemoizedFormattedMessage
              id="superduck_wants_to_use_an_mcp_tool"
              defaultMessage="SuperDuck wants to use an MCP tool"
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <PermissionActionButton
            onClick={() => handleAllow(PermissionDuration.ONCE)}
            isPrimary
            isActive={activeButton === 'allow'}
          >
            <span>
              <MemoizedFormattedMessage id="allow_once" defaultMessage="Allow once" />
            </span>
            <span className="text-xs opacity-60">Enter</span>
          </PermissionActionButton>
          <PermissionActionButton onClick={handleDeny} isActive={activeButton === 'deny'}>
            <span>
              <MemoizedFormattedMessage id="decline" defaultMessage="Decline" />
            </span>
            <span className="text-xs opacity-60">Esc</span>
          </PermissionActionButton>
          {!disableAlwaysAllow && (
            <>
              <div className="border-t border-border-200 my-1" />
              <PermissionActionButton
                onClick={() => handleAllow(PermissionDuration.ALWAYS)}
                isActive={activeButton === 'always'}
              >
                <span>
                  <MemoizedFormattedMessage
                    id="allow_for_all_chats"
                    defaultMessage="Allow for all chats"
                  />
                </span>
                <span className="text-xs opacity-60">
                  {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
                  navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
                    ? '⌘'
                    : 'Ctrl'}
                  +Enter
                </span>
              </PermissionActionButton>
            </>
          )}
        </div>
      </div>
    );
  }

  // Standard browser action prompt (click, type, navigate, etc.)
  return (
    <div className="p-4">
      <div className="text-sm text-text-300 mb-1">
        <MemoizedFormattedMessage
          id="superduck_wants_to"
          defaultMessage="SuperDuck wants to {toolAction}:"
          values={{
            toolAction: <span className="font-medium text-text-100">{actionText}</span>
          }}
        />
      </div>
      <div className="text-sm text-text-100 font-medium mb-3 truncate">{hostname}</div>
      {prompt.actionData?.screenshot && (
        <div className="mb-3 rounded-lg overflow-hidden border border-border-200 relative">
          <img
            src={prompt.actionData.screenshot}
            alt="Screenshot"
            className="w-full object-contain max-h-40"
          />
          {prompt.actionData?.coordinate && (
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-red-500 bg-red-500/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${(prompt.actionData.coordinate[0] / 1280) * 100}%`,
                top: `${(prompt.actionData.coordinate[1] / 800) * 100}%`
              }}
            />
          )}
        </div>
      )}
      {prompt.actionData?.text && (
        <div className="mb-3 text-xs bg-bg-200 rounded-md px-2 py-1.5 font-mono text-text-200 truncate">
          {prompt.actionData.text}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <PermissionActionButton
          onClick={() => handleAllow(PermissionDuration.ONCE)}
          isPrimary
          isActive={activeButton === 'allow'}
        >
          <span>
            <MemoizedFormattedMessage id="allow_this_action" defaultMessage="Allow this action" />
          </span>
          <span className="text-xs opacity-60">Enter</span>
        </PermissionActionButton>
        <PermissionActionButton onClick={handleDeny} isActive={activeButton === 'deny'}>
          <span>
            <MemoizedFormattedMessage id="decline" defaultMessage="Decline" />
          </span>
          <span className="text-xs opacity-60">Esc</span>
        </PermissionActionButton>
        {!disableAlwaysAllow && (
          <>
            <div className="border-t border-border-200 my-1" />
            <PermissionActionButton
              onClick={() => handleAllow(PermissionDuration.ALWAYS)}
              isActive={activeButton === 'always'}
            >
              <span>
                <MemoizedFormattedMessage
                  id="always_allow_actions_on_this_site"
                  defaultMessage="Always allow actions on this site"
                />
              </span>
              <span className="text-xs opacity-60">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </span>
            </PermissionActionButton>
          </>
        )}
      </div>
      <div className="mt-3 text-[11px] text-text-400 leading-relaxed">
        <MemoizedFormattedMessage
          id="superduck_will_not_purchase_items_create_accounts"
          defaultMessage="SuperDuck will not purchase items, create accounts, or attempt to bypass CAPTCHAs."
        />
      </div>
    </div>
  );
}
