import { getStorageValue, setStorageValue, StorageKeys } from '../../extensionServices';
import type { GifAction } from './types';

interface GifFrameData {
  base64: string;
  action?: GifAction;
  frameNumber?: number;
  timestamp?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
}

export type RecordedGifFrame = GifFrameData;

interface GifGroupData {
  frames: GifFrameData[];
  lastUpdated: number;
}

// write-through backup to chrome.storage.local; reads stay in-memory for sync API
export const gifFrameStorage = new (class GifFrameStorage {
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
    void this.persistFrames();
  }

  getFrames(groupId: number): GifFrameData[] {
    return this.storage.get(groupId)?.frames ?? [];
  }

  clearFrames(groupId: number): void {
    this.storage.get(groupId)?.frames.length;
    this.storage.delete(groupId);
    this.recordingGroups.delete(groupId);
    void this.persistFrames();
    void this.persistRecordingGroups();
  }

  getFrameCount(groupId: number): number {
    return this.storage.get(groupId)?.frames.length ?? 0;
  }

  getActiveGroupIds(): number[] {
    return Array.from(this.storage.keys());
  }

  startRecording(groupId: number): void {
    this.recordingGroups.add(groupId);
    void this.persistRecordingGroups();
  }

  stopRecording(groupId: number): void {
    this.recordingGroups.delete(groupId);
    void this.persistRecordingGroups();
  }

  isRecording(groupId: number): boolean {
    return this.recordingGroups.has(groupId);
  }

  getRecordingGroupIds(): number[] {
    return Array.from(this.recordingGroups);
  }

  clearAll(): void {
    Array.from(this.storage.values()).reduce((acc, group) => acc + group.frames.length, 0);
    this.storage.clear();
    this.recordingGroups.clear();
    void this.persistFrames();
    void this.persistRecordingGroups();
  }

  private async persistFrames(): Promise<void> {
    try {
      const payload: Record<string, GifGroupData> = {};
      for (const [groupId, group] of this.storage) {
        const frames = group.frames.slice(-50);
        payload[String(groupId)] = { frames, lastUpdated: group.lastUpdated };
      }
      await setStorageValue(StorageKeys.GIF_FRAMES, payload);
    } catch (err) {
      console.warn('[gifFrameStorage] failed to persist frames', err);
    }
  }

  private async persistRecordingGroups(): Promise<void> {
    try {
      await setStorageValue(StorageKeys.GIF_RECORDING_GROUPS, Array.from(this.recordingGroups));
    } catch (err) {
      console.warn('[gifFrameStorage] failed to persist recordingGroups', err);
    }
  }
})();

// Called from service-worker.ts onStartup to hydrate cache after SW restart
export async function restoreGifFrameStorageFromStorage(): Promise<void> {
  try {
    const [storedFrames, storedGroups] = await Promise.all([
      getStorageValue<Record<string, GifGroupData>>(StorageKeys.GIF_FRAMES),
      getStorageValue<number[]>(StorageKeys.GIF_RECORDING_GROUPS)
    ]);

    gifFrameStorage.storage.clear();
    gifFrameStorage.recordingGroups.clear();

    if (storedFrames && typeof storedFrames === 'object') {
      for (const [groupIdStr, group] of Object.entries(storedFrames)) {
        const groupId = Number(groupIdStr);
        if (!Number.isInteger(groupId)) continue;
        if (!group || !Array.isArray(group.frames)) continue;
        const frames = group.frames.slice(-50);
        gifFrameStorage.storage.set(groupId, {
          frames,
          lastUpdated: typeof group.lastUpdated === 'number' ? group.lastUpdated : Date.now()
        });
      }
    }

    if (Array.isArray(storedGroups)) {
      for (const groupId of storedGroups) {
        if (Number.isInteger(groupId)) {
          gifFrameStorage.recordingGroups.add(groupId);
        }
      }
    }
  } catch (err) {
    console.warn('[gifFrameStorage] failed to restore from storage', err);
  }
}

export function getGifFrameDelay(actionType: string): number {
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
