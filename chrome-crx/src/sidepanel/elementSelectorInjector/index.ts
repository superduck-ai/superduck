export type { CapturedEvent, TypedElementInfo } from './types';
export { elementSelectorInjector } from './engine';

// Helper function to check if URL is valid for recording
export const isValidUrl = (url?: string): boolean => {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://')
  );
};
