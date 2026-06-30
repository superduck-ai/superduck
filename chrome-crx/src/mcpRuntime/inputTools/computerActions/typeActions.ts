import { cdpDebugger, checkDomainSecurity } from '../../cdp';
import type { ToolResult } from '../../pageTools';
import type { ComputerToolParams } from '../types';

export async function executeType(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.text) throw new Error('Text parameter is required for type action');
  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'type action');
    if (securityCheck) return securityCheck;
    await cdpDebugger.type(tabId, params.text);
    return { output: `Typed "${params.text}"` };
  } catch (error) {
    return { error: `Failed to type: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function executeKey(
  tabId: number,
  params: ComputerToolParams,
  currentUrl: string
): Promise<ToolResult> {
  if (!params.text) throw new Error('Text parameter is required for key action');

  const repeatCount = params.repeat ?? 1;
  if (!Number.isInteger(repeatCount) || repeatCount < 1)
    throw new Error('Repeat parameter must be a positive integer');
  if (repeatCount > 100) throw new Error('Repeat parameter cannot exceed 100');

  try {
    const securityCheck = await checkDomainSecurity(tabId, currentUrl, 'key action');
    if (securityCheck) return securityCheck;

    const keyInputs = params.text
      .trim()
      .split(/\s+/)
      .filter((k) => k.length > 0);
    console.info({ keyInputs });

    if (keyInputs.length === 1) {
      const singleKey = keyInputs[0].toLowerCase();
      if (
        singleKey === 'cmd+r' ||
        singleKey === 'cmd+shift+r' ||
        singleKey === 'ctrl+r' ||
        singleKey === 'ctrl+shift+r' ||
        singleKey === 'f5' ||
        singleKey === 'ctrl+f5' ||
        singleKey === 'shift+f5'
      ) {
        const isHardReload =
          singleKey === 'cmd+shift+r' ||
          singleKey === 'ctrl+shift+r' ||
          singleKey === 'ctrl+f5' ||
          singleKey === 'shift+f5';
        await chrome.tabs.reload(tabId, { bypassCache: isHardReload });
        const reloadType = isHardReload ? 'hard reload' : 'reload';
        return { output: `Executed ${keyInputs[0]} (${reloadType} page)` };
      }
    }

    for (let i = 0; i < repeatCount; i++) {
      for (const keyInput of keyInputs) {
        if (keyInput.includes('+')) {
          await cdpDebugger.pressKeyChord(tabId, keyInput);
        } else {
          const keyCode = cdpDebugger.getKeyCode(keyInput);
          if (keyCode) {
            await cdpDebugger.pressKey(tabId, keyCode);
          } else {
            await cdpDebugger.insertText(tabId, keyInput);
          }
        }
      }
    }

    const repeatSuffix = repeatCount > 1 ? ` (repeated ${repeatCount} times)` : '';
    return {
      output: `Pressed ${keyInputs.length} key${keyInputs.length === 1 ? '' : 's'}: ${keyInputs.join(' ')}${repeatSuffix}`
    };
  } catch (error) {
    return {
      error: `Error pressing key: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
