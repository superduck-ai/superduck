import { describe, expect, it, vi } from 'vitest';
import { AgentIndicatorController } from './controller';

type FakeElement = {
  parentNode: unknown;
  style: Record<string, string>;
};

type ControllerInternals = {
  agentActive: boolean;
  glowBorderEl: FakeElement | null;
  waterRipple: { container: FakeElement; restart: () => void } | null;
  blockingOverlayEl: FakeElement | null;
  stopContainer: { container: FakeElement; restart: () => void } | null;
  mcpEnabled: boolean;
  shadow: {
    getDocumentMountRoot: () => { appendChild: (element: FakeElement) => void };
  };
  restoreInterruptiveIndicatorsAfterToolUse: () => void;
};

function createController(overrides: Partial<ControllerInternals>): ControllerInternals {
  return Object.assign(Object.create(AgentIndicatorController.prototype), {
    agentActive: true,
    glowBorderEl: null,
    waterRipple: null,
    blockingOverlayEl: null,
    stopContainer: null,
    mcpEnabled: false,
    shadow: {
      getDocumentMountRoot: () => ({ appendChild: vi.fn() })
    },
    ...overrides
  }) as ControllerInternals;
}

describe('AgentIndicatorController restoreInterruptiveIndicatorsAfterToolUse', () => {
  it('does not restore the blocking overlay after the agent is already inactive', () => {
    const appendChild = vi.fn();
    const blockingOverlayEl: FakeElement = {
      parentNode: null,
      style: { display: 'none', pointerEvents: 'none', opacity: '0' }
    };
    const controller = createController({
      agentActive: false,
      blockingOverlayEl,
      shadow: {
        getDocumentMountRoot: () => ({ appendChild })
      }
    });

    controller.restoreInterruptiveIndicatorsAfterToolUse();

    expect(blockingOverlayEl.style.display).toBe('none');
    expect(blockingOverlayEl.style.pointerEvents).toBe('none');
    expect(appendChild).not.toHaveBeenCalled();
  });

  it('restores the blocking overlay while the agent is active', () => {
    const appendChild = vi.fn();
    const blockingOverlayEl: FakeElement = {
      parentNode: null,
      style: { display: 'none', pointerEvents: 'none', opacity: '0' }
    };
    const controller = createController({
      agentActive: true,
      blockingOverlayEl,
      shadow: {
        getDocumentMountRoot: () => ({ appendChild })
      }
    });

    controller.restoreInterruptiveIndicatorsAfterToolUse();

    expect(blockingOverlayEl.style.display).toBe('');
    expect(blockingOverlayEl.style.pointerEvents).toBe('auto');
    expect(blockingOverlayEl.style.opacity).toBe('1');
    expect(appendChild).toHaveBeenCalledWith(blockingOverlayEl);
  });
});
