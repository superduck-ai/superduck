import { cdpDebugger } from '../cdp';
import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageTools';
import type { UploadFileToolInput } from './types';
import {
  markUploadFileAtCoordinateInPage,
  markUploadFileRefInPage,
  type UploadFileRefMarkResult
} from './uploadFileRefTarget';
import { validateUploadPaths } from './uploadFileValidation';

const FILE_UPLOAD_DESCRIPTION =
  'Upload local files to a file input on the page. Use exactly one of two modes: (1) pass `ref` to target an <input type=file> located via read_page/find; (2) pass `coordinate` to click a visible button/label that opens the native file picker, which is intercepted automatically. Paths must be absolute local filesystem paths.';

const REF_PARAM_DESCRIPTION =
  'Element reference ID from read_page/find (mode 1): an <input type=file>, or a <label>/<button> that controls or contains one. Mutually exclusive with `coordinate`.';

const COORDINATE_PARAM_DESCRIPTION =
  'Viewport [x, y] of a button/label that opens the native file picker (mode 2). Mutually exclusive with `ref`.';

interface FileChooserOpenedParams {
  frameId?: string;
  mode?: 'selectSingle' | 'selectMultiple';
  backendNodeId?: number;
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

function sendCdp<T extends object | undefined = object | undefined>(
  tabId: number,
  method: string,
  params?: Record<string, unknown>
): Promise<T> {
  return cdpDebugger.sendCommand<T>(tabId, method, params);
}

function isNotAllowedCdpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Not allowed/i.test(msg);
}

function isValidCoordinate(coord: unknown): coord is [number, number] {
  return (
    Array.isArray(coord) &&
    coord.length === 2 &&
    typeof coord[0] === 'number' &&
    typeof coord[1] === 'number' &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1]) &&
    coord[0] >= 0 &&
    coord[1] >= 0
  );
}

function isUploadFileRefMarkResult(value: unknown): value is UploadFileRefMarkResult {
  return typeof value === 'object' && value !== null;
}

function pickUploadMarkResult(
  results: chrome.scripting.InjectionResult[]
): UploadFileRefMarkResult | null {
  if (!results.length) return null;
  let fallback: UploadFileRefMarkResult | null = null;
  for (const sr of results) {
    const r = sr.result;
    if (!isUploadFileRefMarkResult(r)) continue;
    if (r.success) return r;
    if (
      r.error &&
      !/Element ref not found|garbage collected|no longer in the document/i.test(r.error)
    ) {
      return r;
    }
    fallback = r;
  }
  return fallback;
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

async function clickAtCoordinate(tabId: number, coordinate: [number, number]): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (x: number, y: number) => {
      const docX = x + window.scrollX;
      const docY = y + window.scrollY;
      window.scrollTo({
        left: Math.max(0, docX - window.innerWidth / 2),
        top: Math.max(0, docY - window.innerHeight / 2),
        behavior: 'instant'
      });
      const pointX = docX - window.scrollX;
      const pointY = docY - window.scrollY;
      for (const el of document.elementsFromPoint(pointX, pointY)) {
        if (
          el.id === 'superduck-agent-overlay-root' ||
          el.id === 'superduck-agent-blocking-overlay' ||
          el.closest('#superduck-agent-overlay-root')
        ) {
          continue;
        }
        if (el === document.body || el === document.documentElement) continue;
        (el as HTMLElement).click();
        return;
      }
      throw new Error(`No element at coordinates (${x}, ${y})`);
    },
    args: [coordinate[0], coordinate[1]]
  });
}

async function interceptAndSetFiles(
  tabId: number,
  coordinate: [number, number],
  paths: string[]
): Promise<{ error?: string }> {
  await sendCdp(tabId, 'Page.enable');
  await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: true });
  const chooserHandle = waitForFileChooser(tabId, 15_000);
  try {
    await clickAtCoordinate(tabId, coordinate);
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
  } finally {
    chooserHandle.dispose();
    await sendCdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
    await sendCdp(tabId, 'DOM.disable').catch(() => {});
    await sendCdp(tabId, 'Page.disable').catch(() => {});
  }
}

async function queryNodeIdUnderRoot(
  tabId: number,
  rootId: number,
  selector: string
): Promise<number> {
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
  await sendCdp(tabId, 'DOM.enable');
  try {
    const doc = await sendCdp<CdpDocumentResult>(tabId, 'DOM.getDocument', { depth: 0 });
    const rootId = doc?.root?.nodeId;
    if (!rootId) throw new Error('DOM.getDocument returned no root nodeId');
    const uploadNodeId = await queryNodeIdUnderRoot(tabId, rootId, uploadSelector);
    const clickNodeId =
      uploadSelector === clickSelector
        ? uploadNodeId
        : await queryNodeIdUnderRoot(tabId, rootId, clickSelector);
    await setFileInputFilesByNodeId(tabId, uploadNodeId, clickNodeId, paths);
  } finally {
    await sendCdp(tabId, 'DOM.disable').catch(() => {});
  }
}

async function removeUploadMarkers(
  tabId: number,
  uploadAttr: string,
  clickAttr: string,
  separateClickTarget: boolean
): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
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
    target: { tabId, allFrames: true },
    func: markUploadFileRefInPage,
    args: [ref, uploadAttr, clickAttr, paths.length]
  });

  const markOutput = pickUploadMarkResult(markResult ?? []);
  if (!markOutput) return { error: 'Failed to execute script to find element' };
  if (markOutput.error) return { error: markOutput.error };
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
  const stamp = Date.now();
  const uploadAttr = `data-superduck-upload-${stamp}`;
  const clickAttr = `data-superduck-upload-click-${stamp}`;

  const markResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: markUploadFileAtCoordinateInPage,
    args: [coordinate[0], coordinate[1], uploadAttr, clickAttr, paths.length]
  });

  const markOutput = pickUploadMarkResult(markResult ?? []);
  if (!markOutput?.success) {
    if (
      markOutput?.error &&
      /No file input found|No element at coordinates/i.test(markOutput.error)
    ) {
      return interceptAndSetFiles(tabId, coordinate, paths);
    }
    return {
      error: markOutput?.error ?? 'Failed to locate a file input at the given coordinate'
    };
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

export const uploadFileTool: ToolDefinition<UploadFileToolInput> = {
  name: 'upload_file',
  description: FILE_UPLOAD_DESCRIPTION,
  tabAccess: 'write',
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
      if (!params?.paths || !Array.isArray(params.paths) || params.paths.length === 0)
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

      const effectiveTabId = await context.resolveTabId(params.tabId);
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
      const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        context.tabId,
        context
      );
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
    name: 'upload_file',
    description: FILE_UPLOAD_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
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
