import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import type { CdpRuntimeEvaluateResult } from '../cdp';
import type { ToolDefinition, ToolResult } from '../pageTools';
import type { FileUploadToolInput } from './types';
import { isScriptSuccessResult } from './types';

export const fileUploadTool: ToolDefinition<FileUploadToolInput> = {
  name: 'file_upload',
  description:
    'Upload one or multiple files from the local filesystem to a file input element on the page. Do not click on file upload buttons or file inputs — clicking opens a native file picker dialog that you cannot see or interact with. Instead, use read_page or find to locate the file input element, then use this tool with its ref to upload files directly. The paths must be absolute file paths on the local machine.',
  parameters: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description:
        'The absolute paths to the files to upload. Can be a single file or multiple files.'
    },
    ref: {
      type: 'string',
      description:
        'Element reference ID of the file input from read_page or find tools (e.g., "ref_1", "ref_2").'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID where the file input is located. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.paths || !Array.isArray(params.paths) || 0 === params.paths.length)
        throw new Error('paths parameter is required and must be a non-empty array of file paths');
      if (!params?.ref) throw new Error('ref parameter is required');
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
            actionData: { ref: params.ref }
          };
        }
        return { error: 'Permission denied for uploading files to this domain' };
      }

      const originalUrl = tab.url;
      if (!originalUrl) return { error: 'Unable to get original URL for security check' };

      const securityCheck = await checkUrlSecurity(activeTabId, originalUrl, 'file upload action');
      if (securityCheck) return securityCheck;

      const uploadAttr = `data-superduck-upload-${Date.now()}`;
      const markResult = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: (ref: string, attr: string) => {
          const pageWindow = window as Window & {
            __superduckElementMap?: Record<string, WeakRef<Element>>;
          };
          const elementMap = pageWindow.__superduckElementMap;
          if (!elementMap?.[ref])
            return {
              error: `Element ref not found: "${ref}". The element may have been removed from the page.`
            };
          const element = elementMap[ref].deref();
          if (!element) {
            delete elementMap[ref];
            return { error: `Element has been garbage collected: "${ref}"` };
          }
          if (!document.contains(element)) {
            delete elementMap[ref];
            return { error: `Element is no longer in the document: "${ref}"` };
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
        args: [params.ref, uploadAttr]
      });

      if (!markResult || 0 === markResult.length)
        return { error: 'Failed to execute script to find element' };
      const markOutput = markResult[0]?.result;
      if (!isScriptSuccessResult(markOutput)) {
        return { error: 'Unexpected response while locating file input element' };
      }
      if (markOutput.error) return { error: markOutput.error };

      const resolveResult = await cdpDebugger.sendCommand<CdpRuntimeEvaluateResult>(
        activeTabId,
        'Runtime.evaluate',
        {
          expression: `document.querySelector('[${uploadAttr}="1"]')`,
          returnByValue: false
        }
      );

      if (resolveResult.exceptionDetails) {
        return {
          error:
            resolveResult.exceptionDetails.exception?.description ||
            resolveResult.exceptionDetails.text ||
            'Failed to resolve element via CDP'
        };
      }

      const objectId = resolveResult.result?.objectId;
      if (!objectId) return { error: 'Failed to get object reference for element' };

      await cdpDebugger.sendCommand(activeTabId, 'DOM.enable');
      await cdpDebugger.sendCommand(activeTabId, 'DOM.setFileInputFiles', {
        files: params.paths,
        objectId
      });
      await cdpDebugger.sendCommand(activeTabId, 'DOM.disable');

      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: (ref: string, attr: string) => {
          const pageWindow = window as Window & {
            __superduckElementMap?: Record<string, WeakRef<Element>>;
          };
          const elementMap = pageWindow.__superduckElementMap;
          if (!elementMap?.[ref]) return;
          const element = elementMap[ref].deref();
          if (element) element.removeAttribute(attr);
        },
        args: [params.ref, uploadAttr]
      });

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
      'Upload one or multiple files from the local filesystem to a file input element on the page. Do not click on file upload buttons or file inputs — clicking opens a native file picker dialog that you cannot see or interact with. Instead, use read_page or find to locate the file input element, then use this tool with its ref to upload files directly. The paths must be absolute file paths on the local machine.',
    input_schema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The absolute paths to the files to upload. Can be a single file or multiple files.'
        },
        ref: {
          type: 'string',
          description:
            'Element reference ID of the file input from read_page or find tools (e.g., "ref_1", "ref_2").'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID where the file input is located. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['paths', 'ref', 'tabId']
    }
  })
};
