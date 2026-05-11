(function () {
  // I18n support
  const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;
  const DEFAULT_LOCALE = 'en-US';
  const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

  function normalizeLocale(locale: string): string {
    if (SUPPORTED_LOCALE_SET.has(locale)) {
      return locale;
    }
    const language = locale.split('-')[0];
    const matched = SUPPORTED_LOCALES.find(l => l.startsWith(`${language}-`));
    return matched || DEFAULT_LOCALE;
  }

  let i18nMessages: Record<string, string> = {};
  let i18nLoaded = false;

  async function loadI18n(): Promise<void> {
    if (i18nLoaded) return;
    try {
      const stored = await chrome.storage.local.get('preferred_locale');
      const rawLocale: string =
        (stored.preferred_locale as string) || navigator.language || DEFAULT_LOCALE;
      const locale = normalizeLocale(rawLocale);
      const response = await fetch(chrome.runtime.getURL(`i18n/${locale}.json`));
      if (response.ok) {
        i18nMessages = await response.json();
      }
    } catch (e) {
      // Fallback to empty messages
    }
    i18nLoaded = true;
  }

  function t(key: string, fallback: string = ''): string {
    return i18nMessages[key] || fallback;
  }

  // State variables
  let glowBorderEl: HTMLElement | null = null;
  let waterRippleContainerEl: HTMLElement | null = null;
  let waterRippleAnimationId: number | null = null;
  let waterRippleResizeHandler: (() => void) | null = null;
  let waterRippleAnimateFunc: (() => void) | null = null;
  let blockingOverlayEl: HTMLElement | null = null;
  let stopContainerEl: HTMLElement | null = null;
  let staticIndicatorEl: HTMLElement | null = null;
  let isAgentActive = false;
  let isStaticIndicatorActive = false;
  let isHiddenForToolUse = false;
  let wasStaticActiveBeforeToolUse = false;
  let staticIndicatorHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let ellipsisInterval: ReturnType<typeof setInterval> | null = null;
  let isMcpEnabled = false;

  // ============================================
  // Styles
  // ============================================

  function injectAnimationStyles(): void {
    if (document.getElementById("superduck-agent-animation-styles")) return;

    const styleEl = document.createElement("style");
    styleEl.id = "superduck-agent-animation-styles";
    styleEl.textContent = `
      @keyframes superduck-glass-breathe {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
      @keyframes superduck-glow-breathe {
        0%, 100% { opacity: 0.25; }
        50% { opacity: 1; }
      }

    `;
    document.head.appendChild(styleEl);
  }

  // ============================================
  // Agent Glow Border
  // ============================================

  function createGlowBorder(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.id = "superduck-agent-glow-border";
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
    const glowTop = document.createElement("div");
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
    const glowLeft = document.createElement("div");
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
    const glowRight = document.createElement("div");
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
    const glassBorder = document.createElement("div");
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
    const container = document.createElement("div");
    container.id = "superduck-water-ripple-container";
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

    const canvas = document.createElement("canvas");
    canvas.id = "superduck-water-ripple-canvas";
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
      [250, 195, 110],
    ];

    const waves: WaveConfig[] = colors.map(([r, g, b], i) => ({
      r,
      g,
      b,
      alpha: (0.343 - i * 0.039),
      depth: i,
      offset: 100 + Math.random() * 100,
      t: 0,
    }));

    function resizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    }

    waterRippleResizeHandler = resizeCanvas;

    function drawWave(ctx: CanvasRenderingContext2D, w: WaveConfig, width: number, height: number) {
      ctx.fillStyle = `rgba(${w.r}, ${w.g}, ${w.b}, ${w.alpha})`;
      ctx.beginPath();

      const step = 25;
      let started = false;
      for (let x = 0; x <= width + step; x += step) {
        const xoff = x / width * 3;
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
      const ctx = canvas.getContext("2d");
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

    window.addEventListener("resize", resizeCanvas);

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
    const overlay = document.createElement("div");
    overlay.id = "superduck-agent-blocking-overlay";
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
      "click", "dblclick", "auxclick", "contextmenu",
      "mousedown", "mouseup",
      "pointerdown", "pointerup",
      "touchstart", "touchend", "touchmove",
      "keydown", "keyup", "keypress",
      "wheel",
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
    const container = document.createElement("div");
    container.id = "superduck-agent-stop-container";

    // ========== Parent: flex row, space-between ==========
    container.style.cssText = `
      position: fixed;
      bottom: 116px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
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
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-top-color: rgba(255, 255, 255, 0.8);
      border-left-color: rgba(255, 255, 255, 0.65);
      border-radius: 40px;
      box-shadow:
        0 12px 40px rgba(0, 0, 0, 0.06),
        0 2px 6px rgba(0, 0, 0, 0.03),
        inset 0 1px 1px rgba(255, 255, 255, 0.9),
        inset 0 -1px 2px rgba(0, 0, 0, 0.03);
      pointer-events: auto;
      z-index: 2147483647;
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      user-select: none;
      white-space: nowrap;
    `;

    const defaultBoxShadow = `
      0 12px 40px rgba(0, 0, 0, 0.06),
      0 2px 6px rgba(0, 0, 0, 0.03),
      inset 0 1px 1px rgba(255, 255, 255, 0.9),
      inset 0 -1px 2px rgba(0, 0, 0, 0.03)
    `;
    const hoverBoxShadow = `
      0 0 12px rgba(230, 160, 90, 0.5),
      0 0 28px rgba(230, 140, 85, 0.3),
      0 0 48px rgba(255, 180, 120, 0.2),
      0 12px 40px rgba(0, 0, 0, 0.06),
      inset 0 1px 1px rgba(255, 255, 255, 0.9),
      inset 0 -1px 2px rgba(0, 0, 0, 0.03)
    `;

    container.addEventListener("mouseenter", () => {
      container.style.boxShadow = hoverBoxShadow;
      container.style.borderColor = "rgba(230, 160, 90, 0.4)";
    });

    container.addEventListener("mouseleave", () => {
      container.style.boxShadow = defaultBoxShadow;
      container.style.borderColor = "rgba(255, 255, 255, 0.55)";
    });

    // ========== Child A (left group): emoji + text + dots ==========
    const leftGroup = document.createElement("div");
    leftGroup.style.cssText = `
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
      gap: 6px !important;
      flex-shrink: 0 !important;
      white-space: nowrap !important;
    `;

    const duckMessages = [
      t('agent_status_working', '鸭鸭正在努力操作中'),
      t('agent_status_helping', '嘎嘎嘎～鸭鸭正在帮你干活'),
      t('agent_status_rushing', '超级鸭鸭冲冲冲'),
      t('agent_status_busy', '鸭鸭正在认真搞事情'),
      t('agent_status_outputting', '鸭鸭正在疯狂输出'),
      t('agent_status_takeover', '嘎！鸭鸭接管了浏览器'),
      t('agent_status_full_power', '鸭力全开中'),
      t('agent_status_showing_off', '超级鸭正在大展身手'),
      t('agent_status_dont_move', '别动！鸭鸭在忙'),
      t('agent_status_working_duck', '鸭鸭化身打工鸭'),
      t('agent_status_managed', '当前页面由鸭鸭托管中'),
      t('agent_status_online', '嘎嘎特工已上线'),
    ];

    const emojiEl = document.createElement("span");
    emojiEl.textContent = "🦆";
    emojiEl.style.cssText = `font-size: 16px; line-height: 1; flex-shrink: 0;`;

    const statusText = document.createElement("span");
    statusText.textContent = duckMessages[Math.floor(Math.random() * duckMessages.length)];
    statusText.style.cssText = `
      color: #1a1a1a;
      font-size: 13px;
      font-weight: 500;
      flex-shrink: 0;
    `;

    // Animated dots: fixed-width container to prevent layout shift
    const dotsEl = document.createElement("span");
    dotsEl.style.cssText = `
      display: inline-block;
      width: 1.5em;
      text-align: left;
      color: #1a1a1a;
      font-size: 13px;
      font-weight: 500;
      flex-shrink: 0;
    `;
    dotsEl.textContent = ".";

    let dotCount = 1;
    ellipsisInterval = setInterval(() => {
      dotCount = (dotCount % 3) + 1;
      dotsEl.textContent = ".".repeat(dotCount);
    }, 500);

    leftGroup.appendChild(emojiEl);
    leftGroup.appendChild(statusText);
    leftGroup.appendChild(dotsEl);

    // ========== Child B (right group): button ==========
    const takeOverBtn = document.createElement("button");
    takeOverBtn.id = "superduck-agent-stop-button";
    takeOverBtn.textContent = t('agent_take_over_button', '我来接手');
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

    takeOverBtn.addEventListener("mouseenter", () => {
      takeOverBtn.style.background = "#3a3a3a";
      takeOverBtn.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
    });

    takeOverBtn.addEventListener("mouseleave", () => {
      takeOverBtn.style.background = "#2c2c2c";
      takeOverBtn.style.boxShadow = "none";
    });

    takeOverBtn.addEventListener("click", async () => {
      try {
        takeOverBtn.style.pointerEvents = "none";
        takeOverBtn.style.opacity = "0.5";

        await chrome.runtime.sendMessage({
          type: "STOP_AGENT",
          fromTabId: "CURRENT_TAB",
        });

        setTimeout(() => {
          takeOverBtn.style.pointerEvents = "auto";
          takeOverBtn.style.opacity = "1";
        }, 1000);
      } catch (error) {
        console.error("Failed to stop agent:", error);
        takeOverBtn.style.pointerEvents = "auto";
        takeOverBtn.style.opacity = "1";
      }
    });

    // Two children only: leftGroup + takeOverBtn
    container.appendChild(leftGroup);
    container.appendChild(takeOverBtn);
    return container;
  }

  // ============================================
  // Static Indicator
  // ============================================

  function createStaticIndicator(): HTMLElement {
    const container = document.createElement("div");
    container.id = "superduck-static-indicator-container";
    container.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; flex-shrink: 0; margin-right: 8px;">
        <path d="M3.13946 10.6399L6.28757 8.87462L6.37405 8.73821L6.28757 8.6339H6.13189L5.60432 8.6018L3.80541 8.55366L2.24865 8.48947L0.735135 8.40923H0.492973L0.354595 8.32899L0.181622 8.1685L0.0345946 8.01605L0 7.85557L0.0345946 7.62287L0.138378 7.44634L0.224865 7.40622H0.354595L0.812973 7.44634L1.82486 7.51856L3.34703 7.62287L4.44541 7.68706L6.08 7.85557H6.33946L6.37405 7.75125L6.28757 7.68706L6.21838 7.62287L4.64432 6.55567L2.94054 5.4323L2.04973 4.78235L1.57405 4.45336L1.33189 4.14845L1.22811 3.92377L1.17622 3.69107L1.22811 3.47442L1.33189 3.28185L1.46162 3.13741L1.66054 2.99298H1.87676L2.24865 3.0331L2.39568 3.07322L2.99243 3.53059L4.26378 4.51755L5.92432 5.73721L6.16649 5.93781H6.27892V5.82548L6.16649 5.64092L5.26703 4.01204L4.30703 2.35105L3.87459 1.66098L3.76216 1.25176C3.7391 1.16082 3.69297 0.977332 3.69297 0.970913V0.762287L3.77946 0.505517L3.93513 0.240722L4.18595 0.0882648L4.4627 0H4.67892L4.83459 0.0240722L5.12865 0.0882648L5.4054 0.328987L5.82054 1.27583L6.48649 2.76028L7.52432 4.78235L7.82703 5.38415L7.99135 5.93781L8.05189 6.10632H8.15567V6.01003L8.24216 4.87061L8.39784 3.47442L8.55351 1.67703L8.6054 1.17151L8.85622 0.561685L8.9773 0.417252L9.21946 0.232698H9.35784L9.74703 0.417252L9.97189 0.665998L10.067 0.874624L10.0238 1.17151L9.83351 2.40722L9.46162 4.34102L9.21946 5.64092H9.35784L9.52216 5.47242L10.1795 4.60582L11.2778 3.22568L11.7622 2.68004L12.333 2.07823L12.6962 1.78937L13.0162 1.67703L13.3881 1.78937L13.7168 2.06219L13.8897 2.54363V2.76028L13.6649 3.32197L12.9557 4.22066L12.3676 4.98295L12.0043 5.56871L11.0011 7.02106V7.08526H11.1741L13.0768 6.67603L14.1059 6.49147L15.3341 6.28285L15.5762 6.34704L15.8876 6.53962L15.9481 6.80441L15.8876 7.12538L15.7319 7.34203L14.4173 7.66299L12.8778 7.97593L10.5854 8.51559C10.5705 8.51909 10.56 8.53236 10.56 8.54764C10.56 8.56468 10.573 8.57891 10.59 8.58044L11.6238 8.67402L12.0649 8.69809H13.1459L15.1611 8.85055L15.6886 9.19559L15.9481 9.39619L16 9.62086L15.9481 9.94985L15.8443 10.1023L15.4119 10.3029L15.1351 10.3591L14.0454 10.1023L11.4941 9.49248L10.6205 9.27583H10.4995V9.34804L11.2259 10.0622L12.5665 11.2658L14.2357 12.8225L14.3222 13.0953V13.2076L14.1059 13.5125L13.9243 13.5206L13.8811 13.4804L12.4108 12.3731L12.2984 12.325L11.84 11.8756L10.56 10.7924H10.4735V10.9047L10.7676 11.338L12.333 13.6891L12.4108 14.4112L12.2984 14.6439L11.8919 14.7884L11.667 14.7563L11.4508 14.7081L11.2605 14.5396L10.5254 13.4162L9.5827 11.9719L8.82162 10.672H8.79342C8.76039 10.672 8.73278 10.6972 8.7297 10.73L8.27676 15.5667L8.06919 15.8154L7.6454 16H7.58486L7.17838 15.6951L6.96216 15.1976L7.17838 14.2106L7.43784 12.9268L7.6454 11.9077L7.83567 10.6399L7.95187 10.2164C7.9548 10.2057 7.95069 10.1944 7.94161 10.1881C7.91157 10.1672 7.87034 10.1741 7.84878 10.2037L6.89297 11.5145L5.44 13.4804L4.28973 14.7081L4.01297 14.8205H3.80541L3.5373 14.5717V14.4514L3.58054 14.1304L3.84865 13.7372L5.44 11.7151L6.4 10.4554L7.01872 9.73222C7.04511 9.70139 7.04245 9.65523 7.0127 9.62763C7.00333 9.61894 6.98925 9.61773 6.97854 9.62471L2.75027 12.3811L1.99784 12.4774L1.66919 12.1725L1.71243 11.675L1.86811 11.5145L3.13946 10.6399Z" fill="#D97757"/>
      </svg>
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
    const chatButton = container.querySelector<HTMLButtonElement>(
      "#superduck-static-chat-button",
    );
    const chatTooltip = container.querySelector<HTMLElement>(
      "#superduck-static-chat-tooltip",
    );

    if (chatButton) {
      chatButton.addEventListener("mouseenter", () => {
        chatButton.style.background = "#F0EEE6";
        if (chatTooltip) chatTooltip.style.opacity = "1";
      });

      chatButton.addEventListener("mouseleave", () => {
        chatButton.style.background = "transparent";
        if (chatTooltip) chatTooltip.style.opacity = "0";
      });

      chatButton.addEventListener("click", async () => {
        try {
          await chrome.runtime.sendMessage({ type: "SWITCH_TO_MAIN_TAB" });
        } catch (e) {
          // Ignore errors
        }
      });
    }

    // Close button
    const closeButton = container.querySelector<HTMLButtonElement>(
      "#superduck-static-close-button",
    );
    const closeTooltip = container.querySelector<HTMLElement>(
      "#superduck-static-close-tooltip",
    );

    if (closeButton) {
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "#F0EEE6";
        if (closeTooltip) closeTooltip.style.opacity = "1";
      });

      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "transparent";
        if (closeTooltip) closeTooltip.style.opacity = "0";
      });

      closeButton.addEventListener("click", async () => {
        try {
          await chrome.runtime.sendMessage({
            type: "DISMISS_STATIC_INDICATOR_FOR_GROUP",
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
    console.log('[Agent Indicator] showAgentIndicators called, isMcpEnabled:', isMcpEnabled, 'isAgentActive:', isAgentActive);

    isAgentActive = true;

    await loadI18n();

    if (!isAgentActive) return;

    // Inject animation styles
    injectAnimationStyles();

    // Create/show glow border
    if (glowBorderEl) {
      glowBorderEl.style.display = "";
    } else {
      glowBorderEl = createGlowBorder();
      document.body.appendChild(glowBorderEl);
    }

    // Create/show water ripple
    if (waterRippleContainerEl) {
      waterRippleContainerEl.style.display = "";
    } else {
      waterRippleContainerEl = createWaterRipple();
      document.body.appendChild(waterRippleContainerEl);
    }

    // Create/show blocking overlay
    if (blockingOverlayEl) {
      blockingOverlayEl.style.display = "";
    } else {
      blockingOverlayEl = createBlockingOverlay();
      document.body.appendChild(blockingOverlayEl);
    }

    // Create/show stop button (only if MCP is enabled)
    if (isMcpEnabled) {
      console.log('[Agent Indicator] Creating/showing stop button');
      if (stopContainerEl) {
        stopContainerEl.style.setProperty("display", "flex", "important");
      } else {
        stopContainerEl = createStopContainer();
        document.body.appendChild(stopContainerEl);
      }
    } else {
      console.log('[Agent Indicator] NOT creating stop button because isMcpEnabled is false');
    }

    // Animate in
    requestAnimationFrame(() => {
      if (glowBorderEl) {
        glowBorderEl.style.opacity = "1";
      }
      if (waterRippleContainerEl) {
        waterRippleContainerEl.style.opacity = "1";
      }
      if (blockingOverlayEl) {
        blockingOverlayEl.style.opacity = "1";
      }
      if (stopContainerEl) {
        stopContainerEl.style.opacity = "1";
        stopContainerEl.style.transform = "translateX(-50%) translateY(0)";
      }
    });
  }

  /**
   * Hide agent indicators
   */
  function hideAgentIndicators(): void {
    if (!isAgentActive) return;

    isAgentActive = false;

    // Animate out
    if (glowBorderEl) {
      glowBorderEl.style.opacity = "0";
    }
    if (waterRippleContainerEl) {
      waterRippleContainerEl.style.opacity = "0";
    }
    if (blockingOverlayEl) {
      blockingOverlayEl.style.opacity = "0";
    }

    if (stopContainerEl) {
      stopContainerEl.style.opacity = "0";
      stopContainerEl.style.transform = "translateX(-50%) translateY(100px)";
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
            window.removeEventListener("resize", waterRippleResizeHandler);
            waterRippleResizeHandler = null;
          }
          waterRippleAnimateFunc = null;
          waterRippleContainerEl.parentNode.removeChild(waterRippleContainerEl);
          waterRippleContainerEl = null;
        }
        if (blockingOverlayEl && blockingOverlayEl.parentNode) {
          blockingOverlayEl.parentNode.removeChild(blockingOverlayEl);
          blockingOverlayEl = null;
        }
        if (stopContainerEl && stopContainerEl.parentNode) {
          if (ellipsisInterval) {
            clearInterval(ellipsisInterval);
            ellipsisInterval = null;
          }
          stopContainerEl.parentNode.removeChild(stopContainerEl);
          stopContainerEl = null;
        }
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
        document.body.appendChild(staticIndicatorEl);
      }
      staticIndicatorEl.style.display = "";
    } else {
      staticIndicatorEl = createStaticIndicator();
      document.body.appendChild(staticIndicatorEl);
    }

    // Clear existing heartbeat and start new one
    if (staticIndicatorHeartbeatInterval) {
      clearInterval(staticIndicatorHeartbeatInterval);
      staticIndicatorHeartbeatInterval = null;
    }

    staticIndicatorHeartbeatInterval = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "STATIC_INDICATOR_HEARTBEAT",
        });
        if (!response?.success) {
          hideStaticIndicator();
        }
      } catch (e) {
        hideStaticIndicator();
      }
    }, 5000);
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
      | "SHOW_AGENT_INDICATORS"
      | "HIDE_AGENT_INDICATORS"
      | "HIDE_FOR_TOOL_USE"
      | "SHOW_AFTER_TOOL_USE"
      | "SHOW_STATIC_INDICATOR"
      | "HIDE_STATIC_INDICATOR"
      | "STATIC_INDICATOR_HEARTBEAT"
      | "STOP_AGENT"
      | "SWITCH_TO_MAIN_TAB"
      | "DISMISS_STATIC_INDICATOR_FOR_GROUP";
    isMcp?: boolean;
    fromTabId?: string;
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
          case "SHOW_AGENT_INDICATORS":
            console.log('[Agent Indicator] SHOW_AGENT_INDICATORS received, isMcp:', message.isMcp, 'current isMcpEnabled:', isMcpEnabled);
            isMcpEnabled = isMcpEnabled || message.isMcp === true;
            console.log('[Agent Indicator] After update, isMcpEnabled:', isMcpEnabled);
            await showAgentIndicators();
            sendResponse({ success: true });
            break;

        case "HIDE_AGENT_INDICATORS":
          hideAgentIndicators();
          sendResponse({ success: true });
          break;

        case "HIDE_FOR_TOOL_USE":
          isHiddenForToolUse = isAgentActive;
          wasStaticActiveBeforeToolUse = isStaticIndicatorActive;

          if (waterRippleAnimationId) {
            cancelAnimationFrame(waterRippleAnimationId);
            waterRippleAnimationId = null;
          }
          if (ellipsisInterval) {
            clearInterval(ellipsisInterval);
            ellipsisInterval = null;
          }

          // Remove elements from DOM entirely to guarantee they cannot
          // appear in any screenshot method (CDP or captureVisibleTab).
          // Element references are preserved in module variables for re-insertion.
          if (glowBorderEl?.parentNode) glowBorderEl.parentNode.removeChild(glowBorderEl);
          if (waterRippleContainerEl?.parentNode) waterRippleContainerEl.parentNode.removeChild(waterRippleContainerEl);
          if (blockingOverlayEl?.parentNode) blockingOverlayEl.parentNode.removeChild(blockingOverlayEl);
          if (stopContainerEl?.parentNode) stopContainerEl.parentNode.removeChild(stopContainerEl);
          if (staticIndicatorEl?.parentNode && isStaticIndicatorActive) staticIndicatorEl.parentNode.removeChild(staticIndicatorEl);

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
          if (document.visibilityState !== "visible") {
            respondOnce();
            break;
          }

          // For visible tabs, wait for compositor commit to keep screenshots clean.
          void document.body.offsetWidth;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(respondOnce, 50);
            });
          });
          // Fallback in case tab visibility changes during the rAF chain.
          setTimeout(respondOnce, 200);
          break;

        case "SHOW_AFTER_TOOL_USE":
          if (isHiddenForToolUse) {
            // Re-insert elements into DOM (references preserved in module variables)
            if (glowBorderEl && !glowBorderEl.parentNode) document.body.appendChild(glowBorderEl);
            if (waterRippleContainerEl && !waterRippleContainerEl.parentNode) document.body.appendChild(waterRippleContainerEl);
            if (blockingOverlayEl && !blockingOverlayEl.parentNode) document.body.appendChild(blockingOverlayEl);
            if (stopContainerEl && !stopContainerEl.parentNode) document.body.appendChild(stopContainerEl);

            if (waterRippleContainerEl && !waterRippleAnimationId && waterRippleAnimateFunc) {
              waterRippleAnimationId = requestAnimationFrame(waterRippleAnimateFunc);
            }
            if (stopContainerEl && !ellipsisInterval) {
              const dotsEl = stopContainerEl.querySelector("span:last-of-type");
              if (dotsEl) {
                let dotCount = 1;
                ellipsisInterval = setInterval(() => {
                  dotCount = (dotCount % 3) + 1;
                  dotsEl.textContent = ".".repeat(dotCount);
                }, 500);
              }
            }
          }
          if (wasStaticActiveBeforeToolUse && staticIndicatorEl && !staticIndicatorEl.parentNode) {
            document.body.appendChild(staticIndicatorEl);
          }

          isHiddenForToolUse = false;
          wasStaticActiveBeforeToolUse = false;

          sendResponse({ success: true });
          break;

        case "SHOW_STATIC_INDICATOR":
          showStaticIndicator();
          sendResponse({ success: true });
          break;

        case "HIDE_STATIC_INDICATOR":
          hideStaticIndicator();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false });
          break;
      }
      })();

      return true;
    },
  );

  // ============================================
  // Cleanup on Page Unload
  // ============================================

  window.addEventListener("beforeunload", () => {
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

    // Recover elements that got detached from DOM
    if (stopContainerEl && !stopContainerEl.parentNode) {
      console.warn("[SuperDuck Agent] Recovering detached stop button");
      document.body.appendChild(stopContainerEl);
    }
    if (glowBorderEl && !glowBorderEl.parentNode) {
      console.warn("[SuperDuck Agent] Recovering detached glow border");
      document.body.appendChild(glowBorderEl);
    }
    if (waterRippleContainerEl && !waterRippleContainerEl.parentNode) {
      console.warn("[SuperDuck Agent] Recovering detached water ripple");
      document.body.appendChild(waterRippleContainerEl);
    }
    if (blockingOverlayEl && !blockingOverlayEl.parentNode) {
      console.warn("[SuperDuck Agent] Recovering detached blocking overlay");
      document.body.appendChild(blockingOverlayEl);
    }
  }, 2000); // Check every 2 seconds
})();
