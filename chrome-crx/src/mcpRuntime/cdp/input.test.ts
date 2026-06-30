import { describe, it, expect, vi, beforeEach } from 'vitest';

const tabGroupMocks = vi.hoisted(() => ({
  hideIndicatorForToolUse: vi.fn().mockResolvedValue(undefined),
  restoreIndicatorAfterToolUse: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../tabState', () => ({
  tabGroupManager: {
    hideIndicatorForToolUse: tabGroupMocks.hideIndicatorForToolUse,
    restoreIndicatorAfterToolUse: tabGroupMocks.restoreIndicatorAfterToolUse
  }
}));

import { createCdpInput, getKeyCode, requiresShift } from './input';

function makeInput(isMac = false) {
  const sendCommand = vi.fn().mockResolvedValue(undefined);
  const input = createCdpInput({ sendCommand, isMac });
  return { input, sendCommand };
}

describe('getKeyCode', () => {
  it('resolves known named keys case-insensitively', () => {
    expect(getKeyCode('enter')?.keyCode).toBe(13);
    expect(getKeyCode('ENTER')?.key).toBe('Enter');
    expect(getKeyCode('Tab')?.code).toBe('Tab');
  });

  it('synthesizes a definition for single lowercase letters', () => {
    const def = getKeyCode('a');
    expect(def).toMatchObject({ key: 'a', code: 'KeyA', keyCode: 65, text: 'a' });
  });

  it('synthesizes a definition for single digits', () => {
    const def = getKeyCode('5');
    expect(def).toMatchObject({ key: '5', code: 'Digit5', keyCode: 53, text: '5' });
  });

  it('returns undefined for unknown multi-char input', () => {
    expect(getKeyCode('foo')).toBeUndefined();
  });

  it('returns undefined for unknown single non-alphanumeric chars', () => {
    expect(getKeyCode('é')).toBeUndefined();
  });
});

describe('requiresShift', () => {
  it('is true for uppercase letters', () => {
    expect(requiresShift('A')).toBe(true);
    expect(requiresShift('Z')).toBe(true);
  });

  it('is false for lowercase letters', () => {
    expect(requiresShift('a')).toBe(false);
  });

  it('is true for shifted symbol keys', () => {
    for (const c of '~!@#$%^&*()_+{}|:"<>?') expect(requiresShift(c)).toBe(true);
  });

  it('is false for digits and space', () => {
    expect(requiresShift('5')).toBe(false);
    expect(requiresShift(' ')).toBe(false);
  });
});

describe('createCdpInput', () => {
  beforeEach(() => {
    tabGroupMocks.hideIndicatorForToolUse.mockClear();
    tabGroupMocks.restoreIndicatorAfterToolUse.mockClear();
  });

  describe('dispatchMouseEvent', () => {
    it('rounds coordinates and forwards to Input.dispatchMouseEvent', async () => {
      const { input, sendCommand } = makeInput();
      await input.dispatchMouseEvent(7, { type: 'mouseMoved', x: 10.6, y: 20.2, modifiers: 0 });
      expect(sendCommand).toHaveBeenCalledWith(7, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 11,
        y: 20,
        modifiers: 0,
        button: 'none',
        buttons: 0
      });
    });

    it('includes clickCount and button for press/release', async () => {
      const { input, sendCommand } = makeInput();
      await input.dispatchMouseEvent(1, {
        type: 'mousePressed',
        x: 5,
        y: 5,
        button: 'right',
        clickCount: 2,
        modifiers: 1
      });
      expect(sendCommand).toHaveBeenLastCalledWith(1, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: 5,
        y: 5,
        modifiers: 1,
        button: 'right',
        clickCount: 2,
        buttons: 0
      });
    });

    it('forwards deltaX/deltaY for mouseWheel', async () => {
      const { input, sendCommand } = makeInput();
      await input.dispatchMouseEvent(1, {
        type: 'mouseWheel',
        x: 0,
        y: 0,
        deltaX: 10,
        deltaY: -20
      });
      const params = sendCommand.mock.calls[0][2];
      expect(params).toMatchObject({ type: 'mouseWheel', deltaX: 10, deltaY: -20 });
    });
  });

  describe('dispatchKeyEvent', () => {
    it('merges default modifiers=0', async () => {
      const { input, sendCommand } = makeInput();
      await input.dispatchKeyEvent(1, { type: 'keyDown', key: 'a' });
      expect(sendCommand).toHaveBeenCalledWith(1, 'Input.dispatchKeyEvent', {
        modifiers: 0,
        type: 'keyDown',
        key: 'a'
      });
    });

    it('preserves supplied modifiers', async () => {
      const { input, sendCommand } = makeInput();
      await input.dispatchKeyEvent(1, { type: 'rawKeyDown', modifiers: 8 });
      expect(sendCommand.mock.calls[0][2].modifiers).toBe(8);
    });
  });

  describe('insertText', () => {
    it('forwards text to Input.insertText', async () => {
      const { input, sendCommand } = makeInput();
      await input.insertText(3, 'hi');
      expect(sendCommand).toHaveBeenCalledWith(3, 'Input.insertText', { text: 'hi' });
    });
  });

  describe('click', () => {
    it('emits moved + press/release per clickCount with skipIndicator', async () => {
      const { input, sendCommand } = makeInput();
      await input.click(9, 100, 200, 'left', 2, 0, { skipIndicator: true });
      expect(sendCommand).toHaveBeenCalledTimes(5);
      const types = sendCommand.mock.calls.map((c) => (c[2] as { type: string }).type);
      expect(types).toEqual([
        'mouseMoved',
        'mousePressed',
        'mouseReleased',
        'mousePressed',
        'mouseReleased'
      ]);
      expect(tabGroupMocks.hideIndicatorForToolUse).not.toHaveBeenCalled();
    });

    it('maps button to buttons bitmask', async () => {
      const { input, sendCommand } = makeInput();
      await input.click(1, 0, 0, 'middle', 1, 0, { skipIndicator: true });
      const pressed = sendCommand.mock.calls.find(
        (c) => (c[2] as { type: string }).type === 'mousePressed'
      );
      expect((pressed![2] as { buttons: number }).buttons).toBe(4);
    });

    it('hides and restores indicator when not skipping', async () => {
      vi.useFakeTimers();
      try {
        const { input } = makeInput();
        const p = input.click(2, 1, 1, 'left', 1, 0);
        await vi.runAllTimersAsync();
        await p;
        expect(tabGroupMocks.hideIndicatorForToolUse).toHaveBeenCalledWith(2);
        expect(tabGroupMocks.restoreIndicatorAfterToolUse).toHaveBeenCalledWith(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('type', () => {
    it('dispatches keyDown+keyUp for a plain letter', async () => {
      const { input, sendCommand } = makeInput();
      await input.type(1, 'a');
      expect(sendCommand).toHaveBeenCalledTimes(2);
      expect(sendCommand.mock.calls[0][1]).toBe('Input.dispatchKeyEvent');
      const downParams = sendCommand.mock.calls[0][2] as { type: string; code: string };
      expect(downParams.type).toBe('keyDown');
      expect(downParams.code).toBe('KeyA');
    });

    it('normalizes newline to Enter', async () => {
      const { input, sendCommand } = makeInput();
      await input.type(1, '\n');
      const downParams = sendCommand.mock.calls[0][2] as { key: string };
      expect(downParams.key).toBe('Enter');
    });

    it('applies shift modifier for shifted symbols', async () => {
      const { input, sendCommand } = makeInput();
      await input.type(1, '!');
      expect((sendCommand.mock.calls[0][2] as { modifiers: number }).modifiers).toBe(8);
    });
  });

  describe('pressKeyChord', () => {
    it('computes modifier bitmask and dispatches keyDown+keyUp', async () => {
      const { input, sendCommand } = makeInput(false);
      await input.pressKeyChord(1, 'ctrl+a');
      const downParams = sendCommand.mock.calls[0][2] as { modifiers: number; code: string };
      expect(downParams.modifiers).toBe(2);
      expect(downParams.code).toBe('KeyA');
      expect(sendCommand).toHaveBeenCalledTimes(2);
    });

    it('adds mac commands when isMac', async () => {
      const { input, sendCommand } = makeInput(true);
      await input.pressKeyChord(1, 'cmd+c');
      const downParams = sendCommand.mock.calls[0][2] as { commands: string[] };
      expect(downParams.commands).toContain('copy');
    });

    it('throws for unknown main key', async () => {
      const { input } = makeInput();
      await expect(input.pressKeyChord(1, 'ctrl+é')).rejects.toThrow('Unknown key');
    });
  });

  describe('scrollWheel', () => {
    it('dispatches a mouseWheel event', async () => {
      const { input, sendCommand } = makeInput();
      await input.scrollWheel(1, 10, 20, 5, -5);
      expect(sendCommand).toHaveBeenCalledTimes(1);
      expect(sendCommand.mock.calls[0][2]).toMatchObject({
        type: 'mouseWheel',
        x: 10,
        y: 20,
        deltaX: 5,
        deltaY: -5
      });
    });
  });

  describe('pressKey / keyDown / keyUp', () => {
    it('pressKey issues keyDown then keyUp', async () => {
      const { input, sendCommand } = makeInput();
      const def = getKeyCode('a')!;
      await input.pressKey(1, def);
      expect(sendCommand).toHaveBeenCalledTimes(2);
      expect((sendCommand.mock.calls[0][2] as { type: string }).type).toBe('keyDown');
      expect((sendCommand.mock.calls[1][2] as { type: string }).type).toBe('keyUp');
    });
  });
});
