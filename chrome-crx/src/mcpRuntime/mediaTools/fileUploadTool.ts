import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageTools';
import type { FileUploadToolInput } from './types';
import { isScriptSuccessResult } from './types';

interface FileChooserOpenedParams {
  frameId?: string;
  mode?: 'selectSingle' | 'selectMultiple';
  backendNodeId?: number;
}

// Self-contained CDP helper: attach, run commands, detach. We avoid the shared
// cdpDebugger singleton here because its lazy auto-attach path times out when
// file_upload is the first CDP tool in a sidepanel session (the tab lock /
// isDebuggerAttached check interacts badly with the test profile). A fresh
// attach/detach per call is reliable and matches how the working CDP probe
// operates.
function sendCdp(tabId: number, method: string, params?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Attach can transiently fail or hang when residual state from a prior
// detach hasn't settled. Retry a few times with a per-attempt timeout.
function attachOnce(tabId: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('debugger attach timed out'));
    }, timeoutMs);
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const errMsg = chrome.runtime.lastError?.message;
      // "Another debugger is already attached" is fine — another CDP user
      // (e.g. computer tool) may already hold the session.
      if (errMsg && !/Another debugger is already attached/i.test(errMsg)) {
        reject(new Error(errMsg));
      } else {
        resolve();
      }
    });
  });
}

async function attachDebugger(tabId: number): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await attachOnce(tabId);
      return;
    } catch (err) {
      lastErr = err;
      // Clear any half-attached session before retrying.
      await new Promise<void>((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
}

async function withDebugger<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  await attachDebugger(tabId);
  try {
    return await fn();
  } finally {
    await detachDebugger(tabId);
  }
}

async function setFileInputFilesBySelector(
  tabId: number,
  selector: string,
  paths: string[]
): Promise<void> {
  await withDebugger(tabId, async () => {
    await sendCdp(tabId, 'DOM.enable');
    const doc = (await sendCdp(tabId, 'DOM.getDocument', { depth: 0 })) as {
      root?: { nodeId?: number };
    };
    const rootId = doc?.root?.nodeId;
    if (!rootId) throw new Error('DOM.getDocument returned no root nodeId');
    const queried = (await sendCdp(tabId, 'DOM.querySelector', {
      nodeId: rootId,
      selector
    })) as { nodeId?: number };
    const nodeId = queried?.nodeId;
    if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
    await sendCdp(tabId, 'DOM.setFileInputFiles', { files: paths, nodeId });
  });
}

function dispatchClick(tabId: number, x: number, y: number): Promise<void> {
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  return sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base }).then(
    async () => {
      await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    }
  );
}

function waitForFileChooser(tabId: number, timeoutMs = 5000): Promise<FileChooserOpenedParams> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(handler);
      reject(new Error(`file chooser did not open within ${timeoutMs}ms`));
    }, timeoutMs);
    const handler = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
      if (source.tabId === tabId && method === 'Page.fileChooserOpened' && params) {
        clearTimeout(timer);
        chrome.debugger.onEvent.removeListener(handler);
        resolve(params as FileChooserOpenedParams);
      }
    };
    chrome.debugger.onEvent.addListener(handler);
  });
}

async function uploadViaRef(
  tabId: number,
  ref: string,
  paths: string[]
): Promise<{ error?: string }> {
  const uploadAttr = `data-superduck-upload-${Date.now()}`;
  const markResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (refId: string, attr: string) => {
      const pageWindow = window as Window & {
        __superduckElementMap?: Record<string, WeakRef<Element>>;
      };
      const elementMap = pageWindow.__superduckElementMap;
      if (!elementMap?.[refId])
        return { error: `Element ref not found: "${refId}". The element may have been removed.` };
      const element = elementMap[refId].deref();
      if (!element) {
        delete elementMap[refId];
        return { error: `Element has been garbage collected: "${refId}"` };
      }
      if (!document.contains(element)) {
        delete elementMap[refId];
        return { error: `Element is no longer in the document: "${refId}"` };
      }
      const inputElement = element as HTMLInputElement;
      if ('INPUT' !== element.tagName || 'file' !== inputElement.type) {
        return {
          error: `Element is not a file input. Found: <${element.tagName.toLowerCase()}${inputElement.type ? ` type="${inputElement.type}"` : ''}>`
        };
      }
      element.setAttribute(attr, '1');
      return { success: true };
    },
    args: [ref, uploadAttr]
  });

  if (!markResult || 0 === markResult.length)
    return { error: 'Failed to execute script to find element' };
  const markOutput = markResult[0]?.result;
  if (!isScriptSuccessResult(markOutput)) {
    return { error: 'Unexpected response while locating file input element' };
  }
  if (markOutput.error) return { error: markOutput.error };

  await setFileInputFilesBySelector(tabId, `[${uploadAttr}="1"]`, paths);

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (refId: string, attr: string) => {
      const pageWindow = window as Window & {
        __superduckElementMap?: Record<string, WeakRef<Element>>;
      };
      const elementMap = pageWindow.__superduckElementMap;
      if (!elementMap?.[refId]) return;
      const element = elementMap[refId].deref();
      if (element) element.removeAttribute(attr);
    },
    args: [ref, uploadAttr]
  });
  return {};
}

async function uploadViaFileChooser(
  tabId: number,
  coordinate: [number, number],
  paths: string[]
): Promise<{ error?: string }> {
  return withDebugger(tabId, async () => {
    await sendCdp(tabId, 'Page.enable');
    await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: true });
    try {
      const chooserPromise = waitForFileChooser(tabId);
      await dispatchClick(tabId, coordinate[0], coordinate[1]);
      const chooser = await chooserPromise;
      if (!chooser.backendNodeId) {
        return { error: 'file chooser opened but no backendNodeId was provided' };
      }
      // backendNodeId resolves across the attach session, so set files before
      // withDebugger detaches.
      await sendCdp(tabId, 'DOM.enable');
      await sendCdp(tabId, 'DOM.setFileInputFiles', {
        files: paths,
        backendNodeId: chooser.backendNodeId
      });
      return {};
    } finally {
      await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(
        () => {}
      );
    }
  });
}

export const fileUploadTool: ToolDefinition<FileUploadToolInput> = {
  name: 'file_upload',
  description:
    'Upload one or multiple files from the local filesystem to a file input on the page. Two modes: (1) pass `ref` to target a known <input type=file> located via read_page/find — the browser reads files from the given absolute paths, no file content crosses the wire; (2) pass `coordinate` to click a button/label that opens the native file picker — the picker is intercepted and the files are set automatically. Do not click file inputs manually. Paths must be absolute local filesystem paths.',
  parameters: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Absolute local filesystem paths to the files to upload.'
    },
    ref: {
      type: 'string',
      description:
        'Element reference ID of a <input type=file> from read_page/find (mode 1). Either this or `coordinate` is required.'
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      description:
        'Viewport [x, y] of a button/label that opens the native file picker (mode 2). Either this or `ref` is required.'
    },
    tabId: {
      type: 'number',
      description: "Tab ID. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.paths || !Array.isArray(params.paths) || 0 === params.paths.length)
        throw new Error('paths parameter is required and must be a non-empty array of file paths');
      const hasRef = typeof params.ref === 'string' && params.ref.length > 0;
      const hasCoord = Array.isArray(params.coordinate) && params.coordinate.length === 2;
      if (hasRef === hasCoord)
        throw new Error(
          'Provide exactly one of `ref` (direct input) or `coordinate` (picker intercept)'
        );
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(params.tabId, context.tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
      const activeTabId = tab.id;
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.UPLOAD_IMAGE,
            url: tabUrl,
            toolUseId,
            actionData: hasRef ? { ref: params.ref } : { coordinate: params.coordinate }
          };
        }
        return { error: 'Permission denied for uploading files to this domain' };
      }

      const securityCheck = await checkUrlSecurity(activeTabId, tabUrl, 'file upload action');
      if (securityCheck) return securityCheck;

      const outcome = hasRef
        ? await uploadViaRef(activeTabId, params.ref!, params.paths)
        : await uploadViaFileChooser(activeTabId, params.coordinate!, params.paths);
      if (outcome.error) return { error: outcome.error };

      const fileNames = params.paths.map((filePath: string) => {
        const parts = filePath.split(/[/\\]/);
        return parts[parts.length - 1];
      });
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        output: `Uploaded ${params.paths.length} file(s) to file input: ${fileNames.join(', ')}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to upload file(s): ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'file_upload',
    description:
      'Upload one or multiple files from the local filesystem to a file input on the page. Two modes: (1) pass `ref` to target a known <input type=file> located via read_page/find — the browser reads files from the given absolute paths, no file content crosses the wire; (2) pass `coordinate` to click a button/label that opens the native file picker — the picker is intercepted and the files are set automatically. Paths must be absolute local filesystem paths.',
    input_schema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute local filesystem paths to the files to upload.'
        },
        ref: {
          type: 'string',
          description:
            'Element reference ID of a <input type=file> from read_page/find (mode 1). Either this or `coordinate` is required.'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description:
            'Viewport [x, y] of a button/label that opens the native file picker (mode 2). Either this or `ref` is required.'
        },
        tabId: {
          type: 'number',
          description: "Tab ID. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['paths', 'tabId']
    }
  })
};
