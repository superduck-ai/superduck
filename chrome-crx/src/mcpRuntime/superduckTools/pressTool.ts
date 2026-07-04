import type { ToolDefinition } from '../pageTools';
import type { PressArgs } from './types';
import { isToolScriptResult, resolveActiveTab } from './helpers';

export const superduckPressTool: ToolDefinition<PressArgs> = {
  name: 'superduck_press',
  description:
    'SuperDuck CLI: dispatch a keyboard event on the active tab (e.g. Enter, Tab, Escape, ArrowDown). Targets the focused element or the optional selector.',
  parameters: {
    key: { type: 'string', description: 'Key name (Enter, Tab, Escape, ArrowDown, a, ...)' },
    selector: { type: 'string', description: 'Optional selector to focus before pressing' },
    tabId: { type: 'number' }
  },
  execute: async (args, context) => {
    try {
      const tab = await resolveActiveTab(args?.tabId, context);
      if (tab.id === undefined) return { error: 'active tab has no id' };
      const key = String(args?.key || '');
      if (!key) return { error: 'key is required' };
      const selector = args?.selector ? String(args.selector) : '';
      const _results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [key, selector],
        func: (key: string, selector: string) => {
          let target: Element;
          if (selector) {
            const found = document.querySelector(selector);
            if (!found) return { ok: false, reason: `no element matches selector: ${selector}` };
            (found as HTMLElement).focus();
            target = found;
          } else {
            target = (document.activeElement as Element) || document.body;
          }
          const init: KeyboardEventInit = {
            key,
            code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
            bubbles: true,
            cancelable: true
          };
          target.dispatchEvent(new KeyboardEvent('keydown', init));
          target.dispatchEvent(new KeyboardEvent('keypress', init));
          target.dispatchEvent(new KeyboardEvent('keyup', init));
          if (key === 'Enter' && target instanceof HTMLInputElement && target.form) {
            target.form.requestSubmit?.();
          }
          return { ok: true, tag: (target as Element).tagName.toLowerCase(), key };
        }
      });
      const r = isToolScriptResult(_results?.[0]?.result) ? _results[0].result : undefined;
      if (!r?.ok) return { error: r?.reason || 'press failed' };
      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return {
        error: `superduck_press failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_press',
    description: 'SuperDuck CLI: dispatch keyboard event',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        selector: { type: 'string' },
        tabId: { type: 'number' }
      },
      required: ['key']
    }
  })
};
