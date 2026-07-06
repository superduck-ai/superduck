import type { ToolDefinition } from '../pageTools';
import type { ActiveContextArgs } from './types';
import { isActiveContextScriptResult, resolveActiveTab } from './helpers';

export const superduckActiveContextTool: ToolDefinition<ActiveContextArgs> = {
  name: 'superduck_active_context',
  description:
    "SuperDuck CLI: get url/title/selection/visible-text from the user's currently active Chrome tab (last focused window). Use full=true for full page innerText (warns about token cost).",
  tabAccess: 'read',
  parameters: {
    tabId: {
      type: 'number',
      description:
        'Optional explicit tab id. Defaults to the active tab of the last focused window.'
    },
    full: { type: 'boolean', description: 'Return whole-page innerText instead of viewport text' }
  },
  execute: async (args, context) => {
    try {
      const tab = await resolveActiveTab(args?.tabId, context);
      if (tab.id === undefined) return { error: 'Tab has no id' };

      const full = !!args?.full;
      const _results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [full],
        func: (full: boolean) => {
          function viewportText(): string {
            const out: string[] = [];
            const seen = new Set<Element>();
            const vh = window.innerHeight,
              vw = window.innerWidth;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            let totalLen = 0;
            while ((n = walker.nextNode())) {
              const t = n.textContent?.trim();
              if (!t) continue;
              const p = (n as Text).parentElement;
              if (!p || seen.has(p)) continue;
              const r = p.getBoundingClientRect();
              if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
              const cs = getComputedStyle(p);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              seen.add(p);
              out.push(t);
              totalLen += t.length + 1;
              if (totalLen > 50000) break;
            }
            return out.join('\n');
          }
          return {
            url: location.href,
            title: document.title,
            selection: window.getSelection()?.toString() ?? '',
            text: full ? document.body.innerText : viewportText()
          };
        }
      });
      const result = isActiveContextScriptResult(_results?.[0]?.result)
        ? _results[0].result
        : undefined;

      const payload = {
        tabId: tab.id,
        windowId: tab.windowId,
        ...(result || { url: tab.url, title: tab.title, selection: '', text: '' })
      };
      return { output: JSON.stringify(payload, null, 2) };
    } catch (err) {
      return {
        error: `superduck_active_context failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_active_context',
    description: "SuperDuck CLI: read user's active Chrome tab url/title/selection/text",
    input_schema: {
      type: 'object',
      properties: {
        tabId: { type: 'number' },
        full: { type: 'boolean' }
      },
      required: []
    }
  })
};
