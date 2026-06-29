import type { I18nManager } from './i18n';

export interface StopContainerHandle {
  container: HTMLElement;
  start: () => void;
  pause: () => void;
  restart: () => void;
  stop: () => void;
}

export function createStopContainer(i18n: I18nManager): StopContainerHandle {
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const getBorderColor = () => (darkMq.matches ? '#ffffff1a' : '#0000001a');

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

  let animFrame: number | null = null;
  let animateFunc: ((now: number) => void) | null = null;
  let ellipsisTimer: ReturnType<typeof setInterval> | null = null;
  let dotCount = 1;

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
    animFrame = requestAnimationFrame(springTick);
  }

  animateFunc = (now: number) => {
    lastFrameTime = now;
    springTick(now);
  };

  ringClip.appendChild(beamLayer);

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
  statusText.textContent = i18n.getRandomStatus();
  statusText.style.cssText = `
    color: #1a1a1a;
    font-size: 13px;
    font-weight: 500;
    flex-shrink: 0;
  `;

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

  function startEllipsis() {
    dotCount = 1;
    ellipsisTimer = setInterval(() => {
      dotCount = (dotCount % 3) + 1;
      dotsEl.textContent = '.'.repeat(dotCount);
    }, 500);
  }

  leftGroup.appendChild(emojiEl);
  leftGroup.appendChild(statusText);
  leftGroup.appendChild(dotsEl);

  const takeOverBtn = document.createElement('button');
  takeOverBtn.id = 'superduck-agent-stop-button';
  takeOverBtn.dataset.superduckI18n = 'take-over';
  takeOverBtn.textContent = i18n.t('agent_take_over_button');
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

  container.appendChild(leftGroup);
  container.appendChild(takeOverBtn);
  wrapper.appendChild(ringClip);
  wrapper.appendChild(container);

  function start() {
    animFrame = requestAnimationFrame(springTick);
    startEllipsis();
  }

  function pause() {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    if (ellipsisTimer) {
      clearInterval(ellipsisTimer);
      ellipsisTimer = null;
    }
  }

  function restart() {
    if (!animFrame && animateFunc) {
      animFrame = requestAnimationFrame(animateFunc);
    }
    if (!ellipsisTimer) {
      startEllipsis();
    }
  }

  function stop() {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    if (ellipsisTimer) {
      clearInterval(ellipsisTimer);
      ellipsisTimer = null;
    }
    animateFunc = null;
  }

  return { container: wrapper, start, pause, restart, stop };
}
