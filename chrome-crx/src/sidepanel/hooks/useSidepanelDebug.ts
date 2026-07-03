/**
 * Sidepanel debug instrumentation.
 *
 * Records mount/unmount with a per-mount sidepanelInstanceId, plus a sampled
 * render counter that emits sidepanel.render.spike when the render rate
 * crosses the threshold — the signal diagnosis rule 4 (sidepanel_render_spike)
 * consumes. Disabled when debug is off (recordEvent is a no-op then).
 */

import { useEffect, useRef } from 'react';
import { recordEvent } from '../../debug';
import { newDebugSessionId } from '../../debug/session';

export function isDebugMsgs(): boolean {
  return !!(globalThis as { __SD_DEBUG_MSGS?: boolean }).__SD_DEBUG_MSGS;
}

const RENDER_SPIKE_THRESHOLD = 30;
const FLUSH_INTERVAL_MS = 1000;

export function useSidepanelDebug(componentName: string = 'SidepanelApp'): void {
  const instanceIdRef = useRef<string>('');
  if (!instanceIdRef.current) {
    instanceIdRef.current = newDebugSessionId();
  }
  const renderCountRef = useRef(0);

  useEffect(() => {
    renderCountRef.current++;
  });

  useEffect(() => {
    const instanceId = instanceIdRef.current;
    recordEvent({
      domain: 'sidepanel',
      event: 'sidepanel.mount',
      ids: { sidepanelInstanceId: instanceId },
      data: { component: componentName }
    });
    const interval = setInterval(() => {
      const count = renderCountRef.current;
      renderCountRef.current = 0;
      if (count === 0) return;
      if (count >= RENDER_SPIKE_THRESHOLD) {
        recordEvent({
          domain: 'sidepanel',
          event: 'sidepanel.render.spike',
          ids: { sidepanelInstanceId: instanceId },
          level: 'warn',
          data: { count, component: componentName, threshold: RENDER_SPIKE_THRESHOLD }
        });
      } else {
        recordEvent({
          domain: 'sidepanel',
          event: 'sidepanel.render.sample',
          ids: { sidepanelInstanceId: instanceId },
          level: 'debug',
          data: { count, component: componentName }
        });
      }
    }, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      recordEvent({
        domain: 'sidepanel',
        event: 'sidepanel.unmount',
        ids: { sidepanelInstanceId: instanceId },
        data: { component: componentName }
      });
    };
  }, [componentName]);
}

/** Wrap a Zustand `set` to emit sidepanel.store.set_state events. */
export function wrapSetWithDebug<T extends object>(
  storeName: string,
  set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void
): (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void {
  return (partial) => {
    let changedKeys: string[] | undefined;
    try {
      if (
        typeof partial !== 'function' &&
        partial !== null &&
        typeof partial === 'object' &&
        !Array.isArray(partial)
      ) {
        changedKeys = Object.keys(partial);
      }
    } catch {
      // ignore
    }
    set(partial);
    recordEvent({
      domain: 'sidepanel',
      event: 'sidepanel.store.set_state',
      level: 'debug',
      data: { store: storeName, changedKeys }
    });
  };
}
