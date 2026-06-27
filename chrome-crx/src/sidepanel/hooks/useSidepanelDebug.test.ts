import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryDebugStore } from '../../debug/store';
import { startDebugSession, resetDebugRecorder } from '../../debug/recorder';
import { wrapSetWithDebug } from './useSidepanelDebug';

describe('wrapSetWithDebug', () => {
  let store: InMemoryDebugStore;

  beforeEach(async () => {
    store = new InMemoryDebugStore();
    await startDebugSession({ store });
  });

  afterEach(() => {
    resetDebugRecorder();
  });

  async function sidepanelEvents() {
    const evts = await store.getEvents();
    return evts.filter((e) => e.domain === 'sidepanel');
  }

  it('records sidepanel.store.set_state with store name and changed keys', async () => {
    let captured: unknown = null;
    const set = (partial: unknown) => {
      captured = partial;
    };
    const wrapped = wrapSetWithDebug<{ foo?: number; bar?: number }>('chatStore', set);
    wrapped({ foo: 1, bar: 2 });
    expect(captured).toEqual({ foo: 1, bar: 2 });

    const events = await sidepanelEvents();
    const evt = events.find((e) => e.event === 'sidepanel.store.set_state');
    expect(evt).toBeDefined();
    expect(evt?.data?.store).toBe('chatStore');
    expect(evt?.data?.changedKeys).toEqual(['foo', 'bar']);
  });

  it('handles function updater without changedKeys', async () => {
    const set = vi.fn();
    const wrapped = wrapSetWithDebug('uiStore', set);
    wrapped((s: { x?: number }) => ({ ...s, x: 1 }));
    expect(set).toHaveBeenCalled();
    const events = await sidepanelEvents();
    const evt = events.find((e) => e.event === 'sidepanel.store.set_state');
    expect(evt).toBeDefined();
    expect(evt?.data?.changedKeys).toBeUndefined();
  });

  it('is a no-op when debug is disabled', async () => {
    resetDebugRecorder();
    const set = vi.fn();
    const wrapped = wrapSetWithDebug('x', set);
    wrapped({ a: 1 });
    expect(set).toHaveBeenCalledWith({ a: 1 });
    const events = await sidepanelEvents();
    expect(events).toHaveLength(0);
  });
});
