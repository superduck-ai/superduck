import type { ConsoleTabData, NetworkTabData } from './cdpTypes';

function initializeCdpGlobalState(): void {
  if (globalThis.__cdpDebuggerListenerRegistered === undefined) {
    globalThis.__cdpDebuggerListenerRegistered = false;
  }
  if (!globalThis.__cdpConsoleMessagesByTab) {
    globalThis.__cdpConsoleMessagesByTab = new Map();
  }
  if (!globalThis.__cdpNetworkRequestsByTab) {
    globalThis.__cdpNetworkRequestsByTab = new Map();
  }
  if (!globalThis.__cdpNetworkTrackingEnabled) {
    globalThis.__cdpNetworkTrackingEnabled = new Set();
  }
  if (!globalThis.__cdpConsoleTrackingEnabled) {
    globalThis.__cdpConsoleTrackingEnabled = new Set();
  }
}

initializeCdpGlobalState();

export function isDebuggerListenerRegistered(): boolean {
  return Boolean(globalThis.__cdpDebuggerListenerRegistered);
}

export function setDebuggerListenerRegistered(value: boolean): void {
  globalThis.__cdpDebuggerListenerRegistered = value;
}

export function getConsoleMessagesByTab(): Map<number, ConsoleTabData> {
  return globalThis.__cdpConsoleMessagesByTab as Map<number, ConsoleTabData>;
}

export function getNetworkRequestsByTab(): Map<number, NetworkTabData> {
  return globalThis.__cdpNetworkRequestsByTab as Map<number, NetworkTabData>;
}

export function getNetworkTrackingEnabled(): Set<number> {
  return globalThis.__cdpNetworkTrackingEnabled;
}

export function getConsoleTrackingEnabled(): Set<number> {
  return globalThis.__cdpConsoleTrackingEnabled;
}
