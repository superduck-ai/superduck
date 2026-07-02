import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import type { ToolContext, ToolDefinition, ToolResult } from '../pageTools';
import { gifFrameStorage, getGifFrameDelay } from './gifFrameStorage';
import type { GifCreatorToolInput, GifGenerationResult } from './types';
import { isScriptOutputResult } from './types';

export const gifCreatorTool: ToolDefinition<GifCreatorToolInput> = {
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
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.action) throw new Error('action parameter is required');
      if (!context?.tabId) throw new Error('No active tab found in context');

      const tab = await chrome.tabs.get(params.tabId);
      if (!tab) throw new Error(`Tab ${params.tabId} not found`);
      const groupId = tab.groupId ?? -1;

      if (context.browserSessionScope) {
        const isManaged = await tabGroupManager.isInGroup(params.tabId);
        if (!isManaged) {
          return {
            error: `Tab ${params.tabId} is not in a managed tab group. GIF recording only works for tabs within a SuperDuck tab group.`
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
            exportParams: GifCreatorToolInput,
            exportTab: chrome.tabs.Tab,
            gid: number,
            ctx: ToolContext
          ) {
            const contextTabId = ctx.tabId;
            if (!contextTabId) throw new Error('No active tab found');
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

            const contexts = await chrome.runtime.getContexts({
              contextTypes: ['OFFSCREEN_DOCUMENT']
            });
            if (0 === contexts.length) {
              if (!chrome.offscreen) throw new Error('Offscreen API is unavailable');
              await chrome.offscreen.createDocument({
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

            const gifResult = await new Promise<GifGenerationResult>((resolve, reject) => {
              chrome.runtime.sendMessage(
                { type: 'GENERATE_GIF', frames: frameData, options: gifOptions },
                (
                  response:
                    | { success?: boolean; result?: GifGenerationResult; error?: string }
                    | undefined
                ) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (response?.success && response.result) {
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
              const dropCoordinate = exportParams.coordinate;
              if (!dropCoordinate || dropCoordinate.length !== 2) {
                throw new Error('coordinate parameter is required for export upload');
              }
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
                args: [gifResult.base64, gifFilename, dropCoordinate[0], dropCoordinate[1]]
              });

              if (!dropResult || !dropResult[0]?.result)
                throw new Error('Failed to upload GIF to page');

              const dropOutput = dropResult[0].result;
              if (!isScriptOutputResult(dropOutput) || typeof dropOutput.output !== 'string') {
                throw new Error('Unexpected response while dropping GIF onto page');
              }
              outputMessage = `Successfully exported GIF with ${frames.length} frames. ${dropOutput.output}. Dimensions: ${gifResult.width}x${gifResult.height}. Recording cleared.`;
            }

            gifFrameStorage.clearFrames(gid);
            const validTabs = await tabGroupManager.getValidTabsWithMetadata(contextTabId);
            return {
              output: outputMessage,
              tabContext: {
                currentTabId: contextTabId,
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
