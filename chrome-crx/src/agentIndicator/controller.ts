import { CursorRenderer } from '../cursorAnimation/cursorRenderer';
import { createGlowBorder, createBlockingOverlay, createStaticIndicator } from './visualElements';
import { I18nManager } from './i18n';
import { createWaterRipple, WaterRippleHandle } from './waterRipple';
import { createStopContainer, StopContainerHandle } from './stopContainer';
import { ShadowDomManager } from './shadowDom';
import type { RuntimeMessage, MessageResponse } from './types';

const INVALIDATE_EVENT = 'superduck:indicator-invalidate';

export class AgentIndicatorController {
  private scriptInstanceId = Math.random().toString(36).slice(2);
  private invalidated = false;
  private extAliveCheck: ReturnType<typeof setInterval> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;

  private i18n = new I18nManager();
  private shadow = new ShadowDomManager();
  private cursorRenderer: CursorRenderer | null = null;

  private glowBorderEl: HTMLElement | null = null;
  private waterRipple: WaterRippleHandle | null = null;
  private blockingOverlayEl: HTMLElement | null = null;
  private stopContainer: StopContainerHandle | null = null;
  private staticIndicatorEl: HTMLElement | null = null;

  private agentActive = false;
  private staticActive = false;
  private hiddenForToolUse = false;
  private wasStaticActiveBeforeToolUse = false;
  private staticIndicatorHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private mcpEnabled = false;

  private invalidateListener: EventListener;
  private messageListener: (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => boolean;
  private beforeUnloadListener: () => void;

  constructor() {
    try {
      this.cursorRenderer = new CursorRenderer();
    } catch (e) {
      console.error('[Agent Indicator] Failed to construct CursorRenderer', e);
      this.cursorRenderer = null;
    }

    this.i18n.onLocaleChanged = () => this.updateStopContainerI18n();

    this.invalidateListener = ((e: CustomEvent) => {
      if (e.detail?.id !== this.scriptInstanceId) {
        this.fullCleanup();
      }
    }) as EventListener;

    this.messageListener = (
      message: RuntimeMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: MessageResponse) => void
    ): boolean => {
      (async () => {
        switch (message.type) {
          case 'SHOW_AGENT_INDICATORS':
            this.mcpEnabled = this.mcpEnabled || message.isMcp === true;
            await this.showAgentIndicators();
            sendResponse({ success: true });
            break;

          case 'HIDE_AGENT_INDICATORS':
            this.hideAgentIndicators();
            sendResponse({ success: true });
            break;

          case 'HIDE_FOR_TOOL_USE': {
            const hasInterruptiveIndicators =
              this.agentActive ||
              this.blockingOverlayEl !== null ||
              this.glowBorderEl !== null ||
              this.waterRipple !== null ||
              this.stopContainer !== null;
            this.hiddenForToolUse = hasInterruptiveIndicators;
            this.wasStaticActiveBeforeToolUse = this.staticActive;

            this.hideInterruptiveIndicatorsForToolUse();

            const respondOnce = (() => {
              let hasResponded = false;
              return () => {
                if (hasResponded) return;
                hasResponded = true;
                sendResponse({ success: true });
              };
            })();

            if (document.visibilityState !== 'visible') {
              respondOnce();
              break;
            }

            void this.shadow.getDocumentMountRoot().offsetWidth;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setTimeout(respondOnce, 50);
              });
            });
            setTimeout(respondOnce, 200);
            break;
          }

          case 'SHOW_AFTER_TOOL_USE':
            if (this.hiddenForToolUse) {
              this.restoreInterruptiveIndicatorsAfterToolUse();
            }
            if (
              this.wasStaticActiveBeforeToolUse &&
              this.staticIndicatorEl &&
              !this.staticIndicatorEl.parentNode
            ) {
              this.shadow.getDocumentMountRoot().appendChild(this.staticIndicatorEl);
            }

            this.hiddenForToolUse = false;
            this.wasStaticActiveBeforeToolUse = false;

            sendResponse({ success: true });
            break;

          case 'SHOW_STATIC_INDICATOR':
            this.showStaticIndicator();
            sendResponse({ success: true });
            break;

          case 'HIDE_STATIC_INDICATOR':
            this.hideStaticIndicator();
            sendResponse({ success: true });
            break;

          case 'ANIMATE_CURSOR_TO':
            if (!this.agentActive || !this.cursorRenderer) {
              sendResponse({ success: false });
              break;
            }
            try {
              this.cursorRenderer
                .animateTo(message.x ?? 0, message.y ?? 0, message.action ?? 'click')
                .then(() => sendResponse({ success: true }))
                .catch(() => sendResponse({ success: false }));
            } catch (e) {
              console.error('[Agent Indicator] animateTo failed', e);
              sendResponse({ success: false });
            }
            break;

          case 'CONTENT_PING':
            sendResponse({ success: true });
            break;

          default:
            sendResponse({ success: false });
            break;
        }
      })().catch((err) => {
        console.error('[Agent Indicator] onMessage handler failed', message?.type, err);
        try {
          sendResponse({ success: false });
        } catch {
          /* channel may be closed */
        }
      });

      return true;
    };

    this.beforeUnloadListener = () => {
      this.hideAgentIndicators();
      this.hideStaticIndicator();
    };

    document.dispatchEvent(
      new CustomEvent(INVALIDATE_EVENT, { detail: { id: this.scriptInstanceId } })
    );
    document.addEventListener(INVALIDATE_EVENT, this.invalidateListener);

    this.extAliveCheck = setInterval(() => {
      if (!chrome.runtime?.id) {
        if (this.extAliveCheck !== null) clearInterval(this.extAliveCheck);
        this.fullCleanup();
      }
    }, 2000);

    chrome.runtime.onMessage.addListener(this.messageListener);
    window.addEventListener('beforeunload', this.beforeUnloadListener);

    this.recoveryInterval = setInterval(() => {
      if (this.hiddenForToolUse) return;
      if (!this.agentActive) return;

      this.shadow.reattachHost();
      if (this.blockingOverlayEl && !this.blockingOverlayEl.parentNode) {
        console.warn('[SuperDuck Agent] Recovering detached blocking overlay');
        this.shadow.getDocumentMountRoot().appendChild(this.blockingOverlayEl);
      }
      this.safeCursor((r) => r.reattachToDOM());
    }, 2000);
  }

  private fullCleanup(): void {
    if (this.invalidated) return;
    this.invalidated = true;

    if (this.extAliveCheck !== null) {
      clearInterval(this.extAliveCheck);
      this.extAliveCheck = null;
    }
    if (this.recoveryInterval !== null) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    (window as any).__superduck_agent_indicator_loaded__ = false;

    document.removeEventListener(INVALIDATE_EVENT, this.invalidateListener);
    chrome.runtime.onMessage.removeListener(this.messageListener);
    window.removeEventListener('beforeunload', this.beforeUnloadListener);

    try {
      this.i18n.dispose();
    } catch {
      /* noop */
    }
    try {
      this.hideAgentIndicators();
    } catch {
      /* noop */
    }
    try {
      this.hideStaticIndicator();
    } catch {
      /* noop */
    }
  }

  private safeCursor(fn: (r: CursorRenderer) => void): void {
    if (!this.cursorRenderer) return;
    try {
      fn(this.cursorRenderer);
    } catch (e) {
      console.error('[Agent Indicator] cursorRenderer call failed', e);
    }
  }

  private updateStopContainerI18n(): void {
    if (!this.stopContainer) return;

    const statusText = this.stopContainer.container.querySelector<HTMLElement>(
      '[data-superduck-i18n="status"]'
    );
    if (statusText) {
      statusText.textContent = this.i18n.getRandomStatus();
    }

    const takeOverBtn = this.stopContainer.container.querySelector<HTMLButtonElement>(
      '[data-superduck-i18n="take-over"]'
    );
    if (takeOverBtn) {
      takeOverBtn.textContent = this.i18n.t('agent_take_over_button');
    }
  }

  private async showAgentIndicators(): Promise<void> {
    this.agentActive = true;

    const i18nPromise = this.i18n.load();

    const overlay = this.shadow.getOverlay();

    this.safeCursor((r) => r.setAttachRoot(overlay));

    const showInterruptive = !this.hiddenForToolUse;
    const interruptiveDisplay = showInterruptive ? '' : 'none';

    if (this.glowBorderEl) {
      this.glowBorderEl.style.display = interruptiveDisplay;
    } else {
      this.glowBorderEl = createGlowBorder();
      this.glowBorderEl.style.display = interruptiveDisplay;
      overlay.appendChild(this.glowBorderEl);
    }

    if (this.waterRipple) {
      this.waterRipple.container.style.display = interruptiveDisplay;
    } else {
      this.waterRipple = createWaterRipple();
      this.waterRipple.start();
      this.waterRipple.container.style.display = interruptiveDisplay;
      overlay.appendChild(this.waterRipple.container);
    }

    if (this.blockingOverlayEl) {
      this.blockingOverlayEl.style.display = interruptiveDisplay;
    } else {
      this.blockingOverlayEl = createBlockingOverlay();
      this.blockingOverlayEl.style.display = interruptiveDisplay;
      this.shadow.getDocumentMountRoot().appendChild(this.blockingOverlayEl);
    }

    if (!showInterruptive) this.pauseToolUseDecorAnimations();

    if (showInterruptive) {
      requestAnimationFrame(() => {
        if (this.glowBorderEl) this.glowBorderEl.style.opacity = '1';
        if (this.waterRipple) this.waterRipple.container.style.opacity = '1';
        if (this.blockingOverlayEl) this.blockingOverlayEl.style.opacity = '1';
      });
    }

    this.safeCursor((r) => r.showIdle());

    await i18nPromise;

    if (!this.agentActive) return;

    if (this.mcpEnabled) {
      console.log('[Agent Indicator] Creating/showing stop button');
      if (!this.stopContainer) {
        this.stopContainer = createStopContainer(this.i18n);
        this.stopContainer.start();
        overlay.appendChild(this.stopContainer.container);
      } else if (!this.stopContainer.container.parentNode) {
        overlay.appendChild(this.stopContainer.container);
      }
      if (!this.hiddenForToolUse) {
        this.stopContainer!.container.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(() => {
          if (this.stopContainer) {
            this.stopContainer.container.style.opacity = '1';
            this.stopContainer.container.style.transform = 'translateX(-50%) translateY(0)';
          }
        });
      } else {
        this.stopContainer!.container.style.display = 'none';
      }
    } else {
      console.log('[Agent Indicator] NOT creating stop button because isMcpEnabled is false');
    }

    if (this.hiddenForToolUse) this.hideInterruptiveIndicatorsForToolUse();
  }

  private hideAgentIndicators(): void {
    if (!this.agentActive) return;

    this.agentActive = false;

    if (this.glowBorderEl) {
      this.glowBorderEl.style.opacity = '0';
    }
    if (this.waterRipple) {
      this.waterRipple.container.style.opacity = '0';
    }
    if (this.blockingOverlayEl) {
      this.blockingOverlayEl.style.opacity = '0';
    }

    if (this.stopContainer) {
      this.stopContainer.container.style.opacity = '0';
      this.stopContainer.container.style.transform = 'translateX(-50%) translateY(100px)';
    }

    setTimeout(() => {
      if (!this.agentActive) {
        if (this.glowBorderEl && this.glowBorderEl.parentNode) {
          this.glowBorderEl.parentNode.removeChild(this.glowBorderEl);
          this.glowBorderEl = null;
        }
        if (this.waterRipple && this.waterRipple.container.parentNode) {
          this.waterRipple.stop();
          this.waterRipple.container.parentNode.removeChild(this.waterRipple.container);
          this.waterRipple = null;
        }
        if (this.blockingOverlayEl) {
          if (this.blockingOverlayEl.parentNode) {
            this.blockingOverlayEl.parentNode.removeChild(this.blockingOverlayEl);
          }
          this.blockingOverlayEl = null;
        }
        if (this.stopContainer && this.stopContainer.container.parentNode) {
          this.stopContainer.stop();
          this.stopContainer.container.parentNode.removeChild(this.stopContainer.container);
          this.stopContainer = null;
        }
        this.safeCursor((r) => r.hide());
        this.shadow.teardown();
      }
    }, 300);
  }

  private showStaticIndicator(): void {
    this.staticActive = true;

    if (this.staticIndicatorEl) {
      if (!this.staticIndicatorEl.parentNode) {
        this.shadow.getDocumentMountRoot().appendChild(this.staticIndicatorEl);
      }
      this.staticIndicatorEl.style.display = '';
    } else {
      this.staticIndicatorEl = createStaticIndicator();
      this.shadow.getDocumentMountRoot().appendChild(this.staticIndicatorEl);
    }

    if (this.staticIndicatorHeartbeatInterval) {
      clearInterval(this.staticIndicatorHeartbeatInterval);
      this.staticIndicatorHeartbeatInterval = null;
    }

    this.staticIndicatorHeartbeatInterval = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'STATIC_INDICATOR_HEARTBEAT'
        });
        if (!response?.success) {
          this.hideStaticIndicator();
        }
      } catch (e) {
        this.hideStaticIndicator();
      }
    }, 5000);
  }

  private pauseToolUseDecorAnimations(): void {
    if (this.waterRipple) this.waterRipple.pause();
    if (this.stopContainer) this.stopContainer.pause();
  }

  private hideInterruptiveIndicatorsForToolUse(): void {
    this.pauseToolUseDecorAnimations();

    if (this.glowBorderEl) this.glowBorderEl.style.display = 'none';
    if (this.waterRipple) this.waterRipple.container.style.display = 'none';
    if (this.stopContainer) this.stopContainer.container.style.display = 'none';
    if (this.blockingOverlayEl) {
      this.blockingOverlayEl.style.display = 'none';
    }
    if (this.staticIndicatorEl?.parentNode && this.staticActive)
      this.staticIndicatorEl.parentNode.removeChild(this.staticIndicatorEl);
  }

  private restoreInterruptiveIndicatorsAfterToolUse(): void {
    if (!this.agentActive) return;

    if (this.glowBorderEl) {
      this.glowBorderEl.style.display = '';
      this.glowBorderEl.style.opacity = '1';
    }
    if (this.waterRipple) {
      this.waterRipple.container.style.display = '';
      this.waterRipple.container.style.opacity = '1';
    }
    if (this.mcpEnabled && this.stopContainer) {
      this.stopContainer.container.style.setProperty('display', 'flex', 'important');
      this.stopContainer.container.style.opacity = '1';
      this.stopContainer.container.style.transform = 'translateX(-50%) translateY(0)';
    }

    if (this.blockingOverlayEl) {
      this.blockingOverlayEl.style.display = '';
      this.blockingOverlayEl.style.visibility = '';
      this.blockingOverlayEl.style.pointerEvents = 'auto';
      this.blockingOverlayEl.style.opacity = '1';
      if (!this.blockingOverlayEl.parentNode)
        this.shadow.getDocumentMountRoot().appendChild(this.blockingOverlayEl);
    }

    if (this.waterRipple) this.waterRipple.restart();
    if (this.stopContainer) this.stopContainer.restart();
  }

  private hideStaticIndicator(): void {
    if (!this.staticActive) return;

    this.staticActive = false;

    if (this.staticIndicatorHeartbeatInterval) {
      clearInterval(this.staticIndicatorHeartbeatInterval);
      this.staticIndicatorHeartbeatInterval = null;
    }

    if (this.staticIndicatorEl && this.staticIndicatorEl.parentNode) {
      this.staticIndicatorEl.parentNode.removeChild(this.staticIndicatorEl);
      this.staticIndicatorEl = null;
    }
  }
}
