// Active tab here = the focused tab of the last-focused window, NOT
// tabGroupManager.currentTabId. SuperDuck CLI is invoked from outside Chrome
// so it must follow the user's actual focus, not the panel's pinned group.

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (input: any, context?: any) => Promise<any>;
  toProviderSchema: (context?: any) => Promise<any> | any;
}

async function resolveActiveTab(explicit?: number): Promise<chrome.tabs.Tab> {
  if (explicit !== undefined && explicit !== null) {
    return await chrome.tabs.get(explicit);
  }
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tabs.length || tabs[0].id === undefined) {
    throw new Error('No active tab in last focused window');
  }
  return tabs[0];
}

function eTLDPlus1(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  // Cheap approximation; a full PSL would catch e.g. *.co.uk vs *.com.
  const second = parts[parts.length - 2];
  const known2LD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac']);
  if (known2LD.has(second) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

// ---------- superduck_active_context ----------
export const superduckActiveContextTool: ToolDefinition = {
  name: 'superduck_active_context',
  description:
    "SuperDuck CLI: get url/title/selection/visible-text from the user's currently active Chrome tab (last focused window). Use full=true for full page innerText (warns about token cost).",
  parameters: {
    tabId: {
      type: 'number',
      description: 'Optional explicit tab id. Defaults to the active tab of the last focused window.'
    },
    full: { type: 'boolean', description: 'Return whole-page innerText instead of viewport text' }
  },
  execute: async (args) => {
    try {
      const tab = await resolveActiveTab(args?.tabId);
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
      const result = _results?.[0]?.result;

      const payload = {
        tabId: tab.id,
        windowId: tab.windowId,
        ...((result as any) || { url: tab.url, title: tab.title, selection: '', text: '' })
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
    description:
      "SuperDuck CLI: read user's active Chrome tab url/title/selection/text",
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

// ---------- superduck_background_fetch ----------
export const superduckBackgroundFetchTool: ToolDefinition = {
  name: 'superduck_background_fetch',
  description:
    "SuperDuck CLI: fetch a URL from the extension background, automatically including the user's Chrome cookies for the target origin. Default: same eTLD+1 as source tab; pass allowCrossOrigin=true to bypass.",
  parameters: {
    url: { type: 'string', description: 'URL to fetch' },
    method: { type: 'string', description: 'HTTP method (default GET)' },
    headers: { type: 'object', description: 'Header map' },
    body: { type: 'string', description: 'Request body (string)' },
    sourceTabId: {
      type: 'number',
      description: 'Tab whose origin defines the same-domain policy. Default: active tab.'
    },
    allowCrossOrigin: { type: 'boolean', description: 'Allow target origin != source eTLD+1' }
  },
  execute: async (args) => {
    try {
      const url = String(args?.url || '');
      if (!url) return { error: 'url is required' };
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        return { error: `invalid url: ${url}` };
      }

      // eTLD+1 of source tab acts as the same-origin gate.
      const sourceTab = await resolveActiveTab(args?.sourceTabId);
      let sourceETld = '';
      if (sourceTab.url) {
        try {
          sourceETld = eTLDPlus1(new URL(sourceTab.url).hostname);
        } catch {
          /* ignore */
        }
      }
      const targetETld = eTLDPlus1(target.hostname);
      const sameDomain = sourceETld && sourceETld === targetETld;
      if (!sameDomain && !args?.allowCrossOrigin) {
        return {
          error: `cross-origin blocked: target ${targetETld} != source ${sourceETld || '(unknown)'}. Pass --allow-cross-origin to override.`
        };
      }

      const init: RequestInit = {
        method: String(args?.method || 'GET'),
        credentials: 'include',
        headers: (args?.headers as Record<string, string>) || undefined,
        body: args?.body !== undefined ? String(args.body) : undefined
      };

      const res = await fetch(url, init);
      const contentType = res.headers.get('content-type') || '';
      // Cap at ~900KB to leave headroom under the 1MiB native-messaging frame limit.
      const MAX = 900 * 1024;
      let body: string;
      if (contentType.startsWith('image/') || contentType.includes('octet-stream')) {
        const buf = await res.arrayBuffer();
        body = `[binary ${buf.byteLength} bytes, content-type=${contentType}, omitted]`;
      } else {
        const text = await res.text();
        body = text.length > MAX ? text.slice(0, MAX) + `\n…[truncated ${text.length - MAX} bytes]` : text;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return {
        output: JSON.stringify({
          status: res.status,
          statusText: res.statusText,
          url: res.url,
          contentType,
          headers,
          body,
          sourceETld,
          targetETld,
          sameDomain
        })
      };
    } catch (err) {
      return {
        error: `superduck_background_fetch failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_background_fetch',
    description: "SuperDuck CLI: fetch using user's Chrome cookies",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
        body: { type: 'string' },
        sourceTabId: { type: 'number' },
        allowCrossOrigin: { type: 'boolean' }
      },
      required: ['url']
    }
  })
};

// ---------- superduck_list_tabs ----------
export const superduckListTabsTool: ToolDefinition = {
  name: 'superduck_list_tabs',
  description: 'SuperDuck CLI: list all tabs across all windows (id, windowId, url, title, active).',
  parameters: {},
  execute: async () => {
    try {
      const [tabs, lastFocused] = await Promise.all([
        chrome.tabs.query({}),
        chrome.windows.getLastFocused({ windowTypes: ['normal'] })
      ]);
      const out = tabs
        .filter((t) => t.id !== undefined)
        .map((t) => ({
          id: t.id,
          windowId: t.windowId,
          url: t.url,
          title: t.title,
          active: t.active,
          focusedWindow: t.windowId === lastFocused.id
        }));
      return { output: JSON.stringify({ activeWindowId: lastFocused.id, tabs: out }, null, 2) };
    } catch (err) {
      return {
        error: `superduck_list_tabs failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_list_tabs',
    description: 'SuperDuck CLI: list all tabs',
    input_schema: { type: 'object', properties: {}, required: [] }
  })
};

// ---------- superduck_open ----------
export const superduckOpenTool: ToolDefinition = {
  name: 'superduck_open',
  description:
    "SuperDuck CLI: navigate user's active Chrome tab to a URL. Pass newTab=true to open in a new tab instead.",
  parameters: {
    url: { type: 'string', description: 'URL to open (http(s) or chrome://...)' },
    newTab: { type: 'boolean', description: 'Open in a new tab; default updates the active tab' },
    tabId: { type: 'number', description: 'Override active-tab resolution' }
  },
  execute: async (args) => {
    try {
      const url = String(args?.url || '');
      if (!url) return { error: 'url is required' };
      let tab: chrome.tabs.Tab;
      if (args?.newTab) {
        tab = await chrome.tabs.create({ url, active: true });
      } else {
        const active = await resolveActiveTab(args?.tabId);
        if (active.id === undefined) return { error: 'active tab has no id' };
        const updated = await chrome.tabs.update(active.id, { url, active: true });
        if (!updated) return { error: 'failed to update tab' };
        tab = updated;
      }
      return {
        output: JSON.stringify({ tabId: tab.id, windowId: tab.windowId, url, newTab: !!args?.newTab })
      };
    } catch (err) {
      return { error: `superduck_open failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
  toProviderSchema: async () => ({
    name: 'superduck_open',
    description: "SuperDuck CLI: navigate active tab (or open new tab)",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        newTab: { type: 'boolean' },
        tabId: { type: 'number' }
      },
      required: ['url']
    }
  })
};

// ---------- superduck_click ----------
export const superduckClickTool: ToolDefinition = {
  name: 'superduck_click',
  description:
    'SuperDuck CLI: click an element on the active tab by CSS selector (selector) or by visible text (text). One of selector/text required.',
  parameters: {
    selector: { type: 'string', description: 'CSS selector to match' },
    text: { type: 'string', description: 'Visible text to match (case-insensitive substring)' },
    tabId: { type: 'number' }
  },
  execute: async (args) => {
    try {
      const tab = await resolveActiveTab(args?.tabId);
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
            const candidates = document.querySelectorAll('a,button,input,[role=button],[role=link]');
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
          (el as HTMLElement).click();
          return {
            ok: true,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 80)
          };
        }
      });
      const r: any = _results?.[0]?.result;
      if (!r?.ok) return { error: r?.reason || 'click failed' };
      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return { error: `superduck_click failed: ${err instanceof Error ? err.message : String(err)}` };
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

// ---------- superduck_fill ----------
export const superduckFillTool: ToolDefinition = {
  name: 'superduck_fill',
  description:
    'SuperDuck CLI: set the value of a form field on the active tab and dispatch input/change events.',
  parameters: {
    selector: { type: 'string', description: 'CSS selector for the input/textarea/select' },
    value: { type: 'string', description: 'Value to set' },
    tabId: { type: 'number' }
  },
  execute: async (args) => {
    try {
      const tab = await resolveActiveTab(args?.tabId);
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
          else (el as any).value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, tag: el.tagName.toLowerCase(), value: el.value };
        }
      });
      const r: any = _results?.[0]?.result;
      if (!r?.ok) return { error: r?.reason || 'fill failed' };
      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return { error: `superduck_fill failed: ${err instanceof Error ? err.message : String(err)}` };
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

// ---------- superduck_press ----------
export const superduckPressTool: ToolDefinition = {
  name: 'superduck_press',
  description:
    "SuperDuck CLI: dispatch a keyboard event on the active tab (e.g. Enter, Tab, Escape, ArrowDown). Targets the focused element or the optional selector.",
  parameters: {
    key: { type: 'string', description: 'Key name (Enter, Tab, Escape, ArrowDown, a, ...)' },
    selector: { type: 'string', description: 'Optional selector to focus before pressing' },
    tabId: { type: 'number' }
  },
  execute: async (args) => {
    try {
      const tab = await resolveActiveTab(args?.tabId);
      if (tab.id === undefined) return { error: 'active tab has no id' };
      const key = String(args?.key || '');
      if (!key) return { error: 'key is required' };
      const selector = args?.selector ? String(args.selector) : '';
      const _results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [key, selector],
        func: (key: string, selector: string) => {
          let target: Element | null = null;
          if (selector) {
            target = document.querySelector(selector);
            if (!target) return { ok: false, reason: `no element matches selector: ${selector}` };
            (target as HTMLElement).focus();
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
          // Submit form on Enter for inputs
          if (key === 'Enter' && target instanceof HTMLInputElement && target.form) {
            target.form.requestSubmit?.();
          }
          return { ok: true, tag: (target as Element).tagName.toLowerCase(), key };
        }
      });
      const r: any = _results?.[0]?.result;
      if (!r?.ok) return { error: r?.reason || 'press failed' };
      return { output: JSON.stringify({ tabId: tab.id, ...r }) };
    } catch (err) {
      return { error: `superduck_press failed: ${err instanceof Error ? err.message : String(err)}` };
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

export const superduckTools = [
  superduckActiveContextTool,
  superduckBackgroundFetchTool,
  superduckListTabsTool,
  superduckOpenTool,
  superduckClickTool,
  superduckFillTool,
  superduckPressTool
];

export const superduckToolNames = superduckTools.map((t) => t.name);
