import { SidepanelViewStateProvider } from './contexts/SidepanelViewStateContext';
import { SidepanelView } from './components/SidepanelView';
import { GateRouter } from './components/GateRouter';
import { useSidepanelState } from './hooks/useSidepanelState';

/**
 * SidepanelApp — 主应用组件
 * 仅负责门控路由和布局，所有业务逻辑在 useSidepanelState 中
 */
export default function SidepanelApp() {
  const state = useSidepanelState();

  // ─── Gate routing ──────────────────────────────────────────────────
  const gateResult = GateRouter({
    mcpPermissionOnly: state.query.mcpPermissionOnly,
    requestId: state.query.requestId,
    versionIsBlocked: state.versionState.isBlocked,
    currentVersion: state.versionState.currentVersion,
    minSupportedVersion: state.versionState.minSupportedVersion,
    shouldBlockDomain: state.shouldBlockDomain,
    hasBlockedSecondaryTabs: state.hasBlockedSecondaryTabs,
    blockedCategory: state.blockedCategory,
    blockedTabInfo: state.blockedTabInfo,
    queryTabId: state.query.tabId,
    closeBlockedSites: state.closeBlockedSites,
    hasBrowserControlPermissionAccepted: state.hasBrowserControlPermissionAccepted,
    acceptBrowserControlPermission: state.acceptBrowserControlPermission,
    authLoading: state.authLoading,
    authError: state.authError,
    effectiveMessagesClient: state.effectiveMessagesClient,
    hasProviderConfig: state.hasProviderConfig,
    handleSetupRetry: state.handleSetupRetry
  });

  if (gateResult) {
    return gateResult;
  }

  // ─── Main layout ──────────────────────────────────────────────────
  return (
    <SidepanelViewStateProvider value={state}>
      <SidepanelView />
    </SidepanelViewStateProvider>
  );
}
