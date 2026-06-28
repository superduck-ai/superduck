import { cdpDebugger } from './debugger';

export {
  cdpDebugger,
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
} from './debugger';
export { processScreenshotInContentScript } from './contentScriptScreenshot';
export { KEY_DEFINITIONS, MAC_KEYBOARD_COMMANDS } from './keyboard';
export { calculateOptimalDimensions, screenshotContextManager } from './screenshotContext';
export * from './types';

// Expose the singleton for the e2e test bridge. testBridge cannot import this
// module (circular: cdp → debug → testBridge), so it reads the instance off
// globalThis at call time. No-op in production; nothing else reads this key.
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__superduckCdpDebugger = cdpDebugger;
}
