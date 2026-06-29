import { cdpDebugger } from '../browserAutomation';
import { gifFrameStorage } from '../mediaTools/gifFrameStorage';
import type { RecordedAction, RecordedFrame } from '../core/types';
import { toToolInputRecord } from '../core/utils';

export async function recordToolAction(
  toolName: string,
  toolInput: unknown,
  tabId: number
): Promise<void> {
  try {
    if (!['computer', 'navigate'].includes(toolName)) return;
    const input = toToolInputRecord(toolInput);
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;
    const groupId = tab.groupId ?? -1;
    if (!gifFrameStorage.isRecording(groupId)) return;

    let actionData: RecordedAction | undefined;

    if ('computer' === toolName && typeof input.action === 'string') {
      const actionType = input.action;
      if ('screenshot' === actionType) return;
      actionData = {
        type: actionType,
        coordinate: input.coordinate,
        start_coordinate: input.start_coordinate,
        text: input.text,
        timestamp: Date.now()
      };
      if (actionType.includes('click')) {
        actionData.description = 'Clicked';
      } else if ('type' === actionType && typeof input.text === 'string') {
        actionData.description = `Typed: "${input.text}"`;
      } else if ('key' === actionType && typeof input.text === 'string') {
        actionData.description = `Pressed key: ${input.text}`;
      } else {
        actionData.description =
          'scroll' === actionType
            ? 'Scrolled'
            : 'left_click_drag' === actionType
              ? 'Dragged'
              : actionType;
      }
    } else if ('navigate' === toolName && typeof input.url === 'string') {
      actionData = {
        type: 'navigate',
        timestamp: Date.now(),
        description: `Navigated to ${input.url}`
      };
    }

    if (
      actionData &&
      (actionData.type.includes('click') || 'left_click_drag' === actionData.type)
    ) {
      const frames = gifFrameStorage.getFrames(groupId);
      if (frames.length > 0) {
        const lastFrame = frames[frames.length - 1];
        const frameWithAction = {
          base64: lastFrame.base64,
          action: actionData,
          frameNumber: frames.length,
          timestamp: Date.now(),
          viewportWidth: lastFrame.viewportWidth,
          viewportHeight: lastFrame.viewportHeight,
          devicePixelRatio: lastFrame.devicePixelRatio
        };
        // Cast: GifFrameData.action is `GifAction` (requires `type: string`)
        // but `RecordedAction` here comes from a record-widened union; the
        // actual shape satisfies the contract at runtime.
        gifFrameStorage.addFrame(
          groupId,
          frameWithAction as Parameters<typeof gifFrameStorage.addFrame>[1]
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
    const screenshotData = await (async () => {
      try {
        return await cdpDebugger.screenshot(tabId);
      } catch {
        return null;
      }
    })();
    if (!screenshotData) return;

    let devicePixelRatio = 1;
    try {
      const scriptResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.devicePixelRatio
      });
      const nextDevicePixelRatio = scriptResult?.[0]?.result;
      devicePixelRatio = typeof nextDevicePixelRatio === 'number' ? nextDevicePixelRatio : 1;
    } catch {
      // silently fail
    }

    const frameNumber = gifFrameStorage.getFrames(groupId).length;
    const frame: RecordedFrame = {
      base64: screenshotData.base64,
      action: actionData,
      frameNumber,
      timestamp: Date.now(),
      viewportWidth: screenshotData.viewportWidth || screenshotData.width,
      viewportHeight: screenshotData.viewportHeight || screenshotData.height,
      devicePixelRatio
    };
    // Cast: see note above re: GifAction shape.
    gifFrameStorage.addFrame(groupId, frame as Parameters<typeof gifFrameStorage.addFrame>[1]);
  } catch {
    // silently fail
  }
}
