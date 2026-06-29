import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolDefinition, ToolResult } from '../pageTools';
import { findImageInMessages } from './imageUtils';
import type { UploadImageToolInput } from './types';
import { isScriptOutputResult } from './types';

export const uploadImageTool: ToolDefinition<UploadImageToolInput> = {
  name: 'upload_image',
  description:
    'Upload a previously captured screenshot or user-uploaded image to a file input or drag & drop target. Supports two approaches: (1) ref - for targeting specific elements, especially hidden file inputs, (2) coordinate - for drag & drop to visible locations like Google Docs. Provide either ref or coordinate, not both.',
  parameters: {
    imageId: {
      type: 'string',
      description:
        "ID of a previously captured screenshot (from the computer tool's screenshot action) or a user-uploaded image"
    },
    ref: {
      type: 'string',
      description:
        'Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Use this for file inputs (especially hidden ones) or specific elements. Provide either ref or coordinate, not both.'
    },
    coordinate: {
      type: 'array',
      description:
        'Viewport coordinates [x, y] for drag & drop to a visible location. Use this for drag & drop targets like Google Docs. Provide either ref or coordinate, not both.'
    },
    tabId: {
      type: 'number',
      description:
        'Tab ID where the target element is located. This is where the image will be uploaded to.'
    },
    filename: {
      type: 'string',
      description: 'Optional filename for the uploaded file (default: "image.png")'
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.imageId) throw new Error('imageId parameter is required');
      if (!params?.ref && !params?.coordinate)
        throw new Error(
          'Either ref or coordinate parameter is required. Provide ref for targeting specific elements or coordinate for drag & drop to a location.'
        );
      if (params?.ref && params?.coordinate)
        throw new Error(
          'Provide either ref or coordinate, not both. Use ref for specific elements or coordinate for drag & drop.'
        );
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(params.tabId, context.tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Upload tab has no ID');
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for upload tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.UPLOAD_IMAGE,
            url: tabUrl,
            toolUseId,
            actionData: {
              ref: params.ref,
              coordinate: params.coordinate,
              imageId: params.imageId
            }
          };
        }
        return { error: 'Permission denied for uploading to this domain' };
      }

      const originalUrl = tab.url;
      if (!originalUrl) return { error: 'Unable to get original URL for security check' };
      if (!context.messages) return { error: 'Unable to access message history to retrieve image' };

      console.info(`[Upload-Image] Looking for image with ID: ${params.imageId}`);
      console.info(`[Upload-Image] Messages available: ${context.messages.length}`);

      const imageData = findImageInMessages(context.messages, params.imageId);
      if (!imageData)
        return {
          error: `Image not found with ID: ${params.imageId}. Please ensure the image was captured or uploaded earlier in this conversation.`
        };

      const base64Data = imageData.base64;
      const activeTabId = tab.id;
      if (!activeTabId) throw new Error('Active tab has no ID');
      const securityCheck = await checkUrlSecurity(activeTabId, originalUrl, 'upload image action');
      if (securityCheck) return securityCheck;

      const uploadResult = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: (
          ref: string | null,
          coordinate: [number, number] | null,
          base64: string,
          filename: string
        ) => {
          try {
            let targetElement: Element | null = null;
            if (coordinate) {
              targetElement = document.elementFromPoint(coordinate[0], coordinate[1]);
              if (!targetElement)
                return {
                  error: `No element found at coordinates (${coordinate[0]}, ${coordinate[1]})`
                };
              if ('IFRAME' === targetElement.tagName) {
                try {
                  const iframe = targetElement as HTMLIFrameElement;
                  const iframeDoc =
                    iframe.contentDocument ||
                    (iframe.contentWindow ? iframe.contentWindow.document : null);
                  if (iframeDoc) {
                    const rect = iframe.getBoundingClientRect();
                    const iframeX = coordinate[0] - rect.left;
                    const iframeY = coordinate[1] - rect.top;
                    const iframeElement = iframeDoc.elementFromPoint(iframeX, iframeY);
                    if (iframeElement) targetElement = iframeElement;
                  }
                } catch {
                  // cross-origin iframe
                }
              }
            } else {
              if (!ref) return { error: 'Neither coordinate nor elementRef provided' };
              const pageWindow = window as Window & {
                __superduckElementMap?: Record<string, WeakRef<Element>>;
              };
              if (pageWindow.__superduckElementMap?.[ref]) {
                targetElement = pageWindow.__superduckElementMap[ref].deref() || null;
                if (!targetElement || !document.contains(targetElement)) {
                  delete pageWindow.__superduckElementMap[ref];
                  targetElement = null;
                }
              }
              if (!targetElement)
                return {
                  error: `No element found with reference: "${ref}". The element may have been removed from the page.`
                };
            }

            if (!targetElement) {
              return { error: 'No target element found for upload' };
            }

            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const binaryString = atob(base64);
            const bytes = new Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const uint8Array = new Uint8Array(bytes);
            const blob = new Blob([uint8Array], { type: 'image/png' });
            const file = new File([blob], filename, {
              type: 'image/png',
              lastModified: Date.now()
            });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            if (targetElement instanceof HTMLInputElement && targetElement.type === 'file') {
              const fileInput = targetElement;
              fileInput.files = dataTransfer.files;
              fileInput.focus();
              fileInput.dispatchEvent(new Event('change', { bubbles: true }));
              fileInput.dispatchEvent(new Event('input', { bubbles: true }));
              const fileChangeEvent = new CustomEvent('filechange', {
                bubbles: true,
                detail: { files: dataTransfer.files }
              });
              fileInput.dispatchEvent(fileChangeEvent);
              return {
                output: `Successfully uploaded image "${filename}" (${Math.round(blob.size / 1024)}KB) to file input`
              };
            }

            {
              let dropX: number, dropY: number;
              if (coordinate) {
                dropX = coordinate[0];
                dropY = coordinate[1];
              } else {
                const rect = targetElement.getBoundingClientRect();
                dropX = rect.left + rect.width / 2;
                dropY = rect.top + rect.height / 2;
              }

              if (targetElement instanceof HTMLElement) {
                targetElement.focus();
              }

              const dragEnterEvent = new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement.dispatchEvent(dragEnterEvent);

              const dragOverEvent = new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement.dispatchEvent(dragOverEvent);

              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement.dispatchEvent(dropEvent);

              return {
                output: `Successfully dropped image "${filename}" (${Math.round(blob.size / 1024)}KB) onto element at (${Math.round(dropX)}, ${Math.round(dropY)})`
              };
            }
          } catch (err) {
            return {
              error: `Error uploading image: ${err instanceof Error ? err.message : 'Unknown error'}`
            };
          }
        },
        args: [
          params.ref || null,
          params.coordinate || null,
          base64Data,
          params.filename || 'image.png'
        ]
      });

      if (!uploadResult || 0 === uploadResult.length)
        throw new Error('Failed to execute upload image');

      const uploadOutput = uploadResult[0]?.result;
      if (!isScriptOutputResult(uploadOutput)) {
        throw new Error('Unexpected response while uploading image');
      }
      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        ...uploadOutput,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to upload image: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'upload_image',
    description:
      'Upload a previously captured screenshot or user-uploaded image to a file input or drag & drop target. Supports two approaches: (1) ref - for targeting specific elements, especially hidden file inputs, (2) coordinate - for drag & drop to visible locations like Google Docs. Provide either ref or coordinate, not both.',
    input_schema: {
      type: 'object',
      properties: {
        imageId: {
          type: 'string',
          description:
            "ID of a previously captured screenshot (from the computer tool's screenshot action) or a user-uploaded image"
        },
        ref: {
          type: 'string',
          description:
            'Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Use this for file inputs (especially hidden ones) or specific elements. Provide either ref or coordinate, not both.'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description:
            'Viewport coordinates [x, y] for drag & drop to a visible location. Use this for drag & drop targets like Google Docs. Provide either ref or coordinate, not both.'
        },
        tabId: {
          type: 'number',
          description:
            'Tab ID where the target element is located. This is where the image will be uploaded to.'
        },
        filename: {
          type: 'string',
          description: 'Optional filename for the uploaded file (default: "image.png")'
        }
      },
      required: ['imageId', 'tabId']
    }
  })
};
