import { screenshotContextManager } from './shared';
import { tabGroupManager } from './tabState';
import { processScreenshotInContentScript } from './cdpContentScriptScreenshot';
import {
  calculateTargetDimensions,
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
} from './cdpHelpers';
import { KEY_DEFINITIONS, MAC_KEYBOARD_COMMANDS } from './cdpKeyboard';
import {
  getConsoleMessagesByTab,
  getConsoleTrackingEnabled,
  getNetworkRequestsByTab,
  getNetworkTrackingEnabled,
  isDebuggerListenerRegistered,
  setDebuggerListenerRegistered
} from './cdpState';
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
  ScreenshotResult
} from './cdpTypes';

// =============================================================================
// CDP Section - Chrome Debugger Protocol
// =============================================================================

// --- ChromeDebuggerProtocol class (J) ---
class ChromeDebuggerProtocol {
  static MAX_LOGS_PER_TAB: number = 10000;
  static MAX_REQUESTS_PER_TAB: number = 1000;

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

  isMac: boolean = false;

  constructor() {
    this.isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    this.initializeDebuggerEventListener();
  }

  registerDebuggerEventHandlers(): void {
    if (!globalThis.__cdpDebuggerEventHandler) {
      globalThis.__cdpDebuggerEventHandler = (
        source: chrome.debugger.Debuggee,
        method: string,
        params: any
      ) => {
        const tabId = source.tabId;
        if (!tabId) return;

        if ('Runtime.consoleAPICalled' === method) {
          const message: ConsoleMessage = {
            type: params.type || 'log',
            text: params.args
              ?.map((arg: any) =>
                void 0 !== arg.value ? String(arg.value) : arg.description || ''
              )
              .join(' '),
            timestamp: params.timestamp || Date.now(),
            url: params.stackTrace?.callFrames?.[0]?.url,
            lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber,
            columnNumber: params.stackTrace?.callFrames?.[0]?.columnNumber,
            args: params.args
          };
          const domain = this.extractDomain(message.url);
          this.addConsoleMessage(tabId, domain, message);
        } else if ('Runtime.exceptionThrown' === method) {
          const exceptionDetails = params.exceptionDetails;
          const exceptionMessage: ConsoleMessage = {
            type: 'exception',
            text:
              exceptionDetails?.exception?.description ||
              exceptionDetails?.text ||
              'Unknown exception',
            timestamp: exceptionDetails?.timestamp || Date.now(),
            url: exceptionDetails?.url,
            lineNumber: exceptionDetails?.lineNumber,
            columnNumber: exceptionDetails?.columnNumber,
            stackTrace: exceptionDetails?.stackTrace?.callFrames
              ?.map(
                (frame: any) =>
                  `    at ${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
              )
              .join('\n')
          };
          const domain = this.extractDomain(exceptionMessage.url);
          this.addConsoleMessage(tabId, domain, exceptionMessage);
        } else if ('Network.requestWillBeSent' === method) {
          const requestId = params.requestId;
          const request = params.request;
          const documentURL = params.documentURL;
          const networkRequest: NetworkRequest = {
            requestId,
            url: request.url,
            method: request.method
          };
          const pageUrl = documentURL || request.url;
          const domain = this.extractDomain(pageUrl);
          this.addNetworkRequest(tabId, domain, networkRequest);
        } else if ('Network.responseReceived' === method) {
          const requestId = params.requestId;
          const response = params.response;
          const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
          if (tabData) {
            const matchingRequest = tabData.requestMap.get(requestId);
            if (matchingRequest) {
              matchingRequest.status = response.status;
            }
          }
        } else if ('Network.loadingFailed' === method) {
          const requestId = params.requestId;
          const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
          if (tabData) {
            const matchingRequest = tabData.requestMap.get(requestId);
            if (matchingRequest) {
              matchingRequest.status = 503;
            }
          }
        }
      };
      chrome.debugger.onEvent.addListener(globalThis.__cdpDebuggerEventHandler);
    }
  }

  initializeDebuggerEventListener(): void {
    if (!ChromeDebuggerProtocol.debuggerListenerRegistered) {
      ChromeDebuggerProtocol.debuggerListenerRegistered = true;
      this.registerDebuggerEventHandlers();
      this.registerDebuggerDetachHandler();
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
    chrome.debugger.onDetach.addListener(
      (source: chrome.debugger.Debuggee, reason: string) => {
        if (reason !== 'canceled_by_user') return;
        const tabId = source.tabId;
        if (!tabId) return;

        console.log('[CDP] Debugger detached by user for tab', tabId, '– stopping agent');

        // Immediately hide indicators on the page via content script
        chrome.tabs.sendMessage(tabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});

        // Broadcast STOP_AGENT so the sidepanel (if open) aborts the request
        chrome.runtime.sendMessage({ type: 'STOP_AGENT', targetTabId: tabId }).catch(() => {});

        // Update group metadata for consistency
        tabGroupManager.setTabIndicatorState(tabId, 'none').catch(() => {});
      }
    );
  }

  defaultResizeParams: ResizeParams = {
    pxPerToken: 28,
    maxTargetPx: 1568,
    maxTargetTokens: 1568
  };
  static MAX_BASE64_CHARS: number = 1398100;
  static INITIAL_JPEG_QUALITY: number = 0.85;
  static JPEG_QUALITY_STEP: number = 0.05;
  static MIN_JPEG_QUALITY: number = 0.1;

  async attachDebugger(tabId: number): Promise<void> {
    const target: chrome.debugger.Debuggee = { tabId };
    const wasNetworkTracking = ChromeDebuggerProtocol.networkTrackingEnabled.has(tabId);
    const wasConsoleTracking = ChromeDebuggerProtocol.consoleTrackingEnabled.has(tabId);

    try {
      await this.detachDebugger(tabId);
    } catch {
      // ignore detach errors
    }

    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    this.registerDebuggerEventHandlers();

    // 预启用 DOM domain，为后续 DOM.resolveNode 等调用做准备
    try {
      await this.sendCommand(tabId, 'DOM.enable');
    } catch (_err) {
      // ignore
    }

    if (wasConsoleTracking) {
      try {
        await this.sendCommand(tabId, 'Runtime.enable');
      } catch (_err) {
        // ignore
      }
    }

    if (wasNetworkTracking) {
      try {
        await this.sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
      } catch (_err) {
        // ignore
      }
    }
  }

  async detachDebugger(tabId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
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
      chrome.debugger.getTargets((targets) => {
        const target = targets.find((t) => t.tabId === tabId);
        resolve(target?.attached ?? false);
      });
    });
  }

  async sendCommand(tabId: number, method: string, params?: any): Promise<any> {
    try {
      return await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('debugger is not attached')) {
        await this.attachDebugger(tabId);
        return new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
      }
      throw error;
    }
  }

  async dispatchMouseEvent(tabId: number, eventParams: MouseEventParams): Promise<void> {
    const params: any = {
      type: eventParams.type,
      x: Math.round(eventParams.x),
      y: Math.round(eventParams.y),
      modifiers: eventParams.modifiers || 0
    };

    if (
      eventParams.type === 'mousePressed' ||
      eventParams.type === 'mouseReleased' ||
      eventParams.type === 'mouseMoved'
    ) {
      params.button = eventParams.button || 'none';
      if (eventParams.type === 'mousePressed' || eventParams.type === 'mouseReleased') {
        params.clickCount = eventParams.clickCount || 1;
      }
    }

    if (eventParams.type !== 'mouseWheel') {
      params.buttons = void 0 !== eventParams.buttons ? eventParams.buttons : 0;
    }

    if (
      eventParams.type === 'mouseWheel' &&
      (void 0 !== eventParams.deltaX || void 0 !== eventParams.deltaY)
    ) {
      Object.assign(params, {
        deltaX: eventParams.deltaX || 0,
        deltaY: eventParams.deltaY || 0
      });
    }

    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', params);
  }

  async dispatchKeyEvent(tabId: number, eventParams: KeyEventParams): Promise<void> {
    const params = { modifiers: 0, ...eventParams };
    await this.sendCommand(tabId, 'Input.dispatchKeyEvent', params);
  }

  async insertText(tabId: number, text: string): Promise<void> {
    await this.sendCommand(tabId, 'Input.insertText', { text });
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
    if (!options?.skipIndicator) {
      await tabGroupManager.hideIndicatorForToolUse(tabId);
    }
    try {
      let buttonsBitmask = 0;
      if (button === 'left') {
        buttonsBitmask = 1;
      } else if (button === 'right') {
        buttonsBitmask = 2;
      } else if (button === 'middle') {
        buttonsBitmask = 4;
      }

      await this.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
        modifiers
      });

      if (!options?.skipIndicator) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      for (let i = 1; i <= clickCount; i++) {
        await this.dispatchMouseEvent(tabId, {
          type: 'mousePressed',
          x,
          y,
          button,
          buttons: buttonsBitmask,
          clickCount: i,
          modifiers
        });

        if (!options?.skipIndicator) {
          await new Promise<void>((resolve) => setTimeout(resolve, 12));
        }

        await this.dispatchMouseEvent(tabId, {
          type: 'mouseReleased',
          x,
          y,
          button,
          buttons: 0,
          modifiers,
          clickCount: i
        });

        if (i < clickCount && !options?.skipIndicator) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
      }
    } finally {
      if (!options?.skipIndicator) {
        await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
      }
    }
  }

  async type(tabId: number, text: string): Promise<void> {
    for (const char of text) {
      let key = char;
      if (char === '\n' || char === '\r') {
        key = 'Enter';
      }
      const keyCode = this.getKeyCode(key);
      if (keyCode) {
        const modifiers = this.requiresShift(char) ? 8 : 0;
        await this.pressKey(tabId, keyCode, modifiers);
      } else {
        await this.insertText(tabId, char);
      }
    }
  }

  async keyDown(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await this.dispatchKeyEvent(tabId, {
      type: keyDef.text ? 'keyDown' : 'rawKeyDown',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.windowsVirtualKeyCode || keyDef.keyCode,
      modifiers,
      text: keyDef.text ?? '',
      unmodifiedText: keyDef.text ?? '',
      location: keyDef.location ?? 0,
      commands: commands ?? [],
      isKeypad: keyDef.isKeypad ?? false
    });
  }

  async keyUp(tabId: number, keyDef: KeyDefinition, modifiers: number = 0): Promise<void> {
    await this.dispatchKeyEvent(tabId, {
      type: 'keyUp',
      key: keyDef.key,
      modifiers,
      windowsVirtualKeyCode: keyDef.windowsVirtualKeyCode || keyDef.keyCode,
      code: keyDef.code,
      location: keyDef.location ?? 0
    });
  }

  async pressKey(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await this.keyDown(tabId, keyDef, modifiers, commands);
    await this.keyUp(tabId, keyDef, modifiers);
  }

  async pressKeyChord(tabId: number, chord: string): Promise<void> {
    const parts = chord.toLowerCase().split('+');
    const modifierKeys: string[] = [];
    let mainKey = '';

    for (const part of parts) {
      if (
        ['ctrl', 'control', 'alt', 'shift', 'cmd', 'meta', 'command', 'win', 'windows'].includes(
          part
        )
      ) {
        modifierKeys.push(part);
      } else {
        mainKey = part;
      }
    }

    let modifiersBitmask = 0;
    const modifierMap: Record<string, number> = {
      alt: 1,
      ctrl: 2,
      control: 2,
      meta: 4,
      cmd: 4,
      command: 4,
      win: 4,
      windows: 4,
      shift: 8
    };

    for (const mod of modifierKeys) {
      modifiersBitmask |= modifierMap[mod] || 0;
    }

    const commands: string[] = [];
    if (this.isMac) {
      const macCommand = MAC_KEYBOARD_COMMANDS[chord.toLowerCase()];
      if (macCommand && Array.isArray(macCommand)) {
        commands.push(...macCommand);
      } else if (macCommand) {
        commands.push(macCommand as string);
      }
    }

    if (mainKey) {
      const keyCode = this.getKeyCode(mainKey);
      if (!keyCode) throw new Error(`Unknown key: ${chord}`);
      await this.pressKey(tabId, keyCode, modifiersBitmask, commands);
    }
  }

  async scrollWheel(
    tabId: number,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    await this.dispatchMouseEvent(tabId, {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY
    });
  }

  getKeyCode(key: string): KeyDefinition | undefined {
    const lowerKey = key.toLowerCase();
    const definition = KEY_DEFINITIONS[lowerKey];
    if (definition) return definition;

    if (key.length === 1) {
      const upper = key.toUpperCase();
      let code: string;
      if (upper >= 'A' && upper <= 'Z') {
        code = `Key${upper}`;
      } else if (key >= '0' && key <= '9') {
        code = `Digit${key}`;
      } else {
        return undefined;
      }
      return { key, code, keyCode: upper.charCodeAt(0), text: key };
    }
    return undefined;
  }

  requiresShift(char: string): boolean {
    return '~!@#$%^&*()_+{}|:"<>?'.includes(char) || (char >= 'A' && char <= 'Z');
  }

  extractDomain(url?: string): string {
    if (!url) return 'unknown';
    try {
      return new URL(url).hostname || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  addConsoleMessage(tabId: number, domain: string, message: ConsoleMessage): void {
    let tabData = ChromeDebuggerProtocol.consoleMessagesByTab.get(tabId);

    if (tabData && tabData.domain !== domain) {
      tabData = { domain, messages: [] };
      ChromeDebuggerProtocol.consoleMessagesByTab.set(tabId, tabData);
    } else if (!tabData) {
      tabData = { domain, messages: [] };
      ChromeDebuggerProtocol.consoleMessagesByTab.set(tabId, tabData);
    }

    if (tabData.messages.length > 0) {
      const lastTimestamp = tabData.messages[tabData.messages.length - 1].timestamp;
      if (message.timestamp < lastTimestamp) {
        message.timestamp = lastTimestamp;
      }
    }

    tabData.messages.push(message);

    if (tabData.messages.length > ChromeDebuggerProtocol.MAX_LOGS_PER_TAB) {
      const excess = tabData.messages.length - ChromeDebuggerProtocol.MAX_LOGS_PER_TAB;
      tabData.messages.splice(0, excess);
    }
  }

  async enableConsoleTracking(tabId: number): Promise<void> {
    try {
      await this.sendCommand(tabId, 'Runtime.enable');
      ChromeDebuggerProtocol.consoleTrackingEnabled.add(tabId);
    } catch (error) {
      throw error;
    }
  }

  getConsoleMessages(
    tabId: number,
    errorsOnly: boolean = false,
    filterPattern?: string
  ): ConsoleMessage[] {
    const tabData = ChromeDebuggerProtocol.consoleMessagesByTab.get(tabId);
    if (!tabData) return [];

    let messages = tabData.messages;

    if (errorsOnly) {
      messages = messages.filter((msg) => msg.type === 'error' || msg.type === 'exception');
    }

    if (filterPattern) {
      try {
        const regex = new RegExp(filterPattern, 'i');
        messages = messages.filter((msg) => regex.test(msg.text));
      } catch {
        messages = messages.filter((msg) =>
          msg.text.toLowerCase().includes(filterPattern.toLowerCase())
        );
      }
    }

    return messages;
  }

  clearConsoleMessages(tabId: number): void {
    ChromeDebuggerProtocol.consoleMessagesByTab.delete(tabId);
  }

  addNetworkRequest(tabId: number, domain: string, request: NetworkRequest): void {
    let tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);

    if (tabData) {
      if (tabData.domain !== domain) {
        tabData.domain = domain;
        tabData.requests = [];
        tabData.requestMap = new Map();
      }
    } else {
      tabData = { domain, requests: [], requestMap: new Map() };
      ChromeDebuggerProtocol.networkRequestsByTab.set(tabId, tabData);
    }

    tabData.requests.push(request);
    tabData.requestMap.set(request.requestId, request);

    if (tabData.requests.length > ChromeDebuggerProtocol.MAX_REQUESTS_PER_TAB) {
      const excess = tabData.requests.length - ChromeDebuggerProtocol.MAX_REQUESTS_PER_TAB;
      const removed = tabData.requests.splice(0, excess);
      for (const req of removed) {
        tabData.requestMap.delete(req.requestId);
      }
    }
  }

  async enableNetworkTracking(tabId: number): Promise<void> {
    try {
      if (!ChromeDebuggerProtocol.debuggerListenerRegistered) {
        this.initializeDebuggerEventListener();
      }
      try {
        await this.sendCommand(tabId, 'Network.disable');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      } catch {
        // ignore
      }
      await this.sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
      ChromeDebuggerProtocol.networkTrackingEnabled.add(tabId);
    } catch (error) {
      throw error;
    }
  }

  getNetworkRequests(tabId: number, urlFilter?: string): NetworkRequest[] {
    const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
    if (!tabData) return [];

    let requests = tabData.requests;
    if (urlFilter) {
      requests = requests.filter((req) => req.url.includes(urlFilter));
    }
    return requests;
  }

  clearNetworkRequests(tabId: number): void {
    ChromeDebuggerProtocol.networkRequestsByTab.delete(tabId);
  }

  isNetworkTrackingEnabled(tabId: number): boolean {
    return ChromeDebuggerProtocol.networkTrackingEnabled.has(tabId);
  }

  async screenshot(
    tabId: number,
    resizeParams?: ResizeParams,
    options?: ScreenshotOptions
  ): Promise<ScreenshotResult> {
    const resize = resizeParams || this.defaultResizeParams;
    const format = options?.format ?? 'png';
    const quality = options?.quality ?? 100 * ChromeDebuggerProtocol.INITIAL_JPEG_QUALITY;

    if (!options?.skipIndicator) {
      await tabGroupManager.hideIndicatorForToolUse(tabId);
    }

    try {
      const scriptResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        })
      });

      if (!scriptResults || !scriptResults[0]?.result) {
        throw new Error('Failed to get viewport information');
      }

      const {
        width: viewportWidth,
        height: viewportHeight,
        devicePixelRatio
      } = scriptResults[0].result;

      const captureResult = await this.sendCommand(tabId, 'Page.captureScreenshot', {
        format,
        ...((format === 'jpeg' || format === 'webp') && { quality }),
        captureBeyondViewport: false,
        fromSurface: true
      });

      if (!captureResult || !captureResult.data) {
        throw new Error('Failed to capture screenshot via CDP');
      }

      const rawBase64: string = captureResult.data;

      if (typeof Image === 'undefined') {
        return await this.processScreenshotInContentScript(
          tabId,
          rawBase64,
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          resize
        );
      }

      const dataUrl = `data:image/${format};base64,${rawBase64}`;

      const result = await new Promise<ScreenshotResult>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let imgWidth = img.width;
          let imgHeight = img.height;

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return void reject(new Error('Failed to create 2D context for screenshot processing'));
          }

          const needsDownscale = devicePixelRatio > 1;
          if (needsDownscale) {
            imgWidth = Math.round(img.width / devicePixelRatio);
            imgHeight = Math.round(img.height / devicePixelRatio);
          }

          const [targetWidth, targetHeight] = calculateTargetDimensions(
            imgWidth,
            imgHeight,
            resize
          );
          const needsResize = imgWidth !== targetWidth || imgHeight !== targetHeight;

          if (!needsDownscale && !needsResize) {
            return void resolve({
              base64: rawBase64,
              width: imgWidth,
              height: imgHeight,
              format,
              viewportWidth,
              viewportHeight
            });
          }

          canvas.width = imgWidth;
          canvas.height = imgHeight;

          if (needsDownscale) {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgWidth, imgHeight);
          } else {
            ctx.drawImage(img, 0, 0);
          }

          if (!needsResize) {
            const base64 = canvas.toDataURL(`image/${format}`).split(',')[1];
            return void resolve({
              base64,
              width: imgWidth,
              height: imgHeight,
              format,
              viewportWidth,
              viewportHeight
            });
          }

          const targetCanvas = document.createElement('canvas');
          const targetCtx = targetCanvas.getContext('2d');
          if (!targetCtx) {
            return void reject(new Error('Failed to create 2D context for target resizing'));
          }

          targetCanvas.width = targetWidth;
          targetCanvas.height = targetHeight;
          targetCtx.drawImage(canvas, 0, 0, imgWidth, imgHeight, 0, 0, targetWidth, targetHeight);

          const resizedBase64 = targetCanvas.toDataURL(`image/${format}`).split(',')[1];
          resolve({
            base64: resizedBase64,
            width: targetWidth,
            height: targetHeight,
            format,
            viewportWidth,
            viewportHeight
          });
        };
        img.onerror = () => {
          reject(new Error('Failed to load screenshot image'));
        };
        img.src = dataUrl;
      });

      screenshotContextManager.setContext(tabId, result);
      return result;
    } finally {
      if (!options?.skipIndicator) {
        await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
      }
    }
  }

  async processScreenshotInContentScript(
    tabId: number,
    base64Data: string,
    viewportWidth: number,
    viewportHeight: number,
    devicePixelRatio: number,
    resizeParams: ResizeParams
  ): Promise<ScreenshotResult> {
    const result = await processScreenshotInContentScript({
      tabId,
      base64Data,
      viewportWidth,
      viewportHeight,
      devicePixelRatio,
      resizeParams,
      maxBase64Chars: ChromeDebuggerProtocol.MAX_BASE64_CHARS,
      initialJpegQuality: ChromeDebuggerProtocol.INITIAL_JPEG_QUALITY,
      jpegQualityStep: ChromeDebuggerProtocol.JPEG_QUALITY_STEP,
      minJpegQuality: ChromeDebuggerProtocol.MIN_JPEG_QUALITY
    });
    screenshotContextManager.setContext(tabId, result);
    return result;
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
