import { tabGroupManager } from '../tabState';
import { KEY_DEFINITIONS, MAC_KEYBOARD_COMMANDS } from './keyboard';
import type {
  ClickOptions,
  DispatchMouseEventParams,
  KeyEventParams,
  KeyDefinition,
  MouseEventParams,
  SendCommand
} from './types';

export interface CdpInputDeps {
  sendCommand: SendCommand;
  isMac: boolean;
}

export function getKeyCode(key: string): KeyDefinition | undefined {
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

export function requiresShift(char: string): boolean {
  return '~!@#$%^&*()_+{}|:"<>?'.includes(char) || (char >= 'A' && char <= 'Z');
}

export function createCdpInput(deps: CdpInputDeps) {
  const { sendCommand, isMac } = deps;

  async function hidePointerBlockingOverlaysForToolUse(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const overlay = document.getElementById('superduck-agent-blocking-overlay');
          if (!(overlay instanceof HTMLElement)) return;

          if (overlay.dataset.superduckToolHidden !== 'true') {
            overlay.dataset.superduckToolHidden = 'true';
            overlay.dataset.superduckPreviousDisplay = overlay.style.display;
            overlay.dataset.superduckPreviousVisibility = overlay.style.visibility;
            overlay.dataset.superduckPreviousPointerEvents = overlay.style.pointerEvents;
          }

          overlay.style.display = 'none';
          overlay.style.visibility = 'hidden';
          overlay.style.pointerEvents = 'none';
        }
      });
    } catch {
      // Best-effort only. The normal indicator message path still runs.
    }
  }

  async function restorePointerBlockingOverlaysAfterToolUse(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          const overlay = document.getElementById('superduck-agent-blocking-overlay');
          if (!(overlay instanceof HTMLElement)) return;
          if (overlay.dataset.superduckToolHidden !== 'true') return;

          overlay.style.display = overlay.dataset.superduckPreviousDisplay ?? '';
          overlay.style.visibility = overlay.dataset.superduckPreviousVisibility ?? '';
          overlay.style.pointerEvents = overlay.dataset.superduckPreviousPointerEvents ?? '';

          delete overlay.dataset.superduckToolHidden;
          delete overlay.dataset.superduckPreviousDisplay;
          delete overlay.dataset.superduckPreviousVisibility;
          delete overlay.dataset.superduckPreviousPointerEvents;
        }
      });
    } catch {
      // The tab may have navigated as a result of the tool action.
    }
  }

  async function dispatchMouseEvent(tabId: number, eventParams: MouseEventParams): Promise<void> {
    const params: DispatchMouseEventParams = {
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

    await sendCommand(tabId, 'Input.dispatchMouseEvent', params);
  }

  async function dispatchKeyEvent(tabId: number, eventParams: KeyEventParams): Promise<void> {
    const params = { modifiers: 0, ...eventParams };
    await sendCommand(tabId, 'Input.dispatchKeyEvent', params);
  }

  async function insertText(tabId: number, text: string): Promise<void> {
    await sendCommand(tabId, 'Input.insertText', { text });
  }

  async function click(
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
      await hidePointerBlockingOverlaysForToolUse(tabId);
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

      await dispatchMouseEvent(tabId, {
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
        await dispatchMouseEvent(tabId, {
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

        await dispatchMouseEvent(tabId, {
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
        await restorePointerBlockingOverlaysAfterToolUse(tabId);
        await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
      }
    }
  }

  async function type(tabId: number, text: string): Promise<void> {
    for (const char of text) {
      let key = char;
      if (char === '\n' || char === '\r') {
        key = 'Enter';
      }
      const keyCode = getKeyCode(key);
      if (keyCode) {
        const modifiers = requiresShift(char) ? 8 : 0;
        await pressKey(tabId, keyCode, modifiers);
      } else {
        await insertText(tabId, char);
      }
    }
  }

  async function keyDown(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await dispatchKeyEvent(tabId, {
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

  async function keyUp(tabId: number, keyDef: KeyDefinition, modifiers: number = 0): Promise<void> {
    await dispatchKeyEvent(tabId, {
      type: 'keyUp',
      key: keyDef.key,
      modifiers,
      windowsVirtualKeyCode: keyDef.windowsVirtualKeyCode || keyDef.keyCode,
      code: keyDef.code,
      location: keyDef.location ?? 0
    });
  }

  async function pressKey(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await keyDown(tabId, keyDef, modifiers, commands);
    await keyUp(tabId, keyDef, modifiers);
  }

  async function pressKeyChord(tabId: number, chord: string): Promise<void> {
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
    if (isMac) {
      const macCommand = MAC_KEYBOARD_COMMANDS[chord.toLowerCase()];
      if (macCommand && Array.isArray(macCommand)) {
        commands.push(...macCommand);
      } else if (macCommand) {
        commands.push(macCommand as string);
      }
    }

    if (mainKey) {
      const keyCode = getKeyCode(mainKey);
      if (!keyCode) throw new Error(`Unknown key: ${chord}`);
      await pressKey(tabId, keyCode, modifiersBitmask, commands);
    }
  }

  async function scrollWheel(
    tabId: number,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    await dispatchMouseEvent(tabId, {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY
    });
  }

  return {
    dispatchMouseEvent,
    dispatchKeyEvent,
    hidePointerBlockingOverlaysForToolUse,
    restorePointerBlockingOverlaysAfterToolUse,
    insertText,
    click,
    type,
    keyDown,
    keyUp,
    pressKey,
    pressKeyChord,
    scrollWheel
  };
}
