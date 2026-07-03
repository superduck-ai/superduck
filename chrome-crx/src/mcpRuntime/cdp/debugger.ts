import {
  screenshot as screenshotImpl,
  processScreenshot as processScreenshotImpl,
  DEFAULT_RESIZE_PARAMS
} from './screenshot';
import { tabGroupManager } from '../tabState';
import {
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
} from './helpers';
import {
  createCdpInput,
  getKeyCode as getKeyCodeImpl,
  requiresShift as requiresShiftImpl
} from './input';
import {
  getConsoleMessagesByTab,
  getConsoleTrackingEnabled,
  getNetworkRequestsByTab,
  getNetworkTrackingEnabled,
  getWindowOpenEventsByTab,
  isDebuggerListenerRegistered,
  setDebuggerListenerRegistered
} from './state';
import { registerDebuggerEventHandlers as registerDebuggerEventHandlersImpl } from './eventHandlers';
import { recordEvent, recordError } from '../../debug';
import {
  enableConsoleTracking as enableConsoleTrackingImpl,
  getConsoleMessages as getConsoleMessagesImpl,
  clearConsoleMessages as clearConsoleMessagesImpl
} from './consoleTracking';
import {
  enableNetworkTracking as enableNetworkTrackingImpl,
  getNetworkRequests as getNetworkRequestsImpl,
  clearNetworkRequests as clearNetworkRequestsImpl,
  isNetworkTrackingEnabled as isNetworkTrackingEnabledImpl
} from './networkTracking';
import type {
  ClickOptions,
  ConsoleMessage,
  ConsoleTabData,
  KeyDefinition,
  KeyEventParams,
  MouseEventParams,
  NetworkRequest,
  NetworkTabData,
  ResizeParams,
  ScreenshotOptions,
  ScreenshotResult,
  SendCommand,
  WindowOpenEvent
} from './types';

// =============================================================================
// CDP Section - Chrome Debugger Protocol
// =============================================================================

const DEBUGGER_API_TIMEOUT_MS = 10000;

// --- ChromeDebuggerProtocol class (J) ---
class ChromeDebuggerProtocol {
  private tabLocks = new Map<number, Promise<void>>();
  private input!: ReturnType<typeof createCdpInput>;
  private boundSendCommand!: SendCommand;

  static get debuggerListenerRegistered(): boolean {
    return isDebuggerListenerRegistered();
  }

  static set debuggerListenerRegistered(value: boolean) {
    setDebuggerListenerRegistered(value);
  }

  static get consoleMessagesByTab(): Map<number, ConsoleTabData> {
    return getConsoleMessagesByTab();
  }

  static get networkRequestsByTab(): Map<number, NetworkTabData> {
    return getNetworkRequestsByTab();
  }

  static get networkTrackingEnabled(): Set<number> {
    return getNetworkTrackingEnabled();
  }

  static get consoleTrackingEnabled(): Set<number> {
    return getConsoleTrackingEnabled();
  }

  static get windowOpenEventsByTab(): Map<number, WindowOpenEvent[]> {
    return getWindowOpenEventsByTab();
  }

  isMac: boolean = false;

  constructor() {
    this.isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    this.boundSendCommand = this.sendCommand.bind(this);
    this.input = createCdpInput({
      sendCommand: this.boundSendCommand,
      isMac: this.isMac
    });
    this.initializeDebuggerEventListener();
  }

  private async withTabLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
    const hadContention = this.tabLocks.has(tabId);
    const prev = this.tabLocks.get(tabId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.catch(() => {}).then(() => gate);
    this.tabLocks.set(tabId, chained);
    if (hadContention) {
      recordEvent({ domain: 'cdp', event: 'cdp.tab_lock.wait', ids: { tabId } });
    }
    try {
      await prev.catch(() => {});
      return await fn();
    } finally {
      release();
      recordEvent({ domain: 'cdp', event: 'cdp.tab_lock.release', ids: { tabId } });
      if (this.tabLocks.get(tabId) === chained) {
        this.tabLocks.delete(tabId);
      }
    }
  }

  registerDebuggerEventHandlers(): void {
    registerDebuggerEventHandlersImpl();
  }

  initializeDebuggerEventListener(): void {
    if (!ChromeDebuggerProtocol.debuggerListenerRegistered) {
      ChromeDebuggerProtocol.debuggerListenerRegistered = true;
      this.registerDebuggerEventHandlers();
      this.registerDebuggerDetachHandler();
      this.registerTabCloseCleanup();
    }
  }

  /**
   * Listen for debugger detach events.  When the user clicks "Cancel" on
   * Chrome's "… has started debugging this browser" info-bar, Chrome detaches
   * the debugger with reason "canceled_by_user".  We treat this the same as
   * clicking the stop button – broadcast STOP_AGENT so the sidepanel aborts,
   * and hide the visual indicators on the affected tab.
   */
  registerDebuggerDetachHandler(): void {
    chrome.debugger.onDetach.addListener((source: chrome.debugger.Debuggee, reason: string) => {
      const tabId = source.tabId;
      if (!tabId) return;

      recordEvent({
        domain: 'cdp',
        event: 'cdp.detach',
        ids: { tabId },
        data: { source: 'chrome', reason: reason || 'unknown' }
      });

      chrome.tabs.sendMessage(tabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});
      tabGroupManager.setTabIndicatorState(tabId, 'none').catch(() => {});

      if (reason !== 'canceled_by_user') return;

      chrome.runtime.sendMessage({ type: 'STOP_AGENT', targetTabId: tabId }).catch(() => {});
    });
  }

  /**
   * Listen for tab close events and clean up all per-tab CDP state.
   * Without this, tabLocks, consoleMessagesByTab, networkRequestsByTab,
   * consoleTrackingEnabled, and networkTrackingEnabled grow unboundedly
   * for the lifetime of the service worker.
   */
  registerTabCloseCleanup(): void {
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTabResources(tabId);
    });
  }

  cleanupTabResources(tabId: number): void {
    this.tabLocks.delete(tabId);
    ChromeDebuggerProtocol.consoleMessagesByTab.delete(tabId);
    ChromeDebuggerProtocol.networkRequestsByTab.delete(tabId);
    ChromeDebuggerProtocol.consoleTrackingEnabled.delete(tabId);
    ChromeDebuggerProtocol.networkTrackingEnabled.delete(tabId);
    ChromeDebuggerProtocol.windowOpenEventsByTab.delete(tabId);
  }

  clearWindowOpenEvents(tabId: number): void {
    ChromeDebuggerProtocol.windowOpenEventsByTab.delete(tabId);
  }

  consumeWindowOpenEvents(tabId: number): WindowOpenEvent[] {
    const events = ChromeDebuggerProtocol.windowOpenEventsByTab.get(tabId) ?? [];
    ChromeDebuggerProtocol.windowOpenEventsByTab.delete(tabId);
    return events;
  }

  async enablePageEvents(tabId: number): Promise<void> {
    await this.sendCommand(tabId, 'Page.enable');
  }

  defaultResizeParams: ResizeParams = DEFAULT_RESIZE_PARAMS;

  async attachDebugger(tabId: number): Promise<void> {
    recordEvent({ domain: 'cdp', event: 'cdp.attach.start', ids: { tabId } });
    try {
      await this.withTabLock(tabId, async () => {
        await this.attachDebuggerInner(tabId);
      });
      recordEvent({
        domain: 'cdp',
        event: 'cdp.attach.end',
        ids: { tabId },
        data: { success: true }
      });
    } catch (err) {
      recordError('cdp', 'cdp.attach.end', err, { tabId }, { success: false });
      throw err;
    }
  }

  private async attachDebuggerInner(tabId: number): Promise<void> {
    const target: chrome.debugger.Debuggee = { tabId };
    const wasNetworkTracking = ChromeDebuggerProtocol.networkTrackingEnabled.has(tabId);
    const wasConsoleTracking = ChromeDebuggerProtocol.consoleTrackingEnabled.has(tabId);
    const wasAttached = await this.isDebuggerAttached(tabId);

    // If debugger is already attached, skip detach/attach cycle to avoid
    // triggering Chrome's "X is debugging this browser" banner repeatedly.
    // Each chrome.debugger.attach() call causes Chrome to display a new banner,
    // so re-attaching when already attached creates overlapping banners.
    if (wasAttached) {
      this.registerDebuggerEventHandlers();

      // Ensure DOM domain is enabled for subsequent operations
      try {
        await this.sendCommandInner(tabId, 'DOM.enable');
      } catch (_err) {
        // ignore
      }

      if (wasConsoleTracking) {
        try {
          await this.sendCommandInner(tabId, 'Runtime.enable');
        } catch (_err) {
          // ignore
        }
      }

      if (wasNetworkTracking) {
        try {
          await this.sendCommandInner(tabId, 'Network.enable', { maxPostDataSize: 65536 });
        } catch (_err) {
          // ignore
        }
      }
      return;
    }

    // NOTE: Do NOT call detachDebugger before attach. If isDebuggerAttached
    // returns a stale false (e.g. race during tab navigation or just after
    // a successful attach), detaching would tear down the live debugger
    // session and the subsequent attach would create a NEW "X is debugging"
    // banner on top of the existing one. Just attempt attach directly —
    // if it's already attached, Chrome reports the error and we ignore it.
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error('Timed out attaching debugger'));
      }, DEBUGGER_API_TIMEOUT_MS);
      chrome.debugger.attach(target, '1.3', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          // Treat "already attached" as success — this is the desired
          // end-state and must NOT trigger a new banner.
          const msg = chrome.runtime.lastError.message || '';
          if (
            msg.toLowerCase().includes('already attached') ||
            msg.toLowerCase().includes('debugger is already attached')
          ) {
            resolve();
            return;
          }
          reject(new Error(msg));
        } else {
          resolve();
        }
      });
    });

    tabGroupManager.showRunningIndicatorImmediately(tabId, true).catch(() => {});

    this.registerDebuggerEventHandlers();

    // 预启用 DOM domain，为后续 DOM.resolveNode 等调用做准备
    try {
      await this.sendCommandInner(tabId, 'DOM.enable');
    } catch (_err) {
      // ignore
    }

    if (wasConsoleTracking) {
      try {
        await this.sendCommandInner(tabId, 'Runtime.enable');
      } catch (_err) {
        // ignore
      }
    }

    if (wasNetworkTracking) {
      try {
        await this.sendCommandInner(tabId, 'Network.enable', { maxPostDataSize: 65536 });
      } catch (_err) {
        // ignore
      }
    }
  }

  async detachDebugger(tabId: number): Promise<void> {
    recordEvent({
      domain: 'cdp',
      event: 'cdp.detach',
      ids: { tabId },
      data: { source: 'explicit' }
    });
    return new Promise<void>((resolve) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          // Only reject if it's not "Debugger is not attached" error
          const errorMsg = chrome.runtime.lastError.message || '';
          if (!errorMsg.toLowerCase().includes('not attached')) {
            console.warn(`[CDP] Detach warning for tab ${tabId}:`, errorMsg);
          }
          // Always resolve to avoid blocking
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  async isDebuggerAttached(tabId: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve(false);
      }, DEBUGGER_API_TIMEOUT_MS);
      chrome.debugger.getTargets((targets) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError || !Array.isArray(targets)) {
          resolve(false);
          return;
        }
        const target = targets.find((t) => t.tabId === tabId);
        resolve(target?.attached ?? false);
      });
    });
  }

  async sendCommand<TResult extends object | undefined = object | undefined>(
    tabId: number,
    method: string,
    params?: Record<string, unknown>
  ): Promise<TResult> {
    return this.withTabLock(tabId, () => this.sendCommandInner<TResult>(tabId, method, params));
  }

  private async sendCommandInner<TResult extends object | undefined = object | undefined>(
    tabId: number,
    method: string,
    params?: Record<string, unknown>
  ): Promise<TResult> {
    const executeCommand = () =>
      new Promise<object | undefined>((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

    try {
      return (await executeCommand()) as TResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const willRetry = errorMessage.toLowerCase().includes('debugger is not attached');
      recordError(
        'cdp',
        'cdp.command.error',
        error,
        { tabId },
        { method, willRetry, errorMessage }
      );
      if (willRetry) {
        await this.attachDebuggerInner(tabId);
        return (await executeCommand()) as TResult;
      }
      throw error;
    }
  }

  async dispatchMouseEvent(tabId: number, eventParams: MouseEventParams): Promise<void> {
    return this.input.dispatchMouseEvent(tabId, eventParams);
  }

  async dispatchKeyEvent(tabId: number, eventParams: KeyEventParams): Promise<void> {
    return this.input.dispatchKeyEvent(tabId, eventParams);
  }

  async hidePointerBlockingOverlaysForToolUse(tabId: number): Promise<void> {
    return this.input.hidePointerBlockingOverlaysForToolUse(tabId);
  }

  async restorePointerBlockingOverlaysAfterToolUse(tabId: number): Promise<void> {
    return this.input.restorePointerBlockingOverlaysAfterToolUse(tabId);
  }

  async insertText(tabId: number, text: string): Promise<void> {
    return this.input.insertText(tabId, text);
  }

  async click(
    tabId: number,
    x: number,
    y: number,
    button: string = 'left',
    clickCount: number = 1,
    modifiers: number = 0,
    options?: ClickOptions
  ): Promise<void> {
    return this.input.click(tabId, x, y, button, clickCount, modifiers, options);
  }

  async type(tabId: number, text: string): Promise<void> {
    return this.input.type(tabId, text);
  }

  async keyDown(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    return this.input.keyDown(tabId, keyDef, modifiers, commands);
  }

  async keyUp(tabId: number, keyDef: KeyDefinition, modifiers: number = 0): Promise<void> {
    return this.input.keyUp(tabId, keyDef, modifiers);
  }

  async pressKey(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    return this.input.pressKey(tabId, keyDef, modifiers, commands);
  }

  async pressKeyChord(tabId: number, chord: string): Promise<void> {
    return this.input.pressKeyChord(tabId, chord);
  }

  async scrollWheel(
    tabId: number,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    return this.input.scrollWheel(tabId, x, y, deltaX, deltaY);
  }

  getKeyCode(key: string): KeyDefinition | undefined {
    return getKeyCodeImpl(key);
  }

  requiresShift(char: string): boolean {
    return requiresShiftImpl(char);
  }

  async enableConsoleTracking(tabId: number): Promise<void> {
    return enableConsoleTrackingImpl(tabId, this.boundSendCommand);
  }

  getConsoleMessages(
    tabId: number,
    errorsOnly: boolean = false,
    filterPattern?: string
  ): ConsoleMessage[] {
    return getConsoleMessagesImpl(tabId, errorsOnly, filterPattern);
  }

  clearConsoleMessages(tabId: number): void {
    clearConsoleMessagesImpl(tabId);
  }

  async enableNetworkTracking(tabId: number): Promise<void> {
    return enableNetworkTrackingImpl(tabId, this.boundSendCommand, () =>
      this.initializeDebuggerEventListener()
    );
  }

  getNetworkRequests(tabId: number, urlFilter?: string): NetworkRequest[] {
    return getNetworkRequestsImpl(tabId, urlFilter);
  }

  clearNetworkRequests(tabId: number): void {
    clearNetworkRequestsImpl(tabId);
  }

  isNetworkTrackingEnabled(tabId: number): boolean {
    return isNetworkTrackingEnabledImpl(tabId);
  }

  async screenshot(
    tabId: number,
    resizeParams?: ResizeParams,
    options?: ScreenshotOptions
  ): Promise<ScreenshotResult> {
    return screenshotImpl(this.boundSendCommand, tabId, resizeParams, options);
  }

  async processScreenshotInContentScript(
    tabId: number,
    base64Data: string,
    viewportWidth: number,
    viewportHeight: number,
    devicePixelRatio: number,
    resizeParams?: ResizeParams
  ): Promise<ScreenshotResult> {
    return processScreenshotImpl(
      tabId,
      base64Data,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      resizeParams
    );
  }
}

// --- CDP instance (X) ---
export const cdpDebugger = new ChromeDebuggerProtocol();

export {
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
};
