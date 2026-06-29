import type { TabGroupManager } from './tabGroups';
import { getMemberOrigin } from './tabNavigationIsolation';

export async function promoteToMainTab(
  mgr: TabGroupManager,
  oldMainTabId: number,
  newMainTabId: number
): Promise<void> {
  const meta = mgr.groupMetadata.get(oldMainTabId);
  if (!meta) throw new Error(`No group found for main tab ${oldMainTabId}`);
  if ((await chrome.tabs.get(newMainTabId)).groupId !== meta.chromeGroupId)
    throw new Error(`Tab ${newMainTabId} is not in the same group as ${oldMainTabId}`);
  const oldState = meta.memberStates.get(oldMainTabId) || {
    indicatorState: 'none'
  };
  try {
    await chrome.tabs.get(oldMainTabId);
    'pulsing' === oldState.indicatorState &&
      (await mgr.sendIndicatorMessage(oldMainTabId, 'HIDE_AGENT_INDICATORS'));
  } catch {
    // ignore
  }
  const newMainPreviousState = meta.memberStates.get(newMainTabId);
  const newMainOrigin = getMemberOrigin(newMainPreviousState);
  meta.mainTabId = newMainTabId;
  try {
    await mgr.sendIndicatorMessage(newMainTabId, 'HIDE_STATIC_INDICATOR');
    meta.memberStates.delete(newMainTabId);
  } catch (err) {
    // ignore
  }
  'pulsing' === oldState.indicatorState
    ? (meta.memberStates.set(newMainTabId, {
        ...(newMainPreviousState ?? {}),
        indicatorState: 'pulsing',
        origin: newMainOrigin,
        disposition: 'active'
      }),
      await mgr.sendIndicatorMessage(newMainTabId, 'SHOW_AGENT_INDICATORS'))
    : meta.memberStates.set(newMainTabId, {
        ...(newMainPreviousState ?? {}),
        indicatorState: 'none',
        origin: newMainOrigin,
        disposition: 'active'
      });
  mgr.groupMetadata.delete(oldMainTabId);
  mgr.groupMetadata.set(newMainTabId, meta);
  await mgr.saveToStorage();
}
