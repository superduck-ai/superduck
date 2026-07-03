import { beforeEach, describe, expect, it } from 'vitest';
import { addConsoleMessage, getConsoleMessages } from './consoleTracking';
import { getConsoleMessagesByTab } from './state';
import type { ConsoleMessage } from './types';

function makeMessage(text: string, url: string, timestamp: number): ConsoleMessage {
  return {
    type: 'log',
    text,
    url,
    timestamp
  };
}

describe('consoleTracking', () => {
  beforeEach(() => {
    getConsoleMessagesByTab().clear();
  });

  it('resets tab console messages when the domain changes', () => {
    addConsoleMessage(7, 'example.com', makeMessage('old domain log', 'https://example.com/', 1));
    const previousTabData = getConsoleMessagesByTab().get(7);

    addConsoleMessage(
      7,
      'other.example',
      makeMessage('new domain log', 'https://other.example/', 2)
    );

    expect(getConsoleMessages(7).map((message) => message.text)).toEqual(['new domain log']);
    expect(getConsoleMessagesByTab().get(7)).not.toBe(previousTabData);
    expect(getConsoleMessagesByTab().get(7)?.domain).toBe('other.example');
  });

  it('ignores extension console messages before mutating tab state', () => {
    addConsoleMessage(7, 'example.com', makeMessage('page log', 'https://example.com/', 1));
    const previousTabData = getConsoleMessagesByTab().get(7);

    addConsoleMessage(
      7,
      'unknown',
      makeMessage('extension log', 'chrome-extension://abc/content-script.js', 2)
    );

    expect(getConsoleMessages(7).map((message) => message.text)).toEqual(['page log']);
    expect(getConsoleMessagesByTab().get(7)).toBe(previousTabData);
    expect(getConsoleMessagesByTab().get(7)?.domain).toBe('example.com');
  });
});
