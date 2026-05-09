import React, { useCallback, useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { AnimatePresence, motion } from "framer-motion";
import { DEFAULT_MODEL } from '../constants/models';
import { PROMPT_TEMPLATES, WORKFLOW_INPUT_PREFIX, type SupportedLocale } from "./prompts";
import {
  apiClient,
  getStorageValue,
  setStorageValue,
  StorageKeys,
} from "../SavedPromptsService";
import {
  base64ToBlob,
  blobToDataUrl,
  dataUrlToBlob,
  extractBase64FromDataUrl,
} from "../mcpServersStore";
import { isChineseLocale } from "../utils/locale";

// -----------------------------------------------------------------------------
// Account settings
// -----------------------------------------------------------------------------

export interface AccountSettings {
  enabled_mcp_tools?: Record<string, boolean>;
  [key: string]: unknown;
}

export function useAccountSettingsQuery(enabled = true) {
  return useQuery<AccountSettings>({
    queryKey: ["account-settings"],
    queryFn: async () =>
      apiClient.fetch("/api/oauth/account/settings", {
        headers: { "anthropic-beta": "oauth-2025-04-20" },
      }),
    enabled,
  });
}

export async function updateAccountSettings(payload: Record<string, unknown>) {
  return apiClient.fetch("/api/oauth/account/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
    body: JSON.stringify(payload),
  });
}

export function useMcpToolToggles() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await updateAccountSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  const toggleMcpToolEnabled = useCallback(
    (toolKeys: string | string[], enabled: boolean) => {
      const keys = Array.isArray(toolKeys) ? toolKeys : [toolKeys];
      const updates: Record<string, boolean> = {};
      for (const key of keys) updates[key] = enabled;

      // Optimistic update
      queryClient.setQueryData<AccountSettings | undefined>(
        ["account-settings"],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            enabled_mcp_tools: {
              ...(prev.enabled_mcp_tools ?? {}),
              ...updates,
            },
          };
        }
      );

      mutation.mutate({ enabled_mcp_tools: updates });
    },
    [mutation, queryClient]
  );

  return { toggleMcpToolEnabled };
}

// -----------------------------------------------------------------------------
// Model helpers
// -----------------------------------------------------------------------------

const FAST_MODEL_TAG_PATTERN = /^(.+)\[fast\]$/;

export function parseModelTag(model: string): {
  baseModel: string;
  hasFastTag: boolean;
} {
  const match = model.match(FAST_MODEL_TAG_PATTERN);
  return { baseModel: match ? match[1] : model, hasFastTag: Boolean(match) };
}

export function getBaseModel(model: string): string {
  return parseModelTag(model).baseModel;
}

function getStickyModelStorageKey(isQuickMode: boolean): StorageKeys {
  return isQuickMode
    ? StorageKeys.SELECTED_MODEL_QUICK_MODE
    : StorageKeys.SELECTED_MODEL;
}

export interface ModelOptionLike {
  model: string;
}

export function useStickyModelSelection() {
  const loadStickyModel = useCallback(
    async (
      availableModels: ModelOptionLike[],
      isQuickMode = false
    ): Promise<string | null> => {
      try {
        const storageKey = getStickyModelStorageKey(isQuickMode);
        const stored = await getStorageValue(storageKey);
        if (!stored) return null;

        const exists = availableModels.some((entry) => entry.model === stored);
        if (!exists) return null;

        // In normal mode, avoid using a quick-mode tagged model as sticky default.
        if (!isQuickMode && parseModelTag(stored).hasFastTag) return null;

        return stored;
      } catch {
        return null;
      }
    },
    []
  );

  const setStickyModel = useCallback(
    async (model: string | null, isQuickMode = false): Promise<void> => {
      try {
        const storageKey = getStickyModelStorageKey(isQuickMode);
        await setStorageValue(storageKey, model);
      } catch {
        // noop
      }
    },
    []
  );

  return { loadStickyModel, setStickyModel };
}

// -----------------------------------------------------------------------------
// Screenshot capture
// -----------------------------------------------------------------------------

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CapturedScreenshotAttachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  isAnnotated?: boolean;
}

class ScreenshotCaptureManager {
  private static instance: ScreenshotCaptureManager | null = null;

  static getInstance(): ScreenshotCaptureManager {
    if (!ScreenshotCaptureManager.instance) {
      ScreenshotCaptureManager.instance = new ScreenshotCaptureManager();
    }
    return ScreenshotCaptureManager.instance;
  }

  async captureVisibleTab(tabId?: number, forceTabActivation = true): Promise<string> {
    try {
      let targetWindowId: number | undefined;
      let resolvedTabId: number | undefined;

      if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        resolvedTabId = tab.id;
        targetWindowId = tab.windowId;

        if (!tab.active && resolvedTabId && forceTabActivation) {
          await chrome.tabs.update(resolvedTabId, { active: true });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await chrome.tabs.get(resolvedTabId);
        }
      } else {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab.id;
        targetWindowId = activeTab.windowId;
      }

      if (!targetWindowId) {
        throw new Error("No active window found");
      }

      const targetWindow = await chrome.windows.get(targetWindowId);
      if (!targetWindow.focused) {
        await chrome.windows.update(targetWindowId, { focused: true });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return await chrome.tabs.captureVisibleTab(targetWindowId, { format: "png" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot access")) {
        throw new Error(
          "Cannot capture screenshot: Tab might be on a restricted page (chrome://, chrome-extension://, etc.)"
        );
      }
      throw error;
    }
  }

  async captureRegion(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const croppedBlob = await this.cropImage(screenshotBlob, region);
    return blobToDataUrl(croppedBlob);
  }

  async captureWithAnnotation(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const annotatedBlob = await this.addAnnotationOutline(screenshotBlob, region);
    return blobToDataUrl(annotatedBlob);
  }

  private async cropImage(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = region.width;
        canvas.height = region.height;
        context.drawImage(
          image,
          region.x * dpr,
          region.y * dpr,
          region.width * dpr,
          region.height * dpr,
          0,
          0,
          region.width,
          region.height
        );

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob from canvas"));
        }, "image/png");
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };

      image.src = objectUrl;
    });
  }

  private async addAnnotationOutline(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);

        const viewportWidth = region.viewportWidth || image.width;
        const viewportHeight = region.viewportHeight || image.height;
        const scaleX = image.width / viewportWidth;
        const scaleY = image.height / viewportHeight;

        const x = region.x * scaleX;
        const y = region.y * scaleY;
        const width = region.width * scaleX;
        const height = region.height * scaleY;

        context.imageSmoothingEnabled = false;
        const accent = "#2D87D6";
        const scale = (scaleX + scaleY) / 2;

        context.shadowColor = accent;
        context.shadowBlur = 8 * scale;
        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 0.6;
        context.strokeRect(x, y, width, height);

        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.strokeStyle = "#FFFFFF";
        context.lineWidth = 4.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob from canvas"));
        }, "image/png");
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };

      image.src = objectUrl;
    });
  }

  async injectSelectionOverlay(
    tabId: number,
    instructionText = "Click to capture screen or drag to select an area"
  ): Promise<ScreenshotRegion | null> {
    return new Promise((resolve) => {
      const onMessage = (
        message: any,
        sender: chrome.runtime.MessageSender
      ) => {
        if (sender.tab?.id === tabId && message.type === "SCREENSHOT_SELECTION") {
          chrome.runtime.onMessage.removeListener(onMessage);
          if (message.cancelled) {
            resolve(null);
            return;
          }

          if (message.fullPage) {
            resolve({ x: 0, y: 0, width: -1, height: -1 });
            return;
          }

          resolve(message.region as ScreenshotRegion);
          return;
        }

        if (message.type === "CANCEL_SCREENSHOT_OVERLAY") {
          chrome.runtime.onMessage.removeListener(onMessage);
          resolve(null);
        }
      };

      chrome.runtime.onMessage.addListener(onMessage);

      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(null);
      }, 60_000);

      chrome.scripting.executeScript(
        {
          target: { tabId },
          args: [instructionText],
          func: (text: string) => {
            const existing = document.getElementById("superduck-screenshot-overlay");
            if (existing) existing.remove();

            const overlay = document.createElement("div");
            overlay.id = "superduck-screenshot-overlay";
            overlay.style.cssText = [
              "position: fixed",
              "top: 0",
              "left: 0",
              "width: 100vw",
              "height: 100vh",
              "background: transparent",
              "z-index: 2147483647",
              "cursor: crosshair",
              "user-select: none",
              "outline: none",
            ].join(";");
            overlay.setAttribute("tabindex", "0");

            const hint = document.createElement("div");
            hint.style.cssText = [
              "position: absolute",
              "top: 50%",
              "left: 50%",
              "transform: translate(-50%, -50%)",
              "background: rgba(0, 0, 0, 0.8)",
              "color: white",
              "padding: 12px 24px",
              "border-radius: 8px",
              "font-family: system-ui, -apple-system, sans-serif",
              "font-size: 16px",
              "z-index: 4",
              "display: flex",
              "align-items: center",
              "gap: 12px",
              "pointer-events: none",
              "white-space: nowrap",
              "max-width: 90vw",
            ].join(";");

            const label = document.createElement("span");
            label.textContent = text;
            label.style.cssText = [
              "pointer-events: none",
              "white-space: nowrap",
              "overflow: hidden",
              "text-overflow: ellipsis",
            ].join(";");

            hint.appendChild(label);
            overlay.appendChild(hint);

            const shadeTop = document.createElement("div");
            const shadeBottom = document.createElement("div");
            const shadeLeft = document.createElement("div");
            const shadeRight = document.createElement("div");
            const selection = document.createElement("div");

            selection.style.cssText = [
              "position: absolute",
              "border: 1px dashed hsl(210, 70.9%, 51.6%)",
              "background: transparent",
              "pointer-events: none",
              "display: none",
              "z-index: 3",
            ].join(";");

            const shadeBase = [
              "position: absolute",
              "background: rgba(0, 0, 0, 0.3)",
              "pointer-events: none",
              "z-index: 2",
            ].join(";");

            shadeTop.style.cssText = `${shadeBase};top:0;left:0;width:100%;height:100%`;
            shadeBottom.style.cssText = `${shadeBase};bottom:0;left:0;width:100%;height:0;display:none`;
            shadeLeft.style.cssText = `${shadeBase};top:0;left:0;width:0;height:100%;display:none`;
            shadeRight.style.cssText = `${shadeBase};top:0;right:0;width:0;height:100%;display:none`;

            overlay.appendChild(shadeTop);
            overlay.appendChild(shadeBottom);
            overlay.appendChild(shadeLeft);
            overlay.appendChild(shadeRight);
            overlay.appendChild(selection);

            let startX = 0;
            let startY = 0;
            let isDragging = false;

            overlay.onmousedown = (event: MouseEvent) => {
              if (event.button !== 0) return;

              isDragging = true;
              startX = event.clientX;
              startY = event.clientY;

              selection.style.display = "block";
              selection.style.left = `${startX}px`;
              selection.style.top = `${startY}px`;
              selection.style.width = "0";
              selection.style.height = "0";

              hint.style.display = "none";

              shadeTop.style.height = `${startY}px`;
              shadeBottom.style.display = "block";
              shadeBottom.style.height = `${window.innerHeight - startY}px`;

              shadeLeft.style.display = "block";
              shadeLeft.style.width = `${startX}px`;
              shadeLeft.style.top = `${startY}px`;
              shadeLeft.style.height = "0";

              shadeRight.style.display = "block";
              shadeRight.style.width = `${window.innerWidth - startX}px`;
              shadeRight.style.top = `${startY}px`;
              shadeRight.style.height = "0";
            };

            overlay.onmousemove = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;
              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.left = `${x}px`;
              selection.style.top = `${y}px`;
              selection.style.width = `${width}px`;
              selection.style.height = `${height}px`;

              shadeTop.style.height = `${y}px`;
              shadeBottom.style.height = `${window.innerHeight - (y + height)}px`;
              shadeLeft.style.width = `${x}px`;
              shadeLeft.style.top = `${y}px`;
              shadeLeft.style.height = `${height}px`;
              shadeRight.style.width = `${window.innerWidth - (x + width)}px`;
              shadeRight.style.top = `${y}px`;
              shadeRight.style.height = `${height}px`;
            };

            overlay.onmouseup = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;

              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.display = "none";
              shadeTop.style.display = "none";
              shadeBottom.style.display = "none";
              shadeLeft.style.display = "none";
              shadeRight.style.display = "none";
              hint.style.display = "none";

              setTimeout(() => {
                if (width > 10 && height > 10) {
                  chrome.runtime.sendMessage({
                    type: "SCREENSHOT_SELECTION",
                    region: {
                      x,
                      y,
                      width,
                      height,
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight,
                    },
                  });
                } else {
                  chrome.runtime.sendMessage({
                    type: "SCREENSHOT_SELECTION",
                    fullPage: true,
                  });
                }
                overlay.remove();
              }, 10);
            };

            overlay.onkeydown = (event: KeyboardEvent) => {
              if (event.key !== "Escape") return;

              chrome.runtime.sendMessage({
                type: "SCREENSHOT_SELECTION",
                cancelled: true,
              });
              overlay.remove();
            };

            document.body.appendChild(overlay);
            overlay.focus();
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            chrome.runtime.onMessage.removeListener(onMessage);
            resolve(null);
          }
        }
      );
    });
  }
}

const screenshotCaptureManager = ScreenshotCaptureManager.getInstance();

interface ScreenshotCaptureParams {
  tabId?: number;
  onCapture: (attachment: CapturedScreenshotAttachment) => void;
  forceTabActivation?: boolean;
}

export function useScreenshotCapture({
  tabId,
  onCapture,
  forceTabActivation = true,
}: ScreenshotCaptureParams) {
  const intl = useIntl();
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelCapture, setCancelCapture] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCapturing && cancelCapture) {
        event.preventDefault();
        event.stopPropagation();
        cancelCapture();
        setCancelCapture(null);
      }
    };

    if (isCapturing) {
      document.addEventListener("keydown", handleEscape, true);
      window.addEventListener("keydown", handleEscape, true);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [cancelCapture, isCapturing]);

  const capture = useCallback(
    async (withSelection = true) => {
      if (isCapturing) return;

      setIsCapturing(true);
      setError(null);

      let wasCancelled = false;
      const cancel = () => {
        wasCancelled = true;
        setIsCapturing(false);

        if (tabId) {
          chrome.runtime.sendMessage({ type: "CANCEL_SCREENSHOT_OVERLAY" }).catch(() => {});
          chrome.scripting
            .executeScript({
              target: { tabId },
              func: () => {
                const overlay = document.getElementById("superduck-screenshot-overlay");
                if (overlay) overlay.remove();
              },
            })
            .catch(() => {});
        }
      };

      setCancelCapture(() => cancel);

      try {
        let screenshotDataUrl: string;
        let isAnnotated = false;

        if (withSelection && tabId) {
          const overlayText = intl.formatMessage({
            defaultMessage: "Click to capture screen or drag to select an area",
            id: "jbEJHKa0PR",
          });

          const region = await screenshotCaptureManager.injectSelectionOverlay(tabId, overlayText);
          if (wasCancelled) return;
          if (!region) return;

          if (region.width === -1 && region.height === -1) {
            screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
              tabId,
              forceTabActivation
            );
          } else {
            screenshotDataUrl = await screenshotCaptureManager.captureWithAnnotation(
              tabId,
              region,
              forceTabActivation
            );
            isAnnotated = true;
          }
        } else {
          screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
            tabId,
            forceTabActivation
          );
        }

        if (wasCancelled) return;

        const base64 = extractBase64FromDataUrl(screenshotDataUrl);
        const blob = base64ToBlob(base64, "image/png");
        const fileName = `screenshot-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        onCapture({
          id: crypto.randomUUID(),
          file,
          base64,
          url: screenshotDataUrl,
          isAnnotated,
        });
      } catch {
        setError("Failed to capture screenshot");
      } finally {
        setIsCapturing(false);
        setCancelCapture(null);
      }
    },
    [forceTabActivation, intl, isCapturing, onCapture, tabId]
  );

  const captureFullScreen = useCallback(() => capture(false), [capture]);
  const captureSelection = useCallback(() => capture(true), [capture]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || !isCapturing || !tabId) return;

      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            const overlay = document.getElementById("superduck-screenshot-overlay");
            if (overlay) overlay.remove();
          },
        })
        .catch(() => {});

      setIsCapturing(false);
      setCancelCapture(null);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (isCapturing && tabId) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              const overlay = document.getElementById("superduck-screenshot-overlay");
              if (overlay) overlay.remove();
            },
          })
          .catch(() => {});
      }
    };
  }, [isCapturing, tabId]);

  return {
    isCapturing,
    error,
    captureFullScreen,
    captureSelection,
  };
}

// -----------------------------------------------------------------------------
// Conversation list API
// -----------------------------------------------------------------------------

export interface ChatConversationListParams {
  limit?: number;
  offset?: number;
  searchQuery?: string;
  platforms?: string[];
}

export async function fetchChatConversations(params: ChatConversationListParams) {
  const query = new URLSearchParams();

  if (params.limit) query.append("limit", params.limit.toString());
  if (params.offset) query.append("offset", params.offset.toString());
  if (params.searchQuery) query.append("searchQuery", params.searchQuery);
  if (params.platforms) {
    params.platforms.forEach((platform) => query.append("platforms", platform));
  }

  const path = `/api/oauth/chat_conversations${query.toString() ? `?${query.toString()}` : ""}`;
  return apiClient.fetch(path, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteChatConversation(params: { conversationUuid: string }) {
  await apiClient.fetch(`/api/oauth/chat_conversations/${params.conversationUuid}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------------
// Generation helpers for workflow/session UX
// -----------------------------------------------------------------------------

export type AssistantRole = "user" | "assistant";

export interface ModelTextBlock {
  type: string;
  text?: string;
}

export interface ModelResult {
  content?: ModelTextBlock[];
}

export interface ModelRequest {
  maxTokens?: number;
  messages: Array<{ role: AssistantRole; content: any }>;
  system?: string;
  modelClass?: "small_fast" | string;
  model?: string;
}

export type ModelInvoker = (request: ModelRequest) => Promise<ModelResult>;

function readTextBlocks(response: ModelResult): string {
  if (!response.content || response.content.length === 0) return "";
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function parseTaggedValue(text: string, tag: string): string {
  const fullTagMatch = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  if (fullTagMatch?.[1]) return fullTagMatch[1].trim();

  const partialTagMatch = text.match(new RegExp(`^(.*?)</${tag}>`, "s"));
  if (partialTagMatch?.[1]) return partialTagMatch[1].trim();

  return "";
}

export async function generateConversationTitle(
  message: { content: string | Array<{ type: string; text?: string }> },
  invoke: ModelInvoker,
  locale: SupportedLocale = "en-US"
): Promise<string> {
  try {
    const inputText =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((item) => item.type === "text")
              .map((item) => item.text ?? "")
              .join("\n")
          : "";

    if (!inputText.trim()) return "";

    const templates = PROMPT_TEMPLATES[locale].conversationTitle;
    const result = await invoke({
      maxTokens: 128,
      messages: [
        { role: "user", content: templates.user(inputText) },
      ],
      system: templates.system,
      modelClass: "small_fast",
    });

    return parseTaggedValue(readTextBlocks(result), "title");
  } catch {
    return "";
  }
}

export async function generateShortcutName(
  prompt: string,
  invoke: ModelInvoker,
  locale: SupportedLocale = "en-US"
): Promise<string> {
  try {
    if (!prompt.trim()) return "";

    const templates = PROMPT_TEMPLATES[locale].shortcutName;
    const result = await invoke({
      maxTokens: 64,
      messages: [
        {
          role: "user",
          content: templates.user(prompt),
        },
        {
          role: "assistant",
          content: templates.assistant,
        },
      ],
      system: templates.system,
      modelClass: "small_fast",
    });

    const name = parseTaggedValue(readTextBlocks(result), "name");
    if (locale === "zh-CN") {
      // Keep Chinese characters, letters, numbers, and hyphens
      return name.trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9-]/g, "");
    }
    // For English, use lowercase kebab-case
    return name.toLowerCase().replace(/[^a-z0-9-]/g, "");
  } catch {
    return "";
  }
}

export async function generateQuote(invoke: ModelInvoker): Promise<string> {
  try {
    const result = await invoke({
      maxTokens: 150,
      messages: [
        {
          role: "user",
          content:
            "Generate a very short fortune cookie style quote (5-10 words max, one sentence). Be whimsical, diverse, and unexpectedly wise.",
        },
      ],
      system:
        "Generate short whimsical quotes that are playful, memorable, and concise.",
      modelClass: "small_fast",
    });

    return readTextBlocks(result);
  } catch {
    return "";
  }
}

export async function generateDailySummary(
  titles: string[],
  invoke: ModelInvoker,
  locale: SupportedLocale = "en-US"
): Promise<string> {
  try {
    if (titles.length === 0) return "";

    const deduped = Array.from(new Set(titles.map((title) => title.toLowerCase())))
      .map((normalized) => titles.find((title) => title.toLowerCase() === normalized))
      .filter((title): title is string => Boolean(title));

    const titleList = deduped.map((title, index) => `${index + 1}. ${title}`).join("\n");
    const templates = PROMPT_TEMPLATES[locale].dailySummary;

    const result = await invoke({
      maxTokens: 200,
      messages: [
        {
          role: "user",
          content: templates.user(titleList),
        },
      ],
      system: templates.system,
      modelClass: "small_fast",
    });

    const text = readTextBlocks(result);
    if (!text) return "";

    const lowered = text.toLowerCase();
    if (
      text === "SKIP" ||
      lowered.includes("skip") ||
      lowered.includes("insufficient") ||
      lowered.includes("not enough information") ||
      lowered.includes("unable to")
    ) {
      return "";
    }

    return text;
  } catch {
    return "";
  }
}

export interface WorkflowStepDescriptionInput {
  action?: string;
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  pageTitle?: string;
  url?: string;
  screenshot?: string;
  speechTranscript?: string;
}

export function detectImageMediaType(base64: string):
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif" {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

export async function generateWorkflowStepDescription(
  step: WorkflowStepDescriptionInput,
  userActionText: string,
  invoke: ModelInvoker,
  locale: SupportedLocale = "en-US"
): Promise<string> {
  try {
    const classes = step.attributes.class || "";
    const semanticClasses = classes
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) =>
        [
          "btn",
          "button",
          "menu",
          "nav",
          "submit",
          "close",
          "icon",
          "toggle",
          "dropdown",
          "modal",
          "search",
          "login",
          "save",
          "delete",
        ].some((keyword) => className.includes(keyword))
      )
      .join(", ");

    const templates = PROMPT_TEMPLATES[locale].stepDescription;
    const narration = step.speechTranscript
      ? templates.fragments.narration(step.speechTranscript)
      : "";

    const elementPrompt = `<element_clicked>
HTML Element: ${step.tagName.toUpperCase()}
Visible Text: "${step.text || ""}"${narration}

Current Page Context:
- Page Title: ${step.pageTitle || "unknown"}
- Page URL: ${step.url || "unknown"}

Attributes:
- ID: ${step.attributes.id || "none"}
- Classes: ${classes || "none"}
${semanticClasses ? `- Semantic Classes Found: ${semanticClasses}` : ""}
- Name: ${step.attributes.name || "none"}
- Type: ${step.attributes.type || "none"}
- Role: ${step.attributes.role || "none"}
- Href: ${step.attributes.href || "none"}
- Aria-Label: "${step.attributes["aria-label"] || ""}"
- Title: "${step.attributes.title || ""}"
- Placeholder: "${step.attributes.placeholder || ""}"
- Alt: "${step.attributes.alt || ""}"

User Action: ${userActionText}

Generate an action instruction starting with "Click on" (or "Type"/"Select" when applicable).`;

    const userContent: any = step.screenshot
      ? [
          {
            type: "text",
            text: templates.user(elementPrompt),
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: detectImageMediaType(step.screenshot),
              data: step.screenshot,
            },
          },
        ]
      : elementPrompt;

    const result = await invoke({
      maxTokens: 64,
      messages: [
        { role: "user", content: userContent },
        {
          role: "assistant",
          content: templates.assistant,
        },
      ],
      system: templates.system,
      modelClass: "small_fast",
    });

    return parseTaggedValue(readTextBlocks(result), "description");
  } catch {
    return "";
  }
}

export interface RecordedWorkflowStep {
  description: string;
  speechTranscript?: string;
  screenshot?: string;
}

function buildReusablePrompt(
  parsed: {
    inputs: Array<{ name: string; description: string }>;
    prompt: string;
  },
  locale: SupportedLocale = "en-US"
): string {
  if (parsed.inputs.length === 0) return parsed.prompt;
  const prefix = WORKFLOW_INPUT_PREFIX[locale];
  return `${prefix}\n${parsed.inputs
    .map((item) => `- ${item.name}: ${item.description}`)
    .join("\n")}\n\n${parsed.prompt}`;
}

export async function generateWorkflowSummary(
  steps: RecordedWorkflowStep[],
  invoke: ModelInvoker,
  includeHighlyDetailedFallback = false,
  locale: SupportedLocale = "en-US"
): Promise<string> {
  try {
    if (!steps || steps.length === 0) return "";

    const stepList = steps.map((step, index) => `${index + 1}. ${step.description}`).join("\n");
    const spokenNarration = steps
      .map((step) => step.speechTranscript)
      .filter((value): value is string => Boolean(value))
      .join(" ");

    const templates = PROMPT_TEMPLATES[locale].workflowSummary;
    const narrationSection = spokenNarration
      ? templates.fragments.narration(spokenNarration)
      : "";

    const detailHint = includeHighlyDetailedFallback
      ? templates.fragments.detailHint
      : templates.fragments.contextHint;

    const finalUserText = templates.user(stepList, narrationSection, detailHint);

    const userContent: any[] = [
      {
        type: "text",
        text: finalUserText,
      },
    ];

    for (const step of steps) {
      if (!step.screenshot) continue;
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: detectImageMediaType(step.screenshot),
          data: step.screenshot,
        },
      });
    }

    const result = await invoke({
      maxTokens: 512,
      messages: [
        { role: "user", content: userContent },
        {
          role: "assistant",
          content: templates.assistant,
        },
      ],
      system: templates.system,
      model: DEFAULT_MODEL,
    });

    const text = readTextBlocks(result);
    if (!text) return "";

    const inputsBlock = text.match(/<inputs>([\s\S]*?)<\/inputs>/)?.[1] || "";
    const promptBlock =
      text.match(/<prompt>([\s\S]*?)<\/prompt>/)?.[1]?.trim() ||
      text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ||
      text.replace(/<inputs>[\s\S]*?<\/inputs>/g, "").replace(/<\/?prompt>/g, "").trim();

    const inputs = inputsBlock
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.match(/-\s*([^:]+):\s*(.*)/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ name: match[1].trim(), description: match[2].trim() }));

    return buildReusablePrompt({ inputs, prompt: promptBlock }, locale);
  } catch {
    return "";
  }
}

export const workflowGeneration = Object.freeze({
  generateConversationTitle,
  generateDailySummary,
  generateQuote,
  generateShortcutName,
  generateWorkflowStepDescription,
  generateWorkflowSummary,
});

// -----------------------------------------------------------------------------
// Compact-command helper (special slash-like command used by this session flow)
// -----------------------------------------------------------------------------

const COMPACT_COMMAND = "compact";

export interface SpecialCommand {
  command: string;
  label: string;
  aliases: string[];
  description: string;
}

function getCompactCommandLabel(intl?: ReturnType<typeof useIntl>) {
  if (isChineseLocale(intl?.locale)) {
    return intl
      ? intl.formatMessage({
          defaultMessage: "清理上下文",
          id: "compact_command_name",
        })
      : "清理上下文";
  }

  return COMPACT_COMMAND;
}

export function getSpecialCommands(intl?: ReturnType<typeof useIntl>): SpecialCommand[] {
  const compactLabel = getCompactCommandLabel(intl);
  const compactAliases = isChineseLocale(intl?.locale)
    ? [compactLabel, "清理", "压缩上下文", "压缩对话"]
    : [COMPACT_COMMAND];
  const compactDescription = isChineseLocale(intl?.locale)
    ? "清理历史记录并保留摘要"
    : "Clear history and keep summary";

  return [
    {
      command: COMPACT_COMMAND,
      label: compactLabel,
      aliases: compactAliases,
      description: intl
        ? intl.formatMessage({
            defaultMessage: compactDescription,
            id: "AtUwwM+FWM",
          })
        : compactDescription,
    },
  ];
}

export function resolveSpecialCommand(
  inputCommand: string,
  intl?: ReturnType<typeof useIntl>
): SpecialCommand | undefined {
  const normalizedInput = inputCommand.trim().toLowerCase();
  if (!normalizedInput) return undefined;

  return getSpecialCommands(intl).find((entry) =>
    [entry.command, entry.label, ...entry.aliases].some(
      (candidate) => candidate.trim().toLowerCase() === normalizedInput
    )
  );
}

export function isSpecialCommand(command: string, intl?: ReturnType<typeof useIntl>): boolean {
  return !!resolveSpecialCommand(command, intl);
}

// -----------------------------------------------------------------------------
// File attachment management
// -----------------------------------------------------------------------------

export interface Attachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  error?: string;
  isAnnotated?: boolean;
}

const MAX_IMAGE_DIMENSION = 8000;
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
const SUPPORTED_DOCUMENT_TYPES = ['application/pdf'];
const SUPPORTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES];

export function isSupportedImageType(type: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(type);
}

export function isSupportedFileType(type: string): boolean {
  return SUPPORTED_FILE_TYPES.includes(type);
}

export function isImageFile(type: string): boolean {
  return type.startsWith('image/');
}

export function isPdfFile(type: string): boolean {
  return type === 'application/pdf';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = extractBase64FromDataUrl(dataUrl);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

async function compressImage(file: File, targetSize: number): Promise<File> {
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  URL.revokeObjectURL(url);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  const scale = Math.min(1, targetSize / Math.max(img.width, img.height));
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.9;
  let blob: Blob | null = null;

  // Binary search for optimal quality
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, quality);
    });

    if (!blob) break;
    if (blob.size <= 3 * 1024 * 1024) break;
    quality *= 0.8;
  }

  if (!blob) throw new Error('Failed to compress image');

  return new File([blob], file.name, { type: file.type });
}

function validateFile(file: File): string | null {
  if (!isSupportedFileType(file.type)) {
    return 'File type is not supported. Please upload an image (PNG, JPG, GIF, WebP) or PDF file.';
  }

  // PDF files have a 32MB limit, images have 10MB limit
  const maxSize = isPdfFile(file.type) ? 32 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    const limitMB = isPdfFile(file.type) ? 32 : 10;
    return `File size exceeds ${limitMB}MB limit.`;
  }

  return null;
}

export function useAttachments() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: File[] | FileList) => {
    console.log('[DEBUG] handleFiles called with:', files);
    const fileArray = Array.from(files).filter((file) =>
      isImageFile(file.type) || isPdfFile(file.type)
    );
    console.log('[DEBUG] Filtered files:', fileArray);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadingCount(fileArray.length);
    setError(null);

    // Initial delay matching original
    await new Promise((resolve) => setTimeout(resolve, 800));

    const newAttachments: Attachment[] = [];

    for (const file of fileArray) {
      try {
        const validationError = validateFile(file);
        if (validationError) {
          newAttachments.push({
            id: crypto.randomUUID(),
            file,
            base64: '',
            url: '',
            error: validationError,
          });
          continue;
        }

        // PDF files don't need dimension checking or compression
        if (isPdfFile(file.type)) {
          const base64 = await fileToBase64(file);
          const url = URL.createObjectURL(file);

          newAttachments.push({
            id: crypto.randomUUID(),
            file,
            base64,
            url,
          });
          continue;
        }

        // Image processing
        const dimensions = await getImageDimensions(file);
        let processedFile = file;

        // Check if compression is needed
        const needsCompression =
          dimensions.width > MAX_IMAGE_DIMENSION ||
          dimensions.height > MAX_IMAGE_DIMENSION ||
          (file.size > 3 * 1024 * 1024 && (file.type === 'image/jpeg' || file.type === 'image/png'));

        if (needsCompression) {
          if (file.type === 'image/jpeg' || file.type === 'image/png') {
            processedFile = await compressImage(file, MAX_IMAGE_DIMENSION);
          } else if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
            newAttachments.push({
              id: crypto.randomUUID(),
              file,
              base64: '',
              url: '',
              error: `Image dimensions exceed ${MAX_IMAGE_DIMENSION}px limit and cannot be compressed.`,
            });
            continue;
          }
        }

        const base64 = await fileToBase64(processedFile);
        const url = URL.createObjectURL(processedFile);

        newAttachments.push({
          id: crypto.randomUUID(),
          file: processedFile,
          base64,
          url,
        });
      } catch (err) {
        newAttachments.push({
          id: crypto.randomUUID(),
          file,
          base64: '',
          url: '',
          error: err instanceof Error ? err.message : 'Failed to process file',
        });
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
    setUploadingCount(0);

    // Auto-clear error after 3 seconds
    const hasError = newAttachments.some((a) => a.error);
    if (hasError) {
      setTimeout(() => setError(null), 3000);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      void handleFiles(files);
    },
    [handleFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageFiles = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleFiles(imageFiles);
      }
    },
    [handleFiles]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    attachments.forEach((attachment) => {
      if (attachment.url) {
        URL.revokeObjectURL(attachment.url);
      }
    });
    setAttachments([]);
  }, [attachments]);

  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  return {
    attachments,
    isUploading,
    uploadingCount,
    error,
    handleFiles,
    handleDrop,
    handlePaste,
    removeAttachment,
    clearAttachments,
    addAttachment,
  };
}

// -----------------------------------------------------------------------------
// UI Components for attachments
// -----------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 bg-bg-200 rounded w-3/4"></div>
      <div className="h-3 bg-bg-200 rounded w-1/2"></div>
    </div>
  );
}

interface AttachmentThumbnailProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
  isLoading?: boolean;
}

function AttachmentThumbnail({ attachment, onRemove, isLoading }: AttachmentThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  if (attachment.error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-[120px] h-[120px] rounded-lg border-2 border-red-500 bg-bg-100 p-2 flex flex-col items-center justify-center"
      >
        <div className="text-red-500 mb-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-xs text-red-500 text-center line-clamp-2">{attachment.error}</p>
        <button
          onClick={() => onRemove(attachment.id)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3">
        <Skeleton />
      </div>
    );
  }

  // Image files
  if (attachment.url && isImageFile(attachment.file.type)) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-[120px] h-[120px] rounded-lg overflow-hidden border border-border-300 cursor-pointer"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => setShowPreview(true)}
        >
          <img
            src={attachment.url}
            alt={attachment.file.name}
            className="w-full h-full object-cover"
          />
          {isHovered && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(attachment.id);
              }}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </motion.button>
          )}
        </motion.div>

        {showPreview && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowPreview(false)}
          >
            <img
              src={attachment.url}
              alt={attachment.file.name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  // Document files (PDF, etc.)
  if (attachment.url) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3 flex flex-col items-center justify-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <p className="text-xs text-text-200 mt-2 text-center line-clamp-2">{attachment.file.name}</p>
        <p className="text-xs text-text-300 mt-1">
          {attachment.file.size > 1024 * 1024
            ? `${(attachment.file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${(attachment.file.size / 1024).toFixed(1)} KB`}
        </p>
        {isHovered && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => onRemove(attachment.id)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </motion.button>
        )}
      </motion.div>
    );
  }

  // Fallback for files without URL
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3 flex flex-col items-center justify-center"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p className="text-xs text-text-200 mt-2 text-center line-clamp-2">{attachment.file.name}</p>
      <p className="text-xs text-text-300 mt-1">
        {attachment.file.size > 1024 * 1024
          ? `${(attachment.file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(attachment.file.size / 1024).toFixed(1)} KB`}
      </p>
      <button
        onClick={() => onRemove(attachment.id)}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg-300 text-text-200 flex items-center justify-center hover:bg-bg-400 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </motion.div>
  );
}

interface AttachmentThumbnailsProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  isUploading: boolean;
  uploadingCount: number;
}

export function AttachmentThumbnails({
  attachments,
  onRemove,
  isUploading,
  uploadingCount,
}: AttachmentThumbnailsProps) {
  console.log('[DEBUG] AttachmentThumbnails render:', { attachments, isUploading, uploadingCount });
  const hasContent = attachments.length > 0 || isUploading;

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="border-t border-border-300/25 rounded-b-2xl bg-bg-100 overflow-hidden"
        >
          <div className="flex flex-row overflow-x-auto overflow-y-hidden gap-3 px-3.5 py-2.5">
            <AnimatePresence mode="popLayout">
              {attachments.map((attachment) => (
                <motion.div
                  key={attachment.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <AttachmentThumbnail
                    attachment={attachment}
                    onRemove={onRemove}
                  />
                </motion.div>
              ))}
              {isUploading &&
                Array.from({ length: uploadingCount }).map((_, i) => (
                  <motion.div
                    key={`loading-${i}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="w-[120px] h-[120px] rounded-lg border border-border-300 bg-bg-100 p-3">
                      <Skeleton />
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// FileUploadIcon SVG component
function FileUploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

type DragState = 'IDLE' | 'DRAGGING_ON_TARGET' | 'DRAGGING_OFF_TARGET' | 'DRAGGING_INVALID' | 'DROPPED';

interface DropZoneProps {
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function DropZone({ onDrop, children, disabled }: DropZoneProps) {
  const [dragState, setDragState] = useState<DragState>('IDLE');
  const dragCounterRef = useRef(0);
  const targetRef = useRef<HTMLDivElement>(null);

  const hasValidFiles = useCallback((e: React.DragEvent) => {
    const items = Array.from(e.dataTransfer.items);
    return items.some((item) => {
      if (item.kind !== 'file') return false;
      return isImageFile(item.type) || isPdfFile(item.type);
    });
  }, []);

  const handleTargetDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current++;
      if (hasValidFiles(e)) {
        setDragState('DRAGGING_ON_TARGET');
      } else {
        setDragState('DRAGGING_INVALID');
      }
    },
    [disabled, hasValidFiles]
  );

  const handleTargetDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setDragState('DRAGGING_OFF_TARGET');
      }
    },
    [disabled]
  );

  const handleTargetDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
    },
    [disabled]
  );

  const handleTargetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      dragCounterRef.current = 0;
      setDragState('DROPPED');

      if (hasValidFiles(e)) {
        onDrop(e);
      }

      setTimeout(() => setDragState('IDLE'), 300);
    },
    [disabled, hasValidFiles, onDrop]
  );

  useEffect(() => {
    if (disabled) return;

    const handleDocumentDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (dragState === 'IDLE') {
        setDragState('DRAGGING_OFF_TARGET');
      }
    };

    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragState('IDLE');
    };

    const handleDocumentDragLeave = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) {
        dragCounterRef.current = 0;
        setDragState('IDLE');
      }
    };

    document.addEventListener('dragenter', handleDocumentDragEnter);
    document.addEventListener('dragover', handleDocumentDragOver);
    document.addEventListener('drop', handleDocumentDrop);
    document.addEventListener('dragleave', handleDocumentDragLeave);

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter);
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      document.removeEventListener('dragleave', handleDocumentDragLeave);
    };
  }, [disabled, dragState]);

  const showOverlay = dragState !== 'IDLE' && dragState !== 'DROPPED';
  const isInvalid = dragState === 'DRAGGING_INVALID';

  return (
    <div className="relative">
      <div
        ref={targetRef}
        onDragEnter={handleTargetDragEnter}
        onDragLeave={handleTargetDragLeave}
        onDragOver={handleTargetDragOver}
        onDrop={handleTargetDrop}
      >
        {children}
      </div>

      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <div
              className={`rounded-2xl p-8 flex flex-col items-center gap-4 ${
                isInvalid ? 'bg-red-500/20 border-2 border-red-500' : 'bg-blue-500/20 border-2 border-blue-500'
              }`}
            >
              <FileUploadIcon className={isInvalid ? 'text-red-500' : 'text-blue-500'} />
              <p className={`text-lg font-medium ${isInvalid ? 'text-red-500' : 'text-blue-500'}`}>
                {isInvalid ? 'File type is not supported' : 'Drop image files here'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
