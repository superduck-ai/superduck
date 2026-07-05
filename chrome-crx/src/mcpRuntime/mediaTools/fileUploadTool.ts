import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageTools';
import type { FileUploadToolInput } from './types';
import { resolveFileUploadRefTargetSource } from './fileUploadRefTarget';
import { validateUploadPaths } from './fileUploadValidation';

const FILE_UPLOAD_DESCRIPTION =
  'Upload local files to a file input on the page. Use exactly one of two modes: (1) pass `ref` to target an <input type=file> located via read_page/find; (2) pass `coordinate` to click a visible button/label that opens the native file picker, which is intercepted automatically. Paths must be absolute local filesystem paths.';

const REF_PARAM_DESCRIPTION =
  'Element reference ID from read_page/find (mode 1): an <input type=file>, or a <label>/<button> that controls or contains one. Mutually exclusive with `coordinate`.';

const COORDINATE_PARAM_DESCRIPTION =
  'Viewport [x, y] of a button/label that opens the native file picker (mode 2). Mutually exclusive with `ref`.';

const DEBUGGER_API_TIMEOUT_MS = 3000;

interface FileChooserOpenedParams {
  frameId?: string;
  mode?: 'selectSingle' | 'selectMultiple';
  backendNodeId?: number;
}

interface ResolveRefScriptResult {
  error?: string;
  success?: boolean;
  separateClickTarget?: boolean;
}

interface CdpDocumentResult {
  root?: { nodeId?: number };
}

interface CdpQuerySelectorResult {
  nodeId?: number;
}

interface CdpBoxModelResult {
  model?: { content?: number[] };
}

interface CdpDescribeNodeResult {
  node?: { backendNodeId?: number };
}

interface FileChooserWaitHandle {
  promise: Promise<FileChooserOpenedParams>;
  dispose: () => void;
}

// Self-contained CDP helper: attach, run commands, detach. We avoid the shared
// cdpDebugger singleton here because its lazy auto-attach path times out when
// file_upload is the first CDP tool in a sidepanel session (the tab lock /
// isDebuggerAttached check interacts badly with the test profile). A fresh
// attach/detach per call is reliable and matches how the working CDP probe
// operates.
function sendCdp<T = unknown>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result as T);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isNotAllowedCdpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Not allowed/i.test(msg);
}

function isValidCoordinate(coord: unknown): coord is [number, number] {
  return (
    Array.isArray(coord) &&
    2 === coord.length &&
    'number' === typeof coord[0] &&
    'number' === typeof coord[1] &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1])
  );
}

function isDebuggerAttached(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, DEBUGGER_API_TIMEOUT_MS);
    chrome.debugger.getTargets((targets) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError || !Array.isArray(targets)) {
        resolve(false);
        return;
      }
      const target = targets.find((t) => t.tabId === tabId);
      resolve(target?.attached ?? false);
    });
  });
}

function attachOnce(tabId: number, timeoutMs = DEBUGGER_API_TIMEOUT_MS): Promise<void> {
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
      await new Promise<void>((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve) => chrome.debugger.detach({ tabId }, () => resolve()));
}

async function resetFileChooserIntercept(tabId: number): Promise<void> {
  await sendCdp(tabId, 'Page.enable').catch(() => {});
  await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
}

async function withDebugger<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const wasAttached = await isDebuggerAttached(tabId);
  if (!wasAttached) await attachDebugger(tabId);
  try {
    await resetFileChooserIntercept(tabId);
    return await fn();
  } finally {
    await resetFileChooserIntercept(tabId);
    if (!wasAttached) await detachDebugger(tabId);
  }
}

function dispatchClick(tabId: number, x: number, y: number): Promise<void> {
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  return sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base }).then(
    async () => {
      await sendCdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    }
  );
}

function waitForFileChooser(tabId: number, timeoutMs = 5000): FileChooserWaitHandle {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let handler: (source: chrome.debugger.Debuggee, method: string, params?: object) => void;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer) clearTimeout(timer);
    if (handler) chrome.debugger.onEvent.removeListener(handler);
  };

  const promise = new Promise<FileChooserOpenedParams>((resolve, reject) => {
    timer = setTimeout(() => {
      dispose();
      reject(new Error(`file chooser did not open within ${timeoutMs}ms`));
    }, timeoutMs);
    handler = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
      if (source.tabId === tabId && method === 'Page.fileChooserOpened' && params) {
        dispose();
        resolve(params as FileChooserOpenedParams);
      }
    };
    chrome.debugger.onEvent.addListener(handler);
  });

  return { promise, dispose };
}

async function interceptAndSetFiles(
  tabId: number,
  coordinate: [number, number],
  paths: string[]
): Promise<{ error?: string }> {
  await sendCdp(tabId, 'Page.enable');
  await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: true });
  const chooserHandle = waitForFileChooser(tabId);
  try {
    await dispatchClick(tabId, coordinate[0], coordinate[1]);
    const chooser = await chooserHandle.promise;
    if (!chooser.backendNodeId) {
      return { error: 'file chooser opened but no backendNodeId was provided' };
    }
    await sendCdp(tabId, 'DOM.enable');
    await sendCdp(tabId, 'DOM.setFileInputFiles', {
      files: paths,
      backendNodeId: chooser.backendNodeId
    });
    return {};
  } catch (err) {
    chooserHandle.dispose();
    throw err;
  } finally {
    chooserHandle.dispose();
    await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
    await sendCdp(tabId, 'DOM.disable').catch(() => {});
    await sendCdp(tabId, 'Page.disable').catch(() => {});
  }
}

async function queryNodeId(tabId: number, selector: string): Promise<number> {
  const doc = await sendCdp<CdpDocumentResult>(tabId, 'DOM.getDocument', { depth: 0 });
  const rootId = doc?.root?.nodeId;
  if (!rootId) throw new Error('DOM.getDocument returned no root nodeId');
  const queried = await sendCdp<CdpQuerySelectorResult>(tabId, 'DOM.querySelector', {
    nodeId: rootId,
    selector
  });
  const nodeId = queried?.nodeId;
  if (!nodeId) throw new Error(`Element not found for selector: ${selector}`);
  return nodeId;
}

async function getElementCenter(tabId: number, nodeId: number): Promise<[number, number]> {
  const boxModel = await sendCdp<CdpBoxModelResult>(tabId, 'DOM.getBoxModel', { nodeId });
  const content = boxModel?.model?.content;
  if (!content || content.length < 8) {
    throw new Error('DOM.getBoxModel returned no usable content quad');
  }
  const xs = [content[0], content[2], content[4], content[6]];
  const ys = [content[1], content[3], content[5], content[7]];
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

async function resolveBackendNodeId(tabId: number, nodeId: number): Promise<number> {
  const described = await sendCdp<CdpDescribeNodeResult>(tabId, 'DOM.describeNode', {
    nodeId,
    depth: 0
  });
  const backendNodeId = described?.node?.backendNodeId;
  if (!backendNodeId) throw new Error('DOM.describeNode returned no backendNodeId');
  return backendNodeId;
}

async function setFileInputFilesByNodeId(
  tabId: number,
  uploadNodeId: number,
  clickNodeId: number,
  paths: string[]
): Promise<void> {
  const backendNodeId = await resolveBackendNodeId(tabId, uploadNodeId);
  try {
    await sendCdp(tabId, 'DOM.setFileInputFiles', { files: paths, backendNodeId });
  } catch (err) {
    if (!isNotAllowedCdpError(err)) throw err;
    let center: [number, number];
    try {
      center = await getElementCenter(tabId, clickNodeId);
    } catch {
      throw new Error(
        'Direct setFileInputFiles was blocked and the file input has no visible click target for picker fallback. Use `coordinate` with a visible button/label, or ref a visible label/button that controls the hidden input.',
        { cause: err }
      );
    }
    const fallback = await interceptAndSetFiles(tabId, center, paths);
    if (fallback.error) throw new Error(fallback.error, { cause: err });
  }
}

async function setFileInputFilesBySelectors(
  tabId: number,
  uploadSelector: string,
  clickSelector: string,
  paths: string[]
): Promise<void> {
  await withDebugger(tabId, async () => {
    await sendCdp(tabId, 'DOM.enable');
    try {
      const uploadNodeId = await queryNodeId(tabId, uploadSelector);
      const clickNodeId =
        uploadSelector === clickSelector ? uploadNodeId : await queryNodeId(tabId, clickSelector);
      await setFileInputFilesByNodeId(tabId, uploadNodeId, clickNodeId, paths);
    } finally {
      await sendCdp(tabId, 'DOM.disable').catch(() => {});
    }
  });
}

function resolveFileUploadRefInPage(
  refId: string,
  uploadAttr: string,
  clickAttr: string,
  pathCount: number,
  resolveFnSource: string
): ResolveRefScriptResult {
  const resolveFileUploadRefTarget = (
    new Function(`return (${resolveFnSource})`) as () => (
      element: Element,
      count: number
    ) => { error: string } | { fileInput: HTMLInputElement; clickTarget: Element }
  )();

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

  const result = resolveFileUploadRefTarget(element, pathCount);
  if ('error' in result) return { error: result.error };

  result.fileInput.setAttribute(uploadAttr, '1');
  const separateClickTarget = result.clickTarget !== result.fileInput;
  if (separateClickTarget) result.clickTarget.setAttribute(clickAttr, '1');
  return { success: true, separateClickTarget };
}

async function removeUploadMarkers(
  tabId: number,
  uploadAttr: string,
  clickAttr: string,
  separateClickTarget: boolean
): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: (uploadMarker: string, clickMarker: string, separateClick: boolean) => {
        document.querySelector(`[${uploadMarker}="1"]`)?.removeAttribute(uploadMarker);
        if (separateClick) {
          document.querySelector(`[${clickMarker}="1"]`)?.removeAttribute(clickMarker);
        }
      },
      args: [uploadAttr, clickAttr, separateClickTarget]
    })
    .catch(() => {});
}

async function uploadViaRef(
  tabId: number,
  ref: string,
  paths: string[]
): Promise<{ error?: string }> {
  const stamp = Date.now();
  const uploadAttr = `data-superduck-upload-${stamp}`;
  const clickAttr = `data-superduck-upload-click-${stamp}`;

  const markResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: resolveFileUploadRefInPage,
    args: [ref, uploadAttr, clickAttr, paths.length, resolveFileUploadRefTargetSource]
  });

  if (!markResult || 0 === markResult.length)
    return { error: 'Failed to execute script to find element' };
  const markOutput = markResult[0]?.result as ResolveRefScriptResult | undefined;
  if (!markOutput || markOutput.error) {
    return { error: markOutput?.error || 'Unexpected response while locating file input element' };
  }
  if (!markOutput.success) {
    return { error: 'Unexpected response while locating file input element' };
  }

  const uploadSelector = `[${uploadAttr}="1"]`;
  const clickSelector = markOutput.separateClickTarget ? `[${clickAttr}="1"]` : uploadSelector;
  const separateClickTarget = !!markOutput.separateClickTarget;

  try {
    await setFileInputFilesBySelectors(tabId, uploadSelector, clickSelector, paths);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to set files on file input'
    };
  } finally {
    await removeUploadMarkers(tabId, uploadAttr, clickAttr, separateClickTarget);
  }

  return {};
}

async function uploadViaFileChooser(
  tabId: number,
  coordinate: [number, number],
  paths: string[]
): Promise<{ error?: string }> {
  return withDebugger(tabId, async () => interceptAndSetFiles(tabId, coordinate, paths));
}

export const fileUploadTool: ToolDefinition<FileUploadToolInput> = {
  name: 'file_upload',
  description: FILE_UPLOAD_DESCRIPTION,
  parameters: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Absolute local filesystem paths to the files to upload.'
    },
    ref: {
      type: 'string',
      description: REF_PARAM_DESCRIPTION
    },
    coordinate: {
      type: 'array',
      items: { type: 'number' },
      description: COORDINATE_PARAM_DESCRIPTION
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

      const pathError = validateUploadPaths(params.paths);
      if (pathError) throw new Error(pathError);

      const hasRef = typeof params.ref === 'string' && params.ref.length > 0;
      const hasCoord = isValidCoordinate(params.coordinate);
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
            tool: PermissionTools.UPLOAD_FILE,
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
    description: FILE_UPLOAD_DESCRIPTION,
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
          description: REF_PARAM_DESCRIPTION
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: COORDINATE_PARAM_DESCRIPTION
        },
        tabId: {
          type: 'number',
          description: "Tab ID. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['paths']
    }
  })
};
