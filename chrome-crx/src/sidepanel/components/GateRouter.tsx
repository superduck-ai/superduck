import React from 'react';
import {
  BlockedDomainView,
  BrowserPermissionGate,
  SetupGate,
  VersionBlockedView,
  PermissionPrompt
} from './SidepanelSupportViews';
import { openOptionsTo } from '../sidepanelUtils';
import type { BlockedTabInfo } from '../types';

interface BlockedTabInfoContainer {
  isMainTabBlocked: boolean;
  blockedTabs: BlockedTabInfo[];
}

export interface GateRouterProps {
  // MCP permission gate
  mcpPermissionOnly: boolean | undefined;
  requestId: string;
  // Version gate
  versionIsBlocked: boolean;
  currentVersion: string;
  minSupportedVersion: string;
  // Domain blocking gate
  shouldBlockDomain: boolean;
  hasBlockedSecondaryTabs: boolean;
  blockedCategory: string | null;
  blockedTabInfo: BlockedTabInfoContainer;
  queryTabId: number | undefined;
  closeBlockedSites: () => Promise<void>;
  // Browser control permission gate
  hasBrowserControlPermissionAccepted: boolean | null;
  acceptBrowserControlPermission: () => Promise<void>;
  // Auth gate
  authLoading: boolean;
  authError: string | null;
  // Setup gate
  effectiveMessagesClient: unknown;
  hasProviderConfig: boolean;
  handleSetupRetry: () => Promise<void>;
}

/**
 * GateRouter — 早期返回的门控条件路由
 * 将所有 gate 条件集中在一个组件中，简化 SidepanelApp 的主渲染逻辑
 */
export function GateRouter({
  mcpPermissionOnly,
  requestId,
  versionIsBlocked,
  currentVersion,
  minSupportedVersion,
  shouldBlockDomain,
  hasBlockedSecondaryTabs,
  blockedCategory,
  blockedTabInfo,
  queryTabId,
  closeBlockedSites,
  hasBrowserControlPermissionAccepted,
  acceptBrowserControlPermission,
  authLoading,
  authError,
  effectiveMessagesClient,
  hasProviderConfig,
  handleSetupRetry
}: GateRouterProps): React.ReactElement | null {
  if (mcpPermissionOnly) {
    return <PermissionPrompt requestId={requestId} />;
  }

  if (versionIsBlocked && minSupportedVersion) {
    return (
      <VersionBlockedView
        currentVersion={currentVersion}
        minSupportedVersion={minSupportedVersion}
      />
    );
  }

  if (shouldBlockDomain || hasBlockedSecondaryTabs) {
    const currentCategory =
      blockedTabInfo.blockedTabs.find((item: BlockedTabInfo) => item.tabId === queryTabId)
        ?.category ||
      blockedCategory ||
      'category1';
    return (
      <BlockedDomainView
        category={currentCategory}
        isMainTabBlocked={blockedTabInfo.isMainTabBlocked}
        onCloseBlockedSites={closeBlockedSites}
      />
    );
  }

  if (hasBrowserControlPermissionAccepted === false) {
    return <BrowserPermissionGate onAccept={acceptBrowserControlPermission} />;
  }

  if (hasBrowserControlPermissionAccepted === null) {
    return (
      <div className="h-screen bg-bg-100 text-text-300 flex items-center justify-center text-sm">
        Loading sidepanel...
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="h-screen bg-bg-100 text-text-300 flex items-center justify-center text-sm">
        Loading authentication...
      </div>
    );
  }

  if (!effectiveMessagesClient && !hasProviderConfig) {
    return (
      <SetupGate
        authError={authError}
        onRetry={handleSetupRetry}
        onOpenSettings={() => {
          void openOptionsTo('permissions');
        }}
      />
    );
  }

  // All gates passed — render nothing to let the main layout render
  return null;
}
