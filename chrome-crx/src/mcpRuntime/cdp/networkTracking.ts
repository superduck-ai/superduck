import {
  MAX_REQUESTS_PER_TAB,
  getNetworkRequestsByTab,
  getNetworkTrackingEnabled,
  isDebuggerListenerRegistered
} from './state';
import type { NetworkRequest, SendCommand } from './types';

export function addNetworkRequest(tabId: number, domain: string, request: NetworkRequest): void {
  let tabData = getNetworkRequestsByTab().get(tabId);

  if (tabData) {
    if (tabData.domain !== domain) {
      tabData.domain = domain;
      tabData.requests = [];
      tabData.requestMap = new Map();
    }
  } else {
    tabData = { domain, requests: [], requestMap: new Map() };
    getNetworkRequestsByTab().set(tabId, tabData);
  }

  tabData.requests.push(request);
  tabData.requestMap.set(request.requestId, request);

  if (tabData.requests.length > MAX_REQUESTS_PER_TAB) {
    const excess = tabData.requests.length - MAX_REQUESTS_PER_TAB;
    const removed = tabData.requests.splice(0, excess);
    for (const req of removed) {
      tabData.requestMap.delete(req.requestId);
    }
  }
}

export function updateNetworkRequestStatus(
  tabId: number,
  requestId: string,
  status?: number
): void {
  const tabData = getNetworkRequestsByTab().get(tabId);
  if (!tabData) return;
  const matchingRequest = tabData.requestMap.get(requestId);
  if (matchingRequest) {
    matchingRequest.status = status;
  }
}

export async function enableNetworkTracking(
  tabId: number,
  sendCommand: SendCommand,
  ensureListener: () => void
): Promise<void> {
  try {
    if (!isDebuggerListenerRegistered()) {
      ensureListener();
    }
    try {
      await sendCommand(tabId, 'Network.disable');
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    } catch {
      // ignore
    }
    await sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
    getNetworkTrackingEnabled().add(tabId);
  } catch (error) {
    throw error;
  }
}

export function getNetworkRequests(tabId: number, urlFilter?: string): NetworkRequest[] {
  const tabData = getNetworkRequestsByTab().get(tabId);
  if (!tabData) return [];

  let requests = tabData.requests;
  if (urlFilter) {
    requests = requests.filter((req) => req.url.includes(urlFilter));
  }
  return requests;
}

export function clearNetworkRequests(tabId: number): void {
  getNetworkRequestsByTab().delete(tabId);
}

export function isNetworkTrackingEnabled(tabId: number): boolean {
  return getNetworkTrackingEnabled().has(tabId);
}
