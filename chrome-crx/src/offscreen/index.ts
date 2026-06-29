import {
  type ActionMetadata,
  type GifOptions,
  applyActionIndicators,
  drawProgressBar,
  drawWatermark
} from './canvasDrawing';
import { type GifConstructor, loadGifLibrary } from './gifLibrary';

interface GifFrame {
  base64: string;
  format?: string;
  delay?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  action?: ActionMetadata;
}

interface GifResult {
  base64: string;
  blobUrl: string;
  size: number;
  width: number;
  height: number;
}

interface PlayNotificationSoundMessage {
  type: 'PLAY_NOTIFICATION_SOUND';
  audioUrl: string;
  volume?: number;
}

interface GenerateGifMessage {
  type: 'GENERATE_GIF';
  frames: GifFrame[];
  options?: GifOptions;
}

console.log('[Offscreen] Document loaded and ready');

// Initialize AudioContext immediately (module load time)
const AudioCtx =
  window.AudioContext ||
  (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
if (!AudioCtx) {
  throw new Error('[Offscreen] AudioContext is not supported in this context');
}
const audioContext = new AudioCtx();
console.log('[Offscreen] AudioContext created, state:', audioContext.state);

async function playAudioWithWebAudioAPI(audioUrl: string, volume: number): Promise<void> {
  try {
    console.log('[Offscreen] Fetching audio file:', audioUrl);

    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();

    console.log('[Offscreen] Audio file fetched, decoding...');

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    console.log('[Offscreen] Audio decoded, creating source...');

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      console.log('[Offscreen] Resuming AudioContext...');
      await audioContext.resume();
    }

    console.log('[Offscreen] Starting playback...');
    source.start(0);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        console.log('[Offscreen] Playback finished');
        resolve();
      };
    });
  } catch (error) {
    console.error('[Offscreen] Web Audio API error:', error);
    throw error;
  }
}

async function generateGif(frames: GifFrame[], options: GifOptions = {}): Promise<GifResult> {
  console.log(`[Offscreen] Generating GIF from ${frames.length} frames`);
  console.log(`[Offscreen] Options:`, options);

  const enhancementOptions = {
    showClickIndicators: options.showClickIndicators ?? true,
    showDragPaths: options.showDragPaths ?? true,
    showActionLabels: options.showActionLabels ?? true,
    showProgressBar: options.showProgressBar ?? true,
    showWatermark: options.showWatermark ?? true
  };

  const images = await Promise.all(
    frames.map((frame, index) => {
      console.log(`[Offscreen] Loading image ${index + 1}/${frames.length}`);
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          console.log(`[Offscreen] Image ${index + 1} loaded: ${img.width}x${img.height}`);
          resolve(img);
        };
        img.onerror = reject;
        const dataUrl = `data:image/${frame.format || 'png'};base64,${frame.base64}`;
        img.src = dataUrl;
      });
    })
  );

  console.log(`[Offscreen] All ${images.length} images loaded`);

  const width = images[0].width;
  const height = images[0].height;

  console.log(`[Offscreen] Enhancing frames with indicators and overlays...`);

  const enhancedCanvases = images.map((img, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return canvas;
    }

    ctx.drawImage(img, 0, 0);

    const frame = frames[index];

    let scaleFactor = 1;
    if (frame.viewportWidth && canvas.width) {
      scaleFactor = canvas.width / frame.viewportWidth;
      console.log(
        `[Offscreen] Frame ${index + 1}: Applying scale factor ${scaleFactor} (canvas: ${canvas.width}x${canvas.height}, viewport: ${frame.viewportWidth}x${frame.viewportHeight})`
      );
    } else {
      console.log(
        `[Offscreen] Frame ${index + 1}: No viewport metadata, using scale factor 1.0 (backwards compatibility)`
      );
    }

    if (frame.action) {
      applyActionIndicators(canvas, frame.action, enhancementOptions, scaleFactor);
    }

    const progress = (index + 1) / images.length;

    if (enhancementOptions.showProgressBar) {
      drawProgressBar(ctx, progress, scaleFactor);
    }

    if (enhancementOptions.showWatermark) {
      drawWatermark(ctx, scaleFactor);
    }

    console.log(
      `[Offscreen] Frame ${index + 1}/${images.length} enhanced (progress: ${Math.round(progress * 100)}%)`
    );

    return canvas;
  });

  console.log(`[Offscreen] Creating GIF encoder: ${width}x${height}, workers: 2`);

  const frameDelays = frames.map((frame, index) => {
    const baseDelay = frame.delay || 800;
    const isLastFrame = index === frames.length - 1;
    return isLastFrame ? baseDelay + 2000 : baseDelay;
  });

  return new Promise<GifResult>((resolve, reject) => {
    loadGifLibrary()
      .then((gifConstructor: GifConstructor) => {
        const gif = new gifConstructor({
          workers: 2,
          quality: options.quality || 10,
          width,
          height,
          workerScript: chrome.runtime.getURL('gif.worker.js'),
          repeat: 0,
          debug: true
        });

        gif.on('progress', (percent) => {
          console.log(`[Offscreen] GIF encoding progress: ${Math.round(percent * 100)}%`);
        });

        gif.on('finished', (blob) => {
          console.log(`[Offscreen] GIF created: ${blob.size} bytes`);

          const blobUrl = URL.createObjectURL(blob);
          console.log(`[Offscreen] Created blob URL: ${blobUrl}`);

          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result !== 'string') {
              reject(new Error('[Offscreen] Unexpected FileReader result type'));
              return;
            }
            const base64 = reader.result.split(',')[1];
            console.log(`[Offscreen] Conversion complete, base64 length: ${base64.length}`);
            resolve({
              base64,
              blobUrl,
              size: blob.size,
              width,
              height
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        gif.on('abort', () => reject(new Error('GIF rendering aborted')));

        enhancedCanvases.forEach((canvas, index) => {
          gif.addFrame(canvas, { delay: frameDelays[index] });
        });

        console.log(`[Offscreen] Starting GIF rendering...`);
        gif.render();
      })
      .catch(reject);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return;
  }

  const typedMessage = message as PlayNotificationSoundMessage | GenerateGifMessage;

  if (typedMessage.type === 'PLAY_NOTIFICATION_SOUND') {
    console.log('[Offscreen] Received PLAY_NOTIFICATION_SOUND message');
    console.log('[Offscreen] AudioContext state:', audioContext.state);

    const volume = typedMessage.volume || 0.5;

    playAudioWithWebAudioAPI(typedMessage.audioUrl, volume)
      .then(() => {
        console.log('[Offscreen] Sound played successfully via Web Audio API');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[Offscreen] Failed to play sound:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (typedMessage.type === 'GENERATE_GIF') {
    console.log('[Offscreen] Received GENERATE_GIF message');
    console.log(`[Offscreen] Frames: ${typedMessage.frames?.length}`);
    console.log(`[Offscreen] Options:`, typedMessage.options);

    generateGif(typedMessage.frames, typedMessage.options)
      .then((result) => {
        console.log('[Offscreen] GIF generated successfully');
        sendResponse({ success: true, result });
      })
      .catch((error) => {
        console.error('[Offscreen] Failed to generate GIF:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});
