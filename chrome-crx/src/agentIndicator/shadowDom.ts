export class ShadowDomManager {
  private hostEl: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private overlayEl: HTMLElement | null = null;

  getDocumentMountRoot(): HTMLElement {
    return document.body ?? document.documentElement;
  }

  ensure(): ShadowRoot {
    if (this.root) return this.root;

    this.hostEl = document.createElement('div');
    this.hostEl.id = 'superduck-agent-overlay-root';
    this.hostEl.style.cssText = `
      all: initial;
      display: block;
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 2147483646;
      overflow: visible;
    `;

    this.root = this.hostEl.attachShadow({ mode: 'closed' });

    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .superduck-agent-overlay {
        all: initial;
        display: block;
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        overflow: visible;
        pointer-events: none;
        z-index: 2147483646;
      }
      @keyframes superduck-glass-breathe {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
      @keyframes superduck-glow-breathe {
        0%, 100% { opacity: 0.25; }
        50% { opacity: 1; }
      }
      @keyframes superduck-cursor-click-ripple {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 0.7; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
      }
      @media print {
        .superduck-agent-overlay { display: none; }
      }
    `;
    this.root.appendChild(styleEl);

    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'superduck-agent-overlay';
    this.overlayEl.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.overlayEl);

    this.getDocumentMountRoot().appendChild(this.hostEl);
    return this.root;
  }

  getOverlay(): HTMLElement {
    this.ensure();
    return this.overlayEl!;
  }

  reattachHost(): void {
    if (this.hostEl && !this.hostEl.parentNode) {
      console.warn('[SuperDuck Agent] Recovering detached shadow host');
      this.getDocumentMountRoot().appendChild(this.hostEl);
    }
  }

  teardown(): void {
    if (this.hostEl && this.hostEl.parentNode) {
      this.hostEl.parentNode.removeChild(this.hostEl);
    }
    this.hostEl = null;
    this.root = null;
    this.overlayEl = null;
  }
}
