import type { ToolDefinition } from '../pageTools';
import { cdpDebugger } from '../cdp';
import type { ClickArgs } from './types';
import { isToolScriptResult, resolveActiveTab } from './helpers';

export const superduckClickTool: ToolDefinition<ClickArgs> = {
  name: 'superduck_click',
  description:
    'SuperDuck CLI: click an element on the active tab by CSS selector (selector) or by visible text (text). One of selector/text required.',
  tabAccess: 'write',
  parameters: {
    selector: { type: 'string', description: 'CSS selector to match' },
    text: { type: 'string', description: 'Visible text to match (case-insensitive substring)' },
    tabId: { type: 'number' }
  },
  execute: async (args, context) => {
    try {
      const tab = await resolveActiveTab(args?.tabId, context);
      if (tab.id === undefined) return { error: 'active tab has no id' };
      const selector = args?.selector ? String(args.selector) : '';
      const text = args?.text ? String(args.text) : '';
      if (!selector && !text) return { error: 'selector or text is required' };

      const _results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector, text],
        func: (selector: string, text: string) => {
          let el: Element | null = null;
          if (selector) {
            el = document.querySelector(selector);
            if (!el) return { ok: false, reason: `no element matches selector: ${selector}` };
          } else {
            const needle = text.toLowerCase();
            const candidates = document.querySelectorAll(
              'a,button,input,[role=button],[role=link],[role=tab],[role=menuitem],label,summary,select,textarea,[onclick],[tabindex]'
            );
            for (const c of Array.from(candidates)) {
              const t = (c.textContent || '').trim().toLowerCase();
              const v = (c as HTMLInputElement).value?.toLowerCase?.() || '';
              const aria = (c.getAttribute('aria-label') || '').toLowerCase();
              if (t.includes(needle) || v.includes(needle) || aria.includes(needle)) {
                el = c;
                break;
              }
            }
            if (!el) return { ok: false, reason: `no clickable element matches text: ${text}` };
          }
          (el as HTMLElement).scrollIntoView({ block: 'center' });
          if (el instanceof HTMLElement) el.offsetHeight;
          const rect = el.getBoundingClientRect();
          return {
            ok: true,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 80),
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2)
          };
        }
      });
      const r = isToolScriptResult(_results?.[0]?.result) ? _results[0].result : undefined;
      if (!r?.ok) return { error: r?.reason || 'click failed' };

      if (typeof r.x === 'number' && typeof r.y === 'number') {
        await cdpDebugger.click(tab.id, r.x, r.y, 'left', 1, 0);
      }

      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return {
        error: `superduck_click failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_click',
    description: 'SuperDuck CLI: click element by selector or text',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        tabId: { type: 'number' }
      },
      required: []
    }
  })
};
