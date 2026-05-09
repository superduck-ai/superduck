import { StorageKeys } from '../SavedPromptsService';
import { PermissionTools, checkUrlSecurity } from './shared';
import { tabGroupManager } from './tabState';
import { cdpDebugger } from './cdp';
import type { ToolContext, ToolDefinition, ToolResult } from './pageTools';

const MCP_NATIVE_SESSION = 'mcp-native-session';

function findImageInMessages(
  messages: any[],
  imageId: string
): { base64: string; width?: number; height?: number } | undefined {
  console.info(`[imageUtils] Looking for image with ID: ${imageId}`);
  console.info(`[imageUtils] Total messages to search: ${messages.length}`);

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if ('user' === message.role && Array.isArray(message.content)) {
      // Search in tool_result blocks
      for (const block of message.content) {
        if ('tool_result' === block.type) {
          const toolResult = block;
          if (toolResult.content) {
            const contentParts = Array.isArray(toolResult.content)
              ? toolResult.content
              : [{ type: 'text', text: toolResult.content }];
            let foundIdInText = false;
            let matchingText = '';
            for (const part of contentParts) {
              if ('text' === part.type && part.text && part.text.includes(imageId)) {
                foundIdInText = true;
                matchingText = part.text;
                console.info('[imageUtils] Found image ID in tool_result text');
                break;
              }
            }
            if (foundIdInText) {
              for (const part of contentParts) {
                if ('image' === part.type) {
                  const imagePart = part;
                  if (imagePart.source && 'data' in imagePart.source && imagePart.source.data) {
                    console.info(`[imageUtils] Found image data for ID ${imageId}`);
                    return {
                      base64: imagePart.source.data,
                      width: parseDimension(matchingText, 'width'),
                      height: parseDimension(matchingText, 'height')
                    };
                  }
                }
              }
            }
          }
        }
      }

      // Search in user text blocks for adjacent images
      const textIndex = message.content.findIndex(
        (block: any) => 'text' === block.type && block.text?.includes(imageId)
      );
      if (-1 !== textIndex) {
        console.info(
          `[imageUtils] Found image ID in user text at index ${textIndex}, looking for next adjacent image`
        );
        for (let j = textIndex + 1; j < message.content.length; j++) {
          const block = message.content[j];
          if ('image' === block.type) {
            const imagePart = block;
            if (imagePart.source && 'data' in imagePart.source && imagePart.source.data) {
              console.info(
                `[imageUtils] Found user-uploaded image for ID ${imageId} at index ${j}`
              );
              return { base64: imagePart.source.data };
            }
          }
          if ('text' === block.type) {
            console.info('[imageUtils] Hit another text block, stopping search');
            break;
          }
        }
      }
    }
  }
  console.info(`[imageUtils] Image not found with ID: ${imageId}`);
}

function parseDimension(text: string, dimension: 'width' | 'height'): number | undefined {
  if (!text) return;
  const match = text.match(/\((\d+)x(\d+)/);
  if (!match) return;
  return 'width' === dimension ? parseInt(match[1], 10) : parseInt(match[2], 10);
}

// =============================================================================
// Tool: file_upload (ke)
// =============================================================================

const fileUploadTool: ToolDefinition = {
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
  execute: async (input: any, context: ToolContext): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.paths || !Array.isArray(params.paths) || 0 === params.paths.length)
        throw new Error('paths parameter is required and must be a non-empty array of file paths');
      if (!params?.ref) throw new Error('ref parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabId(params.tabId, context.tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
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

      const securityCheck = await checkUrlSecurity(tab.id!, originalUrl, 'file upload action');
      if (securityCheck) return securityCheck;

      const uploadAttr = `data-superduck-upload-${Date.now()}`;
      const markResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (ref: string, attr: string) => {
          const elementMap = (window as any).__superduckElementMap;
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
          if ('INPUT' !== element.tagName || 'file' !== (element as HTMLInputElement).type) {
            return {
              error: `Element is not a file input. Found: <${element.tagName.toLowerCase()}${element.type ? ` type="${element.type}"` : ''}>`
            };
          }
          element.setAttribute(attr, '1');
          return { success: true };
        },
        args: [params.ref, uploadAttr]
      });

      if (!markResult || 0 === markResult.length)
        return { error: 'Failed to execute script to find element' };
      const markOutput = markResult[0].result as any;
      if (markOutput.error) return { error: markOutput.error };

      // Use CDP to resolve element and set files
      const resolveResult = await cdpDebugger.sendCommand(tab.id!, 'Runtime.evaluate', {
        expression: `document.querySelector('[${uploadAttr}="1"]')`,
        returnByValue: false
      });

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

      await cdpDebugger.sendCommand(tab.id!, 'DOM.enable');
      await cdpDebugger.sendCommand(tab.id!, 'DOM.setFileInputFiles', {
        files: params.paths,
        objectId
      });
      await cdpDebugger.sendCommand(tab.id!, 'DOM.disable');

      // Clean up the marker attribute
      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (ref: string, attr: string) => {
          const elementMap = (window as any).__superduckElementMap;
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

// =============================================================================
// Tool: upload_image (qe)
// =============================================================================

const uploadImageTool: ToolDefinition = {
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
  execute: async (input: any, context: ToolContext): Promise<ToolResult> => {
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
      const securityCheck = await checkUrlSecurity(tab.id!, originalUrl, 'upload image action');
      if (securityCheck) return securityCheck;

      const uploadResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
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
              if ((window as any).__superduckElementMap && (window as any).__superduckElementMap[ref]) {
                targetElement = (window as any).__superduckElementMap[ref].deref() || null;
                if (!targetElement || !document.contains(targetElement)) {
                  delete (window as any).__superduckElementMap[ref];
                  targetElement = null;
                }
              }
              if (!targetElement)
                return {
                  error: `No element found with reference: "${ref}". The element may have been removed from the page.`
                };
            }

            targetElement!.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Decode base64 to binary
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

            // Handle file input elements
            if (
              'INPUT' === targetElement!.tagName &&
              'file' === (targetElement as HTMLInputElement).type
            ) {
              const fileInput = targetElement as HTMLInputElement;
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

            // Handle drag & drop
            {
              let dropX: number, dropY: number;
              if (coordinate) {
                dropX = coordinate[0];
                dropY = coordinate[1];
              } else {
                const rect = targetElement!.getBoundingClientRect();
                dropX = rect.left + rect.width / 2;
                dropY = rect.top + rect.height / 2;
              }

              (targetElement as HTMLElement).focus();

              const dragEnterEvent = new DragEvent('dragenter', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement!.dispatchEvent(dragEnterEvent);

              const dragOverEvent = new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement!.dispatchEvent(dragOverEvent);

              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX + window.screenX,
                screenY: dropY + window.screenY
              });
              targetElement!.dispatchEvent(dropEvent);

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

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        ...(uploadResult[0].result as any),
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

// =============================================================================
// GIF Frame Storage (Ce) - singleton class for managing GIF recording frames
// =============================================================================

interface GifFrameData {
  base64: string;
  action?: { type: string; [key: string]: any };
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
}

interface GifGroupData {
  frames: GifFrameData[];
  lastUpdated: number;
}

const gifFrameStorage = new (class GifFrameStorage {
  storage: Map<number, GifGroupData> = new Map();
  recordingGroups: Set<number> = new Set();

  addFrame(groupId: number, frame: GifFrameData): void {
    if (!this.storage.has(groupId)) {
      this.storage.set(groupId, { frames: [], lastUpdated: Date.now() });
    }
    const group = this.storage.get(groupId)!;
    group.frames.push(frame);
    group.lastUpdated = Date.now();
    if (group.frames.length > 50) {
      group.frames.shift();
    }
  }

  getFrames(groupId: number): GifFrameData[] {
    return this.storage.get(groupId)?.frames ?? [];
  }

  clearFrames(groupId: number): void {
    this.storage.get(groupId)?.frames.length; // side effect from original
    this.storage.delete(groupId);
    this.recordingGroups.delete(groupId);
  }

  getFrameCount(groupId: number): number {
    return this.storage.get(groupId)?.frames.length ?? 0;
  }

  getActiveGroupIds(): number[] {
    return Array.from(this.storage.keys());
  }

  startRecording(groupId: number): void {
    this.recordingGroups.add(groupId);
  }

  stopRecording(groupId: number): void {
    this.recordingGroups.delete(groupId);
  }

  isRecording(groupId: number): boolean {
    return this.recordingGroups.has(groupId);
  }

  getRecordingGroupIds(): number[] {
    return Array.from(this.recordingGroups);
  }

  clearAll(): void {
    Array.from(this.storage.values()).reduce((acc, group) => acc + group.frames.length, 0); // side effect from original
    this.storage.clear();
    this.recordingGroups.clear();
  }
})();

// =============================================================================
// GIF delay helper (Me)
// =============================================================================

function getGifFrameDelay(actionType: string): number {
  const delays: Record<string, number> = {
    wait: 300,
    screenshot: 300,
    navigate: 800,
    scroll: 800,
    scroll_to: 800,
    type: 800,
    key: 800,
    zoom: 800,
    left_click: 1500,
    right_click: 1500,
    double_click: 1500,
    triple_click: 1500,
    left_click_drag: 1500
  };
  return delays[actionType] ?? 800;
}

// =============================================================================
// Tool: gif_creator (Ae)
// =============================================================================

const gifCreatorTool: ToolDefinition = {
  name: 'gif_creator',
  description:
    "Manage GIF recording and export for browser automation sessions. Control when to start/stop recording browser actions (clicks, scrolls, navigation), then export as an animated GIF with visual overlays (click indicators, action labels, progress bar, watermark). All operations are scoped to the tab's group. When starting recording, take a screenshot immediately after to capture the initial state as the first frame. When stopping recording, take a screenshot immediately before to capture the final state as the last frame. For export, either provide 'coordinate' to drag/drop upload to a page element, or set 'download: true' to download the GIF.",
  parameters: {
    action: {
      type: 'string',
      description:
        "Action to perform: 'start_recording' (begin capturing), 'stop_recording' (stop capturing but keep frames), 'export' (generate and export GIF), 'clear' (discard frames)"
    },
    tabId: {
      type: 'number',
      description: 'Tab ID to identify which tab group this operation applies to'
    },
    coordinate: {
      type: 'array',
      description:
        "Viewport coordinates [x, y] for drag & drop upload. Required for 'export' action unless 'download' is true."
    },
    download: {
      type: 'boolean',
      description:
        "If true, download the GIF instead of drag/drop upload. For 'export' action only."
    },
    filename: {
      type: 'string',
      description:
        "Optional filename for exported GIF (default: 'recording-[timestamp].gif'). For 'export' action only."
    },
    options: {
      type: 'object',
      description: "Optional GIF enhancement options for 'export' action. All default to true."
    }
  },
  execute: async (input: any, context: ToolContext): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.action) throw new Error('action parameter is required');
      if (!context?.tabId) throw new Error('No active tab found in context');

      const tab = await chrome.tabs.get(params.tabId);
      if (!tab) throw new Error(`Tab ${params.tabId} not found`);
      const groupId = tab.groupId ?? -1;

      // For MCP native sessions, verify tab is in the MCP tab group
      if (context.sessionId === MCP_NATIVE_SESSION) {
        const stored = await chrome.storage.local.get(StorageKeys.MCP_TAB_GROUP_ID);
        if (groupId !== stored[StorageKeys.MCP_TAB_GROUP_ID]) {
          return {
            error: `Tab ${params.tabId} is not in the MCP tab group. GIF recording only works for tabs within the MCP tab group.`
          };
        }
      }

      switch (params.action) {
        case 'start_recording':
          return await (async function startRecording(gid: number) {
            const isAlreadyRecording = gifFrameStorage.isRecording(gid);
            if (isAlreadyRecording) {
              return {
                output:
                  "Recording is already active for this tab group. Use 'stop_recording' to stop or 'export' to generate GIF."
              };
            }
            gifFrameStorage.clearFrames(gid);
            gifFrameStorage.startRecording(gid);
            return {
              output:
                'Started recording browser actions for this tab group. All computer and navigate tool actions will now be captured (max 50 frames). Previous frames cleared.'
            };
          })(groupId);

        case 'stop_recording':
          return await (async function stopRecording(gid: number) {
            const isRecording = gifFrameStorage.isRecording(gid);
            if (!isRecording) {
              return {
                output:
                  "Recording is not active for this tab group. Use 'start_recording' to begin capturing."
              };
            }
            gifFrameStorage.stopRecording(gid);
            const frameCount = gifFrameStorage.getFrameCount(gid);
            return {
              output: `Stopped recording for this tab group. Captured ${frameCount} frame${1 === frameCount ? '' : 's'}. Use 'export' to generate GIF or 'clear' to discard.`
            };
          })(groupId);

        case 'export':
          return await (async function exportGif(
            exportParams: any,
            exportTab: chrome.tabs.Tab,
            gid: number,
            ctx: ToolContext
          ) {
            const isDownload = true === exportParams.download;
            if (
              !(isDownload || (exportParams.coordinate && 2 === exportParams.coordinate.length))
            ) {
              throw new Error(
                'coordinate parameter is required for export action (or set download: true to download the GIF)'
              );
            }
            if (!exportTab.id || !exportTab.url) throw new Error('Tab has no ID or URL');

            const frames = gifFrameStorage.getFrames(gid);
            if (0 === frames.length) {
              return {
                error:
                  "No frames recorded for this tab group. Use 'start_recording' and perform browser actions first."
              };
            }

            // Permission check for non-download exports
            if (!isDownload) {
              const exportUrl = exportTab.url!;
              const exportToolUseId = ctx?.toolUseId;
              const exportPermission = await ctx.permissionManager.checkPermission(
                exportUrl,
                exportToolUseId
              );
              if (!exportPermission.allowed) {
                if (exportPermission.needsPrompt) {
                  return {
                    type: 'permission_required',
                    tool: PermissionTools.UPLOAD_IMAGE,
                    url: exportUrl,
                    toolUseId: exportToolUseId,
                    actionData: { coordinate: exportParams.coordinate }
                  };
                }
                return { error: 'Permission denied for uploading to this domain' };
              }
            }

            const tabUrl = exportTab.url!;

            // Ensure offscreen document exists
            const contexts = await chrome.runtime.getContexts({
              contextTypes: ['OFFSCREEN_DOCUMENT' as any]
            });
            if (0 === contexts.length) {
              await (chrome as any).offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['BLOBS'],
                justification: 'Generate animated GIF from screenshots'
              });
              await new Promise((resolve) => setTimeout(resolve, 200));
            }

            const frameData = frames.map((frame) => ({
              base64: frame.base64,
              format: 'png',
              action: frame.action,
              delay: frame.action ? getGifFrameDelay(frame.action.type) : 800,
              viewportWidth: frame.viewportWidth,
              viewportHeight: frame.viewportHeight,
              devicePixelRatio: frame.devicePixelRatio
            }));

            const gifOptions = {
              showClickIndicators: exportParams.options?.showClickIndicators ?? true,
              showDragPaths: exportParams.options?.showDragPaths ?? true,
              showActionLabels: exportParams.options?.showActionLabels ?? true,
              showProgressBar: exportParams.options?.showProgressBar ?? true,
              showWatermark: exportParams.options?.showWatermark ?? true,
              quality: exportParams.options?.quality ?? 10
            };

            const gifResult = await new Promise<any>((resolve, reject) => {
              chrome.runtime.sendMessage(
                { type: 'GENERATE_GIF', frames: frameData, options: gifOptions },
                (response: any) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (response && response.success) {
                    resolve(response.result);
                  } else {
                    reject(new Error(response?.error || 'Unknown error from offscreen'));
                  }
                }
              );
            });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const gifFilename = exportParams.filename || `recording-${timestamp}.gif`;

            let outputMessage: string;

            if (isDownload) {
              await chrome.downloads.download({
                url: gifResult.blobUrl,
                filename: gifFilename,
                saveAs: false
              });
              outputMessage = `Successfully exported GIF with ${frames.length} frames. Downloaded "${gifFilename}" (${Math.round(gifResult.size / 1024)}KB). Dimensions: ${gifResult.width}x${gifResult.height}. Recording cleared.`;
            } else {
              const securityCheck = await checkUrlSecurity(
                exportTab.id!,
                tabUrl,
                'GIF export upload action'
              );
              if (securityCheck) return securityCheck;

              const dropResult = await chrome.scripting.executeScript({
                target: { tabId: exportTab.id! },
                func: (base64: string, filename: string, x: number, y: number) => {
                  const binaryString = atob(base64);
                  const bytes = new Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++)
                    bytes[i] = binaryString.charCodeAt(i);
                  const uint8Array = new Uint8Array(bytes);
                  const blob = new Blob([uint8Array], { type: 'image/gif' });
                  const file = new File([blob], filename, {
                    type: 'image/gif',
                    lastModified: Date.now()
                  });
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);

                  const element = document.elementFromPoint(x, y);
                  if (!element) throw new Error(`No element found at coordinates (${x}, ${y})`);

                  element.dispatchEvent(
                    new DragEvent('dragenter', {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer,
                      clientX: x,
                      clientY: y
                    })
                  );
                  element.dispatchEvent(
                    new DragEvent('dragover', {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer,
                      clientX: x,
                      clientY: y
                    })
                  );
                  element.dispatchEvent(
                    new DragEvent('drop', {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer,
                      clientX: x,
                      clientY: y
                    })
                  );

                  return {
                    output: `Successfully dropped ${filename} (${Math.round(blob.size / 1024)}KB) at (${x}, ${y})`
                  };
                },
                args: [
                  gifResult.base64,
                  gifFilename,
                  exportParams.coordinate[0],
                  exportParams.coordinate[1]
                ]
              });

              if (!dropResult || !dropResult[0]?.result)
                throw new Error('Failed to upload GIF to page');

              outputMessage = `Successfully exported GIF with ${frames.length} frames. ${(dropResult[0].result as any).output}. Dimensions: ${gifResult.width}x${gifResult.height}. Recording cleared.`;
            }

            gifFrameStorage.clearFrames(gid);
            const validTabs = await tabGroupManager.getValidTabsWithMetadata(ctx.tabId!);
            return {
              output: outputMessage,
              tabContext: {
                currentTabId: ctx.tabId,
                executedOnTabId: exportTab.id,
                availableTabs: validTabs,
                tabCount: validTabs.length
              }
            };
          })(params, tab, groupId, context);

        case 'clear':
          return await (async function clearFrames(gid: number) {
            const count = gifFrameStorage.getFrameCount(gid);
            if (0 === count) {
              return { output: 'No frames to clear for this tab group.' };
            }
            gifFrameStorage.clearFrames(gid);
            return {
              output: `Cleared ${count} frame${1 === count ? '' : 's'} for this tab group. Recording stopped.`
            };
          })(groupId);

        default:
          throw new Error(
            `Unknown action: ${params.action}. Must be one of: start_recording, stop_recording, export, clear`
          );
      }
    } catch (err) {
      return {
        error: `Failed to execute gif_creator: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'gif_creator',
    description:
      "Manage GIF recording and export for browser automation sessions. Control when to start/stop recording browser actions (clicks, scrolls, navigation), then export as an animated GIF with visual overlays (click indicators, action labels, progress bar, watermark). All operations are scoped to the tab's group. When starting recording, take a screenshot immediately after to capture the initial state as the first frame. When stopping recording, take a screenshot immediately before to capture the final state as the last frame. For export, either provide 'coordinate' to drag/drop upload to a page element, or set 'download: true' to download the GIF.",
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start_recording', 'stop_recording', 'export', 'clear'],
          description:
            "Action to perform: 'start_recording' (begin capturing), 'stop_recording' (stop capturing but keep frames), 'export' (generate and export GIF), 'clear' (discard frames)"
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to identify which tab group this operation applies to'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description:
            "Viewport coordinates [x, y] for drag & drop upload. Required for 'export' action unless 'download' is true."
        },
        download: {
          type: 'boolean',
          description:
            "If true, download the GIF instead of drag/drop upload. For 'export' action only."
        },
        filename: {
          type: 'string',
          description:
            "Optional filename for exported GIF (default: 'recording-[timestamp].gif'). For 'export' action only."
        },
        options: {
          type: 'object',
          description:
            "Optional GIF enhancement options for 'export' action. Properties: showClickIndicators (bool), showDragPaths (bool), showActionLabels (bool), showProgressBar (bool), showWatermark (bool), quality (number 1-30). All default to true except quality (default: 10).",
          properties: {
            showClickIndicators: {
              type: 'boolean',
              description: 'Show orange circles at click locations (default: true)'
            },
            showDragPaths: {
              type: 'boolean',
              description: 'Show red arrows for drag actions (default: true)'
            },
            showActionLabels: {
              type: 'boolean',
              description: 'Show black labels describing actions (default: true)'
            },
            showProgressBar: {
              type: 'boolean',
              description: 'Show orange progress bar at bottom (default: true)'
            },
            showWatermark: {
              type: 'boolean',
              description: 'Show SuperDuck logo watermark (default: true)'
            },
            quality: {
              type: 'number',
              description:
                'GIF compression quality, 1-30 (lower = better quality, slower encoding). Default: 10'
            }
          }
        }
      },
      required: ['action', 'tabId']
    }
  })
};

export { fileUploadTool, uploadImageTool, gifCreatorTool };
