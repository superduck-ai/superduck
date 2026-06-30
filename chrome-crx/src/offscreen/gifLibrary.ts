interface GifEncoder {
  on(event: 'progress', handler: (percent: number) => void): void;
  on(event: 'finished', handler: (blob: Blob) => void): void;
  on(event: 'abort', handler: () => void): void;
  addFrame(canvas: HTMLCanvasElement, options: { delay: number }): void;
  render(): void;
}

export type GifConstructor = new (options: {
  workers: number;
  quality: number;
  width: number;
  height: number;
  workerScript: string;
  repeat: number;
  debug: boolean;
}) => GifEncoder;

const GIF_LIBRARY_SCRIPT_ID = 'superduck-gif-library';
let gifLibraryPromise: Promise<GifConstructor> | null = null;

function getGifConstructor(): GifConstructor | undefined {
  return (window as Window & typeof globalThis & { GIF?: GifConstructor }).GIF;
}

export function loadGifLibrary(): Promise<GifConstructor> {
  const existingGif = getGifConstructor();
  if (existingGif) {
    return Promise.resolve(existingGif);
  }

  if (gifLibraryPromise) {
    return gifLibraryPromise;
  }

  gifLibraryPromise = new Promise<GifConstructor>((resolve, reject) => {
    const existingScript = document.getElementById(
      GIF_LIBRARY_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const resolveGif = () => {
      const gif = getGifConstructor();
      if (!gif) {
        gifLibraryPromise = null;
        reject(new Error('[Offscreen] GIF library loaded without exposing window.GIF'));
        return;
      }
      resolve(gif);
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolveGif();
        return;
      }

      existingScript.addEventListener('load', resolveGif, { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          gifLibraryPromise = null;
          reject(new Error('[Offscreen] Failed to load GIF library script'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GIF_LIBRARY_SCRIPT_ID;
    script.src = chrome.runtime.getURL('gif.js');
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolveGif();
    };
    script.onerror = () => {
      gifLibraryPromise = null;
      reject(new Error('[Offscreen] Failed to load GIF library script'));
    };
    document.head.appendChild(script);
  });

  return gifLibraryPromise;
}
