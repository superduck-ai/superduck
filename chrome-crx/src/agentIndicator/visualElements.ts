import { BLOCKING_OVERLAY_ID } from './constants';

export function createGlowBorder(): HTMLElement {
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

export function createBlockingOverlay(): HTMLElement {
  // Full-screen transparent mask for real user input. CDP mouse events still
  // hit-test page DOM, so tool execution must hide this overlay before input.
  const overlay = document.createElement('div');
  overlay.id = BLOCKING_OVERLAY_ID;
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

export function createStaticIndicator(): HTMLElement {
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

  const closeButton = container.querySelector<HTMLButtonElement>('#superduck-static-close-button');
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
