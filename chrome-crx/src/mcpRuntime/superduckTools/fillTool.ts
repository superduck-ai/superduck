import type { ToolDefinition } from '../pageTools';
import type { FillArgs } from './types';
import { isToolScriptResult, resolveActiveTab } from './helpers';

export const superduckFillTool: ToolDefinition<FillArgs> = {
  name: 'superduck_fill',
  description:
    'SuperDuck CLI: set the value of a form field on the active tab and dispatch input/change events.',
  parameters: {
    selector: { type: 'string', description: 'CSS selector for the input/textarea/select' },
    value: { type: 'string', description: 'Value to set' },
    tabId: { type: 'number' }
  },
  execute: async (args, context) => {
    try {
      const tab = await resolveActiveTab(args?.tabId, context);
      if (tab.id === undefined) return { error: 'active tab has no id' };
      const selector = String(args?.selector || '');
      if (!selector) return { error: 'selector is required' };
      const value = args?.value === undefined ? '' : String(args.value);
      const _results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector, value],
        func: (selector: string, value: string) => {
          const el = document.querySelector(selector) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | HTMLSelectElement
            | null;
          if (!el) return { ok: false, reason: `no element matches selector: ${selector}` };
          (el as HTMLElement).scrollIntoView({ block: 'center' });
          (el as HTMLElement).focus();
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, value);
          else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, tag: el.tagName.toLowerCase(), value: el.value };
        }
      });
      const r = isToolScriptResult(_results?.[0]?.result) ? _results[0].result : undefined;
      if (!r?.ok) return { error: r?.reason || 'fill failed' };
      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return {
        error: `superduck_fill failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_fill',
    description: 'SuperDuck CLI: set form field value',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        value: { type: 'string' },
        tabId: { type: 'number' }
      },
      required: ['selector', 'value']
    }
  })
};
