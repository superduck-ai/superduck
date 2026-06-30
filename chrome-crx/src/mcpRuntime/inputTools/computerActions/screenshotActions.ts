import { cdpDebugger, generateUniqueId } from '../../cdp';
import type { ToolResult } from '../../pageTools';
import type { ComputerToolParams, ClickOptions } from '../types';

export async function executeScreenshot(
  tabId: number,
  options?: ClickOptions
): Promise<ToolResult> {
  try {
    const screenshotResult = await cdpDebugger.screenshot(tabId, undefined, options);
    const screenshotId = generateUniqueId();
    console.info(`[Computer Tool] Generated screenshot ID: ${screenshotId}`);
    console.info(
      `[Computer Tool] Screenshot dimensions: ${screenshotResult.width}x${screenshotResult.height}`
    );
    return {
      output: `Successfully captured screenshot (${screenshotResult.width}x${screenshotResult.height}, ${screenshotResult.format}) - ID: ${screenshotId}`,
      base64Image: screenshotResult.base64,
      imageFormat: screenshotResult.format,
      imageId: screenshotId
    };
  } catch (error) {
    return {
      error: `Error capturing screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function executeWait(params: ComputerToolParams): Promise<ToolResult> {
  if (!params.duration || params.duration <= 0)
    throw new Error('Duration parameter is required and must be positive');
  if (params.duration > 30) throw new Error('Duration cannot exceed 30 seconds');
  const ms = Math.round(1000 * params.duration);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  return { output: `Waited for ${params.duration} second${params.duration === 1 ? '' : 's'}` };
}
