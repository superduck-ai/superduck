import { MAX_LOGS_PER_TAB, getConsoleMessagesByTab, getConsoleTrackingEnabled } from './state';
import type { ConsoleMessage, SendCommand } from './types';

const EXCLUDED_CONSOLE_MESSAGE_URL_PREFIXES = ['chrome-extension://'] as const;

function shouldIgnoreConsoleMessage(message: ConsoleMessage): boolean {
  return Boolean(
    message.url &&
    EXCLUDED_CONSOLE_MESSAGE_URL_PREFIXES.some((prefix) => message.url?.startsWith(prefix))
  );
}

export function addConsoleMessage(tabId: number, domain: string, message: ConsoleMessage): void {
  if (shouldIgnoreConsoleMessage(message)) return;

  let tabData = getConsoleMessagesByTab().get(tabId);

  if (!tabData || tabData.domain !== domain) {
    tabData = { domain, messages: [] };
    getConsoleMessagesByTab().set(tabId, tabData);
  }

  if (tabData.messages.length > 0) {
    const lastTimestamp = tabData.messages[tabData.messages.length - 1].timestamp;
    if (message.timestamp < lastTimestamp) {
      message.timestamp = lastTimestamp;
    }
  }

  tabData.messages.push(message);

  if (tabData.messages.length > MAX_LOGS_PER_TAB) {
    const excess = tabData.messages.length - MAX_LOGS_PER_TAB;
    tabData.messages.splice(0, excess);
  }
}

export async function enableConsoleTracking(
  tabId: number,
  sendCommand: SendCommand
): Promise<void> {
  try {
    await sendCommand(tabId, 'Runtime.enable');
    getConsoleTrackingEnabled().add(tabId);
  } catch (error) {
    throw error;
  }
}

export function getConsoleMessages(
  tabId: number,
  errorsOnly: boolean = false,
  filterPattern?: string
): ConsoleMessage[] {
  const tabData = getConsoleMessagesByTab().get(tabId);
  if (!tabData) return [];

  let messages = tabData.messages.filter((msg) => !shouldIgnoreConsoleMessage(msg));

  if (errorsOnly) {
    messages = messages.filter((msg) => msg.type === 'error' || msg.type === 'exception');
  }

  if (filterPattern) {
    try {
      const regex = new RegExp(filterPattern, 'i');
      messages = messages.filter((msg) => regex.test(msg.text));
    } catch {
      messages = messages.filter((msg) =>
        msg.text.toLowerCase().includes(filterPattern.toLowerCase())
      );
    }
  }

  return messages;
}

export function clearConsoleMessages(tabId: number): void {
  getConsoleMessagesByTab().delete(tabId);
}
