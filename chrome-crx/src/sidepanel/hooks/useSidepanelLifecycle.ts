import { useEffect } from 'react';
import { trackEvent } from '../../mcpRuntime';

export interface UseSidepanelLifecycleProps {
  panelReadyPromiseRef: React.MutableRefObject<Promise<unknown> | null>;
}

/**
 * useSidepanelLifecycle — Sidepanel 生命周期
 * 初始化 sidepanel，发送 PANEL_READY 消息
 */
export function useSidepanelLifecycle({ panelReadyPromiseRef }: UseSidepanelLifecycleProps) {
  useEffect(() => {
    void trackEvent('superduck.sidebar.opened', {});
    // Report that this sidepanel instance is alive. The service worker may
    // retarget it to an already-managed SuperDuck tab, but group creation and
    // adoption are reserved for explicit open actions.
    panelReadyPromiseRef.current = chrome.runtime.sendMessage({ type: 'PANEL_READY' }).catch(() => {
      // PANEL_READY is best-effort: if the service worker isn't ready or the
      // user closes the sidepanel before the message roundtrips, that's fine.
    });

    // Notify SW when the sidepanel iframe is destroyed so it can clear
    // panelAlive and properly reconfigure on next open.
    const onUnload = () => {
      chrome.runtime.sendMessage({ type: 'PANEL_CLOSED' }).catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [panelReadyPromiseRef]);
}
