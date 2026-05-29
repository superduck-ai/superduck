import { CursorRenderer } from './cursorAnimation/cursorRenderer';

(function () {
  if ((window as any).__superduck_agent_indicator_loaded__) return;
  (window as any).__superduck_agent_indicator_loaded__ = true;

  const SCRIPT_INSTANCE_ID = Math.random().toString(36).slice(2);
  const INVALIDATE_EVENT = 'superduck:indicator-invalidate';
  let isInvalidated = false;
  let extAliveCheck: ReturnType<typeof setInterval> | null = null;

  document.dispatchEvent(new CustomEvent(INVALIDATE_EVENT, { detail: { id: SCRIPT_INSTANCE_ID } }));

  function fullCleanup() {
    if (isInvalidated) return;
    isInvalidated = true;
    if (extAliveCheck !== null) {
      clearInterval(extAliveCheck);
      extAliveCheck = null;
    }
    (window as any).__superduck_agent_indicator_loaded__ = false;
    try {
      chrome.storage.onChanged.removeListener(handlePreferredLocaleChanged);
    } catch {
      /* noop */
    }
    try {
      hideAgentIndicators();
    } catch {
      /* noop */
    }
    try {
      hideStaticIndicator();
    } catch {
      /* noop */
    }
  }

  document.addEventListener(INVALIDATE_EVENT, ((e: CustomEvent) => {
    if (e.detail?.id !== SCRIPT_INSTANCE_ID) {
      fullCleanup();
    }
  }) as EventListener);

  extAliveCheck = setInterval(() => {
    if (!chrome.runtime?.id) {
      if (extAliveCheck !== null) clearInterval(extAliveCheck);
      fullCleanup();
    }
  }, 2000);

  // I18n support
  const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
  const DEFAULT_LOCALE = 'en-US';
  const PREFERRED_LOCALE_STORAGE_KEY = 'preferred_locale';
  const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);
  const AGENT_STATUS_KEYS = [
    'agent_status_working',
    'agent_status_helping',
    'agent_status_rushing',
    'agent_status_busy',
    'agent_status_outputting',
    'agent_status_takeover',
    'agent_status_full_power',
    'agent_status_showing_off',
    'agent_status_dont_move',
    'agent_status_working_duck',
    'agent_status_managed',
    'agent_status_online'
  ] as const;
  const DEFAULT_I18N_MESSAGES: Record<string, string> = {
    agent_status_working: 'Duck is working hard',
    agent_status_helping: 'Quack quack~ Duck is helping you',
    agent_status_rushing: 'SuperDuck is rushing',
    agent_status_busy: 'Duck is busy doing things',
    agent_status_outputting: 'Duck is outputting like crazy',
    agent_status_takeover: 'Quack! Duck took over the browser',
    agent_status_full_power: 'Duck power at full capacity',
    agent_status_showing_off: 'SuperDuck is showing off',
    agent_status_dont_move: "Don't move! Duck is busy",
    agent_status_working_duck: 'Duck turned into working duck',
    agent_status_managed: 'This page is managed by Duck',
    agent_status_online: 'Quack agent is online',
    agent_take_over_button: 'Take over'
  };

  function normalizeLocale(locale: string): string {
    if (SUPPORTED_LOCALE_SET.has(locale)) {
      return locale;
    }
    const language = locale.split('-')[0];
    const matched = SUPPORTED_LOCALES.find((l) => l.startsWith(`${language}-`));
    return matched || DEFAULT_LOCALE;
  }

  let i18nMessages: Record<string, string> = DEFAULT_I18N_MESSAGES;
  let i18nLoaded = false;
  let i18nLocale = DEFAULT_LOCALE;
  let i18nLoadVersion = 0;

  async function loadI18n(): Promise<void> {
    if (i18nLoaded) return;
    const requestVersion = ++i18nLoadVersion;
    try {
      const stored = await chrome.storage.local.get(PREFERRED_LOCALE_STORAGE_KEY);
      const rawLocale: string =
        (stored[PREFERRED_LOCALE_STORAGE_KEY] as string) || navigator.language || DEFAULT_LOCALE;
      const locale = normalizeLocale(rawLocale);
      if (requestVersion !== i18nLoadVersion) return;
      i18nMessages = DEFAULT_I18N_MESSAGES;
      i18nLocale = locale;
      const response = await fetch(chrome.runtime.getURL(`i18n/${locale}.json`));
      if (requestVersion !== i18nLoadVersion) return;
      if (response.ok) {
        i18nMessages = { ...DEFAULT_I18N_MESSAGES, ...(await response.json()) };
      }
    } catch (e) {
      if (requestVersion !== i18nLoadVersion) return;
      i18nMessages = DEFAULT_I18N_MESSAGES;
      i18nLocale = DEFAULT_LOCALE;
    }
    if (requestVersion === i18nLoadVersion) {
      i18nLoaded = true;
    }
  }

  function t(key: string, fallback: string = ''): string {
    return i18nMessages[key] || DEFAULT_I18N_MESSAGES[key] || fallback;
  }

  function getRandomAgentStatus(): string {
    const messages = AGENT_STATUS_KEYS.map((key) => t(key));
    return messages[Math.floor(Math.random() * messages.length)];
  }

  function updateStopContainerI18n(): void {
    if (!stopContainerEl) return;

    const statusText = stopContainerEl.querySelector<HTMLElement>('[data-superduck-i18n="status"]');
    if (statusText) {
      statusText.textContent = getRandomAgentStatus();
    }

    const takeOverBtn = stopContainerEl.querySelector<HTMLButtonElement>(
      '[data-superduck-i18n="take-over"]'
    );
    if (takeOverBtn) {
      takeOverBtn.textContent = t('agent_take_over_button');
    }
  }

  function handlePreferredLocaleChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void {
    if (areaName !== 'local' || !changes[PREFERRED_LOCALE_STORAGE_KEY]) {
      return;
    }

    const nextLocale = normalizeLocale(
      (changes[PREFERRED_LOCALE_STORAGE_KEY].newValue as string) ||
        navigator.language ||
        DEFAULT_LOCALE
    );
    if (nextLocale === i18nLocale && i18nLoaded) {
      return;
    }

    i18nLoaded = false;
    void loadI18n().then(updateStopContainerI18n);
  }

  chrome.storage.onChanged.addListener(handlePreferredLocaleChanged);

  // State variables
  let glowBorderEl: HTMLElement | null = null;
  let waterRippleContainerEl: HTMLElement | null = null;
  let waterRippleAnimationId: number | null = null;
  let waterRippleResizeHandler: (() => void) | null = null;
  let waterRippleAnimateFunc: (() => void) | null = null;
  let blockingOverlayEl: HTMLElement | null = null;
  let stopContainerEl: HTMLElement | null = null;
  let stopContainerAnimFrame: number | null = null;
  let stopContainerAnimateFunc: ((now: number) => void) | null = null;
  let staticIndicatorEl: HTMLElement | null = null;
  let isAgentActive = false;
  let isStaticIndicatorActive = false;
  let isHiddenForToolUse = false;
  let wasStaticActiveBeforeToolUse = false;
  let staticIndicatorHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let ellipsisInterval: ReturnType<typeof setInterval> | null = null;
  let isMcpEnabled = false;

  function getDocumentMountRoot(): HTMLElement {
    return document.body ?? document.documentElement;
  }

  // Shadow DOM isolation
  let shadowHostEl: HTMLElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let shadowOverlayEl: HTMLElement | null = null;

  function ensureShadowRoot(): ShadowRoot {
    if (shadowRoot) return shadowRoot;

    shadowHostEl = document.createElement('div');
    shadowHostEl.id = 'superduck-agent-overlay-root';
    shadowHostEl.style.cssText = `
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

    shadowRoot = shadowHostEl.attachShadow({ mode: 'closed' });

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
    shadowRoot.appendChild(styleEl);

    shadowOverlayEl = document.createElement('div');
    shadowOverlayEl.className = 'superduck-agent-overlay';
    shadowOverlayEl.setAttribute('aria-hidden', 'true');
    shadowRoot.appendChild(shadowOverlayEl);

    getDocumentMountRoot().appendChild(shadowHostEl);
    return shadowRoot;
  }

  function getOverlayContainer(): HTMLElement {
    ensureShadowRoot();
    return shadowOverlayEl!;
  }

  let cursorRenderer: CursorRenderer | null = null;
  try {
    cursorRenderer = new CursorRenderer();
  } catch (e) {
    console.error('[Agent Indicator] Failed to construct CursorRenderer', e);
    cursorRenderer = null;
  }

  function safeCursor(fn: (r: CursorRenderer) => void): void {
    if (!cursorRenderer) return;
    try {
      fn(cursorRenderer);
    } catch (e) {
      console.error('[Agent Indicator] cursorRenderer call failed', e);
    }
  }

  // ============================================
  // Agent Glow Border
  // ============================================

  function createGlowBorder(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.id = 'superduck-agent-glow-border';
    wrapper.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483646;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;

    // Static glow - top
    const glowTop = document.createElement('div');
    glowTop.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; height: 75px;
      filter: blur(15px); pointer-events: none;
      animation: superduck-glow-breathe 4.8s ease-in-out infinite;
      background: linear-gradient(180deg,
        rgba(230, 140, 85, 0.6) 0%,
        rgba(240, 170, 90, 0.3) 35%,
        rgba(255, 195, 120, 0.12) 65%,
        transparent 100%);
    `;

    // Static glow - left
    const glowLeft = document.createElement('div');
    glowLeft.style.cssText = `
      position: absolute; top: 0; left: 0; bottom: 0; width: 75px;
      filter: blur(15px); pointer-events: none;
      animation: superduck-glow-breathe 4.8s ease-in-out infinite;
      background: linear-gradient(90deg,
        rgba(230, 140, 85, 0.6) 0%,
        rgba(240, 170, 90, 0.3) 35%,
        rgba(255, 195, 120, 0.12) 65%,
        transparent 100%);
    `;

    // Static glow - right
    const glowRight = document.createElement('div');
    glowRight.style.cssText = `
      position: absolute; top: 0; right: 0; bottom: 0; width: 75px;
      filter: blur(15px); pointer-events: none;
      animation: superduck-glow-breathe 4.8s ease-in-out infinite;
      background: linear-gradient(270deg,
        rgba(230, 140, 85, 0.6) 0%,
        rgba(240, 170, 90, 0.3) 35%,
        rgba(255, 195, 120, 0.12) 65%,
        transparent 100%);
    `;

    // Glass border with breathing animation
    const glassBorder = document.createElement('div');
    glassBorder.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      box-shadow:
        inset 0 0 10px rgba(230, 140, 85, 0.7),
        inset 0 0 30px rgba(240, 170, 90, 0.25),
        inset 0 0 70px rgba(255, 195, 120, 0.1);
      animation: superduck-glass-breathe 4.8s ease-in-out infinite;
    `;

    wrapper.appendChild(glowTop);
    wrapper.appendChild(glowLeft);
    wrapper.appendChild(glowRight);
    wrapper.appendChild(glassBorder);

    return wrapper;
  }

  // ============================================
  // Water Ripple Canvas
  // ============================================

  // Simple seeded noise (Perlin-like via value noise interpolation)
  const noisePermutation: number[] = [];
  (function initNoise() {
    for (let i = 0; i < 512; i++) {
      noisePermutation[i] = Math.random();
    }
  })();

  function valueNoise(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const smoothX = xf * xf * (3 - 2 * xf);
    const smoothY = yf * yf * (3 - 2 * yf);

    const tl = noisePermutation[(xi + yi * 13) & 511];
    const tr = noisePermutation[(xi + 1 + yi * 13) & 511];
    const bl = noisePermutation[(xi + (yi + 1) * 13) & 511];
    const br = noisePermutation[(xi + 1 + (yi + 1) * 13) & 511];

    const top = tl + smoothX * (tr - tl);
    const bottom = bl + smoothX * (br - bl);
    return top + smoothY * (bottom - top);
  }

  interface WaveConfig {
    r: number;
    g: number;
    b: number;
    alpha: number;
    depth: number;
    offset: number;
    t: number;
  }

  function createWaterRipple(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'superduck-water-ripple-container';
    container.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 100px;
      pointer-events: none;
      z-index: 2147483646;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;

    const canvas = document.createElement('canvas');
    canvas.id = 'superduck-water-ripple-canvas';
    canvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
      filter: blur(1px);
    `;
    container.appendChild(canvas);

    const colors: [number, number, number][] = [
      [230, 140, 85],
      [235, 160, 90],
      [240, 175, 95],
      [245, 185, 100],
      [250, 195, 110]
    ];

    const waves: WaveConfig[] = colors.map(([r, g, b], i) => ({
      r,
      g,
      b,
      alpha: 0.343 - i * 0.039,
      depth: i,
      offset: 100 + Math.random() * 100,
      t: 0
    }));

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }

    waterRippleResizeHandler = resizeCanvas;

    function drawWave(ctx: CanvasRenderingContext2D, w: WaveConfig, width: number, height: number) {
      ctx.fillStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${w.alpha})`;
      ctx.beginPath();

      const step = 25;
      let started = false;
      for (let x = 0; x <= width + step; x += step) {
        const xoff = (x / width) * 3;
        const noiseVal = valueNoise(xoff + w.offset, w.t + w.offset);
        const yoff = noiseVal * 80;
        const y = height - yoff - w.depth * 12;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      w.t += 0.005;
    }

    function animate() {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      if (width === 0 || height === 0) {
        waterRippleAnimationId = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const w of waves) {
        drawWave(ctx, w, width, height);
      }

      waterRippleAnimationId = requestAnimationFrame(animate);
    }

    waterRippleAnimateFunc = animate;

    // Initialize after append
    requestAnimationFrame(() => {
      resizeCanvas();
      animate();
    });

    window.addEventListener('resize', resizeCanvas);

    return container;
  }

  // ============================================
  // Blocking Overlay (prevents user interaction)
  // ============================================

  function createBlockingOverlay(): HTMLElement {
    // 全屏透明遮罩，拦截真实用户输入。
    // CDP Input.dispatchMouseEvent / dispatchKeyEvent 是浏览器层注入，
    // 不经过 DOM 事件分发，不受 pointer-events 影响，因此 agent 的点击/滚动
    // 不会被这层遮罩阻断。注意：不要再加 touch-action:none —— 历史上它会
    // 阻断 content-script 派发的 wheel 事件（虽然现在走 CDP，但保持简洁）。
    const overlay = document.createElement('div');
    overlay.id = 'superduck-agent-blocking-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      pointer-events: auto;
      z-index: 2147483645;
      cursor: not-allowed;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;

    const swallow = (e: Event) => {
      if (!e.isTrusted) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const events = [
      'click',
      'dblclick',
      'auxclick',
      'contextmenu',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'touchstart',
      'touchend',
      'touchmove',
      'keydown',
      'keyup',
      'keypress',
      'wheel'
    ];
    for (const evt of events) {
      overlay.addEventListener(evt, swallow, { capture: true, passive: false });
    }

    return overlay;
  }

  // ============================================
  // Stop Button
  // ============================================

  function createStopContainer(): HTMLElement {
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    const getBorderColor = () => (darkMq.matches ? '#ffffff1a' : '#0000001a');

    // ========== Outer wrapper: positioning + rotating gradient clip ==========
    const wrapper = document.createElement('div');
    wrapper.id = 'superduck-agent-stop-container';
    wrapper.style.cssText = `
      position: fixed;
      bottom: 116px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 2px;
      border-radius: 42px;
      overflow: clip;
      pointer-events: auto;
      z-index: 2147483647;
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      user-select: none;
      box-shadow:
        0 12px 40px rgba(0, 0, 0, 0.06),
        0 2px 6px rgba(0, 0, 0, 0.03);
    `;

    // ========== Moving border beam (BorderBeam style) ==========
    const ringClip = document.createElement('div');
    ringClip.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: 42px;
      overflow: clip;
      padding: 2px;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      mask-composite: exclude;
      pointer-events: none;
      z-index: 1;
    `;

    const beamLayer = document.createElement('div');
    beamLayer.style.cssText = `
      position: absolute;
      width: 76px;
      aspect-ratio: 1;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(148, 163, 184, 0.12) 12%,
        rgba(191, 219, 254, 0.46) 28%,
        rgba(147, 197, 253, 0.68) 42%,
        rgba(248, 250, 252, 0.84) 52%,
        rgba(125, 211, 252, 0.62) 64%,
        rgba(59, 130, 246, 0.32) 82%,
        transparent 100%
      );
      filter:
        drop-shadow(0 0 2px rgba(255, 255, 255, 0.7))
        drop-shadow(0 0 7px rgba(125, 211, 252, 0.34))
        drop-shadow(0 0 14px rgba(96, 165, 250, 0.26));
      opacity: 0.92;
      offset-path: rect(0 auto auto 0 round 76px);
      offset-distance: 20%;
      pointer-events: none;
    `;

    // Port of Magic UI's BorderBeam motion model:
    // a small beam travels on CSS offset-path, while a spring drives
    // offset-distance from initialOffset to 100 + initialOffset each loop.
    const initialOffset = 20;
    const repeatDistance = 100;
    const springStiffness = 60;
    const springDamping = 20;
    const settleEpsilon = 0.015;

    let beamOffset = initialOffset;
    let beamVelocity = 0;
    let targetOffset = initialOffset + repeatDistance;
    let lastFrameTime = 0;
    let settleStartedAt = 0;

    function springTick(now: number) {
      if (!lastFrameTime) lastFrameTime = now;

      const dt = Math.min((now - lastFrameTime) / 1000, 0.04);
      lastFrameTime = now;

      const distance = targetOffset - beamOffset;
      const force = springStiffness * distance - springDamping * beamVelocity;
      beamVelocity += force * dt;
      beamOffset += beamVelocity * dt;

      if (Math.abs(distance) < settleEpsilon && Math.abs(beamVelocity) < settleEpsilon) {
        if (!settleStartedAt) settleStartedAt = now;
      } else {
        settleStartedAt = 0;
      }

      if (settleStartedAt && now - settleStartedAt > 140) {
        targetOffset += repeatDistance;
        settleStartedAt = 0;
      }

      beamLayer.style.offsetDistance = `${beamOffset}%`;
      stopContainerAnimFrame = requestAnimationFrame(springTick);
    }

    stopContainerAnimateFunc = (now: number) => {
      lastFrameTime = now;
      springTick(now);
    };
    stopContainerAnimFrame = requestAnimationFrame(springTick);

    ringClip.appendChild(beamLayer);

    // ========== Inner container: layout + content ==========
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      z-index: 2;
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      justify-content: space-between !important;
      align-items: center !important;
      gap: 16px !important;
      padding: 10px 16px 10px 20px !important;
      white-space: nowrap !important;
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.72) 0%,
        rgba(255, 255, 255, 0.48) 50%,
        rgba(255, 255, 255, 0.56) 100%
      );
      backdrop-filter: blur(24px) saturate(1.8);
      -webkit-backdrop-filter: blur(24px) saturate(1.8);
      border: 1px solid ${getBorderColor()};
      border-radius: 40px;
      box-shadow:
        inset 0 1px 1px rgba(255, 255, 255, 0.9),
        inset 0 -1px 2px rgba(0, 0, 0, 0.03);
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      user-select: none;
      white-space: nowrap;
    `;

    darkMq.addEventListener('change', () => {
      container.style.borderColor = getBorderColor();
    });

    const defaultWrapperShadow = `
      0 12px 40px rgba(0, 0, 0, 0.06),
      0 2px 6px rgba(0, 0, 0, 0.03)
    `;
    const hoverWrapperShadow = `
      0 0 14px rgba(230, 160, 90, 0.38),
      0 0 32px rgba(255, 190, 120, 0.22),
      0 12px 40px rgba(0, 0, 0, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.05)
    `;

    wrapper.addEventListener('mouseenter', () => {
      wrapper.style.boxShadow = hoverWrapperShadow;
      container.style.borderColor = getBorderColor();
    });

    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.boxShadow = defaultWrapperShadow;
      container.style.borderColor = getBorderColor();
    });

    // ========== Child A (left group): emoji + text + dots ==========
    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = `
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
      gap: 6px !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
    `;

    const emojiEl = document.createElement('span');
    emojiEl.textContent = '🦆';
    emojiEl.style.cssText = `font-size: 16px; line-height: 1; flex-shrink: 0;`;

    const statusText = document.createElement('span');
    statusText.dataset.superduckI18n = 'status';
    statusText.textContent = getRandomAgentStatus();
    statusText.style.cssText = `
      color: #1a1a1a;
      font-size: 13px;
      font-weight: 500;
      flex-shrink: 0;
    `;

    // Animated dots: fixed-width container to prevent layout shift
    const dotsEl = document.createElement('span');
    dotsEl.style.cssText = `
      display: inline-block;
      width: 1.5em;
      text-align: left;
      color: #1a1a1a;
      font-size: 13px;
      font-weight: 500;
      flex-shrink: 0;
    `;
    dotsEl.textContent = '.';

    let dotCount = 1;
    ellipsisInterval = setInterval(() => {
      dotCount = (dotCount % 3) + 1;
      dotsEl.textContent = '.'.repeat(dotCount);
    }, 500);

    leftGroup.appendChild(emojiEl);
    leftGroup.appendChild(statusText);
    leftGroup.appendChild(dotsEl);

    // ========== Child B (right group): button ==========
    const takeOverBtn = document.createElement('button');
    takeOverBtn.id = 'superduck-agent-stop-button';
    takeOverBtn.dataset.superduckI18n = 'take-over';
    takeOverBtn.textContent = t('agent_take_over_button');
    takeOverBtn.style.cssText = `
      padding: 6px 16px;
      background: #2c2c2c;
      color: #FAF9F5;
      border: none;
      border-radius: 20px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.2s, box-shadow 0.2s;
      pointer-events: auto;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
    `;

    takeOverBtn.addEventListener('mouseenter', () => {
      takeOverBtn.style.background = '#3a3a3a';
      takeOverBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    });

    takeOverBtn.addEventListener('mouseleave', () => {
      takeOverBtn.style.background = '#2c2c2c';
      takeOverBtn.style.boxShadow = 'none';
    });

    takeOverBtn.addEventListener('click', async () => {
      try {
        takeOverBtn.style.pointerEvents = 'none';
        takeOverBtn.style.opacity = '0.5';

        await chrome.runtime.sendMessage({
          type: 'STOP_AGENT',
          fromTabId: 'CURRENT_TAB'
        });

        setTimeout(() => {
          takeOverBtn.style.pointerEvents = 'auto';
          takeOverBtn.style.opacity = '1';
        }, 1000);
      } catch (error) {
        console.error('Failed to stop agent:', error);
        takeOverBtn.style.pointerEvents = 'auto';
        takeOverBtn.style.opacity = '1';
      }
    });

    // Assemble: wrapper > [ringClip > gradientLayer, container > [leftGroup, takeOverBtn]]
    container.appendChild(leftGroup);
    container.appendChild(takeOverBtn);
    wrapper.appendChild(ringClip);
    wrapper.appendChild(container);
    return wrapper;
  }

  // ============================================
  // Static Indicator
  // ============================================

  function createStaticIndicator(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'superduck-static-indicator-container';
    container.innerHTML = `
      <span style="width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; flex-shrink: 0; margin-right: 8px; font-size: 16px; line-height: 1;" aria-hidden="true">🦆</span>
      <span style="vertical-align: middle; color: #141413; font-size: 14px; display: inline-block;">SuperDuck is active in this tab group</span>
      <div style="display: inline-block; width: 0.5px; height: 32px; background: rgba(31, 30, 29, 0.15); margin: 0 8px; vertical-align: middle;"></div>
      <button id="superduck-static-chat-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; border-radius: 8px; transition: background 0.2s;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="#141413" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
          <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5H3C2.79779 17.5 2.61549 17.3782 2.53809 17.1914C2.4607 17.0046 2.50349 16.7895 2.64648 16.6465L4.35547 14.9365C3.20124 13.6175 2.5 11.8906 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 11.7952 4.22659 13.4199 5.40332 14.5967L5.46582 14.6729C5.52017 14.7544 5.5498 14.8508 5.5498 14.9502C5.5498 15.0828 5.49709 15.2099 5.40332 15.3037L4.20703 16.5H10C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM13.29 9.30371C13.3986 9.05001 13.6925 8.93174 13.9463 9.04004C14.2 9.14863 14.3183 9.44253 14.21 9.69629C13.8506 10.536 13.1645 11.25 12.25 11.25C11.6372 11.25 11.128 10.9289 10.75 10.4648C10.372 10.9289 9.86276 11.25 9.25 11.25C8.63724 11.25 8.12801 10.9289 7.75 10.4648C7.37198 10.9289 6.86276 11.25 6.25 11.25C5.97386 11.25 5.75 11.0261 5.75 10.75C5.75 10.4739 5.97386 10.25 6.25 10.25C6.58764 10.25 7.00448 9.97056 7.29004 9.30371L7.32422 9.2373C7.41431 9.09121 7.5749 9 7.75 9C7.9501 9 8.13123 9.11975 8.20996 9.30371L8.32227 9.53516C8.59804 10.0359 8.95442 10.25 9.25 10.25C9.58764 10.25 10.0045 9.97056 10.29 9.30371L10.3242 9.2373C10.4143 9.09121 10.5749 9 10.75 9C10.9501 9 11.1312 9.11975 11.21 9.30371L11.3223 9.53516C11.598 10.0359 11.9544 10.25 12.25 10.25C12.5876 10.25 13.0045 9.97056 13.29 9.30371Z" />
        </svg>
        <span id="superduck-static-chat-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: #FAF9F5; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Open chat</span>
      </button>
      <button id="superduck-static-close-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; margin-left: 4px; border-radius: 8px; transition: background 0.2s;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
          <path d="M15.1464 4.14642C15.3417 3.95121 15.6582 3.95118 15.8534 4.14642C16.0486 4.34168 16.0486 4.65822 15.8534 4.85346L10.7069 9.99997L15.8534 15.1465C16.0486 15.3417 16.0486 15.6583 15.8534 15.8535C15.6826 16.0244 15.4186 16.0461 15.2245 15.918L15.1464 15.8535L9.99989 10.707L4.85338 15.8535C4.65813 16.0486 4.34155 16.0486 4.14634 15.8535C3.95115 15.6583 3.95129 15.3418 4.14634 15.1465L9.29286 9.99997L4.14634 4.85346C3.95129 4.65818 3.95115 4.34162 4.14634 4.14642C4.34154 3.95128 4.65812 3.95138 4.85338 4.14642L9.99989 9.29294L15.1464 4.14642Z" fill="#141413"/>
        </svg>
        <span id="superduck-static-close-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: #FAF9F5; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Dismiss</span>
      </button>
    `;

    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 6px 6px 16px;
      background: #FAF9F5;
      border: 0.5px solid rgba(31, 30, 29, 0.30);
      border-radius: 14px;
      box-shadow: 0 40px 80px 0 rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    `;

    // Chat button
    const chatButton = container.querySelector<HTMLButtonElement>('#superduck-static-chat-button');
    const chatTooltip = container.querySelector<HTMLElement>('#superduck-static-chat-tooltip');

    if (chatButton) {
      chatButton.addEventListener('mouseenter', () => {
        chatButton.style.background = '#F0EEE6';
        if (chatTooltip) chatTooltip.style.opacity = '1';
      });

      chatButton.addEventListener('mouseleave', () => {
        chatButton.style.background = 'transparent';
        if (chatTooltip) chatTooltip.style.opacity = '0';
      });

      chatButton.addEventListener('click', async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'SWITCH_TO_MAIN_TAB' });
        } catch (e) {
          // Ignore errors
        }
      });
    }

    // Close button
    const closeButton = container.querySelector<HTMLButtonElement>(
      '#superduck-static-close-button'
    );
    const closeTooltip = container.querySelector<HTMLElement>('#superduck-static-close-tooltip');

    if (closeButton) {
      closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = '#F0EEE6';
        if (closeTooltip) closeTooltip.style.opacity = '1';
      });

      closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = 'transparent';
        if (closeTooltip) closeTooltip.style.opacity = '0';
      });

      closeButton.addEventListener('click', async () => {
        try {
          await chrome.runtime.sendMessage({
            type: 'DISMISS_STATIC_INDICATOR_FOR_GROUP'
          });
        } catch (e) {
          // Ignore errors
        }
      });
    }

    return container;
  }

  // ============================================
  // Show/Hide Functions
  // ============================================

  /**
   * Show agent indicators (glow border and stop button)
   */
  async function showAgentIndicators(): Promise<void> {
    isAgentActive = true;

    const i18nPromise = loadI18n();

    const overlay = getOverlayContainer();

    // Wire cursor renderer to overlay container inside shadow DOM
    safeCursor((r) => r.setAttachRoot(overlay));

    const showInterruptive = !isHiddenForToolUse;
    const interruptiveDisplay = showInterruptive ? '' : 'none';

    // Create/show glow border (inside shadow DOM)
    if (glowBorderEl) {
      glowBorderEl.style.display = interruptiveDisplay;
    } else {
      glowBorderEl = createGlowBorder();
      glowBorderEl.style.display = interruptiveDisplay;
      overlay.appendChild(glowBorderEl);
    }

    // Create/show water ripple (inside shadow DOM)
    if (waterRippleContainerEl) {
      waterRippleContainerEl.style.display = interruptiveDisplay;
    } else {
      waterRippleContainerEl = createWaterRipple();
      waterRippleContainerEl.style.display = interruptiveDisplay;
      overlay.appendChild(waterRippleContainerEl);
    }

    // Create/show blocking overlay (stays in host DOM for event interception)
    if (blockingOverlayEl) {
      blockingOverlayEl.style.display = interruptiveDisplay;
    } else {
      blockingOverlayEl = createBlockingOverlay();
      blockingOverlayEl.style.display = interruptiveDisplay;
      getDocumentMountRoot().appendChild(blockingOverlayEl);
    }

    if (!showInterruptive) pauseToolUseDecorAnimations();

    // Animate the always-visible elements in immediately, before i18n.
    if (showInterruptive) {
      requestAnimationFrame(() => {
        if (glowBorderEl) glowBorderEl.style.opacity = '1';
        if (waterRippleContainerEl) waterRippleContainerEl.style.opacity = '1';
        if (blockingOverlayEl) blockingOverlayEl.style.opacity = '1';
      });
    }

    safeCursor((r) => r.showIdle());

    await i18nPromise;

    if (!isAgentActive) return;

    if (isMcpEnabled) {
      console.log('[Agent Indicator] Creating/showing stop button');
      if (!stopContainerEl) {
        stopContainerEl = createStopContainer();
        overlay.appendChild(stopContainerEl);
      } else if (!stopContainerEl.parentNode) {
        overlay.appendChild(stopContainerEl);
      }
      if (!isHiddenForToolUse) {
        stopContainerEl!.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(() => {
          if (stopContainerEl) {
            stopContainerEl.style.opacity = '1';
            stopContainerEl.style.transform = 'translateX(-50%) translateY(0)';
          }
        });
      } else {
        stopContainerEl!.style.display = 'none';
      }
    } else {
      console.log('[Agent Indicator] NOT creating stop button because isMcpEnabled is false');
    }

    if (isHiddenForToolUse) hideInterruptiveIndicatorsForToolUse();
  }

  /**
   * Hide agent indicators
   */
  function hideAgentIndicators(): void {
    if (!isAgentActive) return;

    isAgentActive = false;

    // Animate out
    if (glowBorderEl) {
      glowBorderEl.style.opacity = '0';
    }
    if (waterRippleContainerEl) {
      waterRippleContainerEl.style.opacity = '0';
    }
    if (blockingOverlayEl) {
      blockingOverlayEl.style.opacity = '0';
    }

    if (stopContainerEl) {
      stopContainerEl.style.opacity = '0';
      stopContainerEl.style.transform = 'translateX(-50%) translateY(100px)';
    }

    // Remove after animation
    setTimeout(() => {
      if (!isAgentActive) {
        if (glowBorderEl && glowBorderEl.parentNode) {
          glowBorderEl.parentNode.removeChild(glowBorderEl);
          glowBorderEl = null;
        }
        if (waterRippleContainerEl && waterRippleContainerEl.parentNode) {
          if (waterRippleAnimationId) {
            cancelAnimationFrame(waterRippleAnimationId);
            waterRippleAnimationId = null;
          }
          if (waterRippleResizeHandler) {
            window.removeEventListener('resize', waterRippleResizeHandler);
            waterRippleResizeHandler = null;
          }
          waterRippleAnimateFunc = null;
          waterRippleContainerEl.parentNode.removeChild(waterRippleContainerEl);
          waterRippleContainerEl = null;
        }
        if (blockingOverlayEl) {
          if (blockingOverlayEl.parentNode) {
            blockingOverlayEl.parentNode.removeChild(blockingOverlayEl);
          }
          blockingOverlayEl = null;
        }
        if (stopContainerEl && stopContainerEl.parentNode) {
          if (ellipsisInterval) {
            clearInterval(ellipsisInterval);
            ellipsisInterval = null;
          }
          if (stopContainerAnimFrame) {
            cancelAnimationFrame(stopContainerAnimFrame);
            stopContainerAnimFrame = null;
          }
          stopContainerAnimateFunc = null;
          stopContainerEl.parentNode.removeChild(stopContainerEl);
          stopContainerEl = null;
        }
        safeCursor((r) => r.hide());
        // Remove shadow host after all children are cleaned up
        if (shadowHostEl && shadowHostEl.parentNode) {
          shadowHostEl.parentNode.removeChild(shadowHostEl);
        }
        shadowHostEl = null;
        shadowRoot = null;
        shadowOverlayEl = null;
      }
    }, 300);
  }

  /**
   * Show static indicator
   */
  function showStaticIndicator(): void {
    isStaticIndicatorActive = true;

    if (staticIndicatorEl) {
      if (!staticIndicatorEl.parentNode) {
        getDocumentMountRoot().appendChild(staticIndicatorEl);
      }
      staticIndicatorEl.style.display = '';
    } else {
      staticIndicatorEl = createStaticIndicator();
      getDocumentMountRoot().appendChild(staticIndicatorEl);
    }

    // Clear existing heartbeat and start new one
    if (staticIndicatorHeartbeatInterval) {
      clearInterval(staticIndicatorHeartbeatInterval);
      staticIndicatorHeartbeatInterval = null;
    }

    staticIndicatorHeartbeatInterval = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'STATIC_INDICATOR_HEARTBEAT'
        });
        if (!response?.success) {
          hideStaticIndicator();
        }
      } catch (e) {
        hideStaticIndicator();
      }
    }, 5000);
  }

  function pauseToolUseDecorAnimations(): void {
    if (waterRippleAnimationId) {
      cancelAnimationFrame(waterRippleAnimationId);
      waterRippleAnimationId = null;
    }
    if (stopContainerAnimFrame) {
      cancelAnimationFrame(stopContainerAnimFrame);
      stopContainerAnimFrame = null;
    }
    if (ellipsisInterval) {
      clearInterval(ellipsisInterval);
      ellipsisInterval = null;
    }
  }

  /** Hide glow/ripple/stop/blocking/static for screenshots; keep proxy cursor in DOM. */
  function hideInterruptiveIndicatorsForToolUse(): void {
    pauseToolUseDecorAnimations();

    if (glowBorderEl) glowBorderEl.style.display = 'none';
    if (waterRippleContainerEl) waterRippleContainerEl.style.display = 'none';
    if (stopContainerEl) stopContainerEl.style.display = 'none';
    if (blockingOverlayEl) blockingOverlayEl.style.display = 'none';
    if (staticIndicatorEl?.parentNode && isStaticIndicatorActive)
      staticIndicatorEl.parentNode.removeChild(staticIndicatorEl);
  }

  function restoreInterruptiveIndicatorsAfterToolUse(): void {
    if (glowBorderEl) {
      glowBorderEl.style.display = '';
      glowBorderEl.style.opacity = '1';
    }
    if (waterRippleContainerEl) {
      waterRippleContainerEl.style.display = '';
      waterRippleContainerEl.style.opacity = '1';
    }
    if (isMcpEnabled && stopContainerEl) {
      stopContainerEl.style.setProperty('display', 'flex', 'important');
      stopContainerEl.style.opacity = '1';
      stopContainerEl.style.transform = 'translateX(-50%) translateY(0)';
    }

    if (blockingOverlayEl) {
      blockingOverlayEl.style.display = '';
      blockingOverlayEl.style.opacity = '1';
      if (!blockingOverlayEl.parentNode) getDocumentMountRoot().appendChild(blockingOverlayEl);
    }

    if (waterRippleContainerEl && !waterRippleAnimationId && waterRippleAnimateFunc) {
      waterRippleAnimationId = requestAnimationFrame(waterRippleAnimateFunc);
    }
    if (stopContainerEl && !stopContainerAnimFrame && stopContainerAnimateFunc) {
      stopContainerAnimFrame = requestAnimationFrame(stopContainerAnimateFunc);
    }
    if (stopContainerEl && !ellipsisInterval) {
      const dotsEl = stopContainerEl.querySelector('span:last-of-type');
      if (dotsEl) {
        let dotCount = 1;
        ellipsisInterval = setInterval(() => {
          dotCount = (dotCount % 3) + 1;
          dotsEl.textContent = '.'.repeat(dotCount);
        }, 500);
      }
    }
  }

  /**
   * Hide static indicator
   */
  function hideStaticIndicator(): void {
    if (!isStaticIndicatorActive) return;

    isStaticIndicatorActive = false;

    if (staticIndicatorHeartbeatInterval) {
      clearInterval(staticIndicatorHeartbeatInterval);
      staticIndicatorHeartbeatInterval = null;
    }

    if (staticIndicatorEl && staticIndicatorEl.parentNode) {
      staticIndicatorEl.parentNode.removeChild(staticIndicatorEl);
      staticIndicatorEl = null;
    }
  }

  // ============================================
  // Message Types
  // ============================================

  interface RuntimeMessage {
    type:
      | 'SHOW_AGENT_INDICATORS'
      | 'HIDE_AGENT_INDICATORS'
      | 'HIDE_FOR_TOOL_USE'
      | 'SHOW_AFTER_TOOL_USE'
      | 'SHOW_STATIC_INDICATOR'
      | 'HIDE_STATIC_INDICATOR'
      | 'STATIC_INDICATOR_HEARTBEAT'
      | 'STOP_AGENT'
      | 'SWITCH_TO_MAIN_TAB'
      | 'DISMISS_STATIC_INDICATOR_FOR_GROUP'
      | 'ANIMATE_CURSOR_TO'
      | 'CONTENT_PING';
    isMcp?: boolean;
    fromTabId?: string;
    x?: number;
    y?: number;
    action?: string;
  }

  interface MessageResponse {
    success: boolean;
  }

  // ============================================
  // Message Handler
  // ============================================

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender, sendResponse: (response: MessageResponse) => void) => {
      (async () => {
        switch (message.type) {
          case 'SHOW_AGENT_INDICATORS':
            isMcpEnabled = isMcpEnabled || message.isMcp === true;
            await showAgentIndicators();
            sendResponse({ success: true });
            break;

          case 'HIDE_AGENT_INDICATORS':
            hideAgentIndicators();
            sendResponse({ success: true });
            break;

          case 'HIDE_FOR_TOOL_USE': {
            isHiddenForToolUse = isAgentActive;
            wasStaticActiveBeforeToolUse = isStaticIndicatorActive;

            if (isAgentActive) hideInterruptiveIndicatorsForToolUse();
            else if (isStaticIndicatorActive && staticIndicatorEl?.parentNode)
              staticIndicatorEl.parentNode.removeChild(staticIndicatorEl);

            const respondOnce = (() => {
              let hasResponded = false;
              return () => {
                if (hasResponded) return;
                hasResponded = true;
                sendResponse({ success: true });
              };
            })();

            // For background tabs, rAF may be heavily throttled or paused.
            // Return immediately to avoid blocking tool calls on non-active tabs.
            if (document.visibilityState !== 'visible') {
              respondOnce();
              break;
            }

            // For visible tabs, wait for compositor commit to keep screenshots clean.
            void getDocumentMountRoot().offsetWidth;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                setTimeout(respondOnce, 50);
              });
            });
            // Fallback in case tab visibility changes during the rAF chain.
            setTimeout(respondOnce, 200);
            break;
          }

          case 'SHOW_AFTER_TOOL_USE':
            if (isHiddenForToolUse && isAgentActive) {
              restoreInterruptiveIndicatorsAfterToolUse();
            }
            if (
              wasStaticActiveBeforeToolUse &&
              staticIndicatorEl &&
              !staticIndicatorEl.parentNode
            ) {
              getDocumentMountRoot().appendChild(staticIndicatorEl);
            }

            isHiddenForToolUse = false;
            wasStaticActiveBeforeToolUse = false;

            sendResponse({ success: true });
            break;

          case 'SHOW_STATIC_INDICATOR':
            showStaticIndicator();
            sendResponse({ success: true });
            break;

          case 'HIDE_STATIC_INDICATOR':
            hideStaticIndicator();
            sendResponse({ success: true });
            break;

          case 'ANIMATE_CURSOR_TO':
            if (!isAgentActive || !cursorRenderer) {
              sendResponse({ success: false });
              break;
            }
            try {
              cursorRenderer
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
    }
  );

  // ============================================
  // Cleanup on Page Unload
  // ============================================

  window.addEventListener('beforeunload', () => {
    hideAgentIndicators();
    hideStaticIndicator();
  });

  // ============================================
  // State Recovery Mechanism
  // ============================================

  /**
   * Periodically check and recover button state if inconsistent
   * This helps recover from CDP-related state issues
   */
  setInterval(() => {
    // Don't recover if intentionally hidden for tool use (e.g., screenshot)
    if (isHiddenForToolUse) return;
    if (!isAgentActive) return;

    // Recover shadow host if detached
    if (shadowHostEl && !shadowHostEl.parentNode) {
      console.warn('[SuperDuck Agent] Recovering detached shadow host');
      getDocumentMountRoot().appendChild(shadowHostEl);
    }
    // Blocking overlay lives in host DOM
    if (blockingOverlayEl && !blockingOverlayEl.parentNode) {
      console.warn('[SuperDuck Agent] Recovering detached blocking overlay');
      getDocumentMountRoot().appendChild(blockingOverlayEl);
    }
    safeCursor((r) => r.reattachToDOM());
  }, 2000); // Check every 2 seconds
})();
