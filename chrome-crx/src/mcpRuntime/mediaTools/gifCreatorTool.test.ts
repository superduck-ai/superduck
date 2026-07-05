import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../pageToolsSupport/types';
import { DEFAULT_BROWSER_SESSION_ID } from '../sessionScope';

const tabGroupMock = vi.hoisted(() => ({
  isInGroup: vi.fn()
}));

const gifFrameStorageMock = vi.hoisted(() => ({
  clearFrames: vi.fn(),
  startRecording: vi.fn(),
  isRecording: vi.fn()
}));

const chromeMock = vi.hoisted(() => {
  const tabsGet = vi.fn();
  globalThis.chrome = {
    debugger: {
      onEvent: { addListener: vi.fn() },
      onDetach: { addListener: vi.fn() }
    },
    tabs: {
      get: tabsGet,
      onRemoved: { addListener: vi.fn() }
    }
  } as unknown as typeof chrome;
  return { tabsGet };
});

vi.mock('../tabState', () => ({
  tabGroupManager: tabGroupMock
}));

vi.mock('./gifFrameStorage', () => ({
  gifFrameStorage: gifFrameStorageMock,
  getGifFrameDelay: vi.fn(() => 800)
}));

vi.mock('../domainPermissions', () => ({
  PermissionTools: {
    UPLOAD_IMAGE: 'upload_image'
  },
  checkUrlSecurity: vi.fn(async () => null)
}));

import { gifCreatorTool } from './gifCreatorTool';

describe('gifCreatorTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gifFrameStorageMock.isRecording.mockReturnValue(false);
    chromeMock.tabsGet.mockResolvedValue({
      id: 5,
      groupId: -1,
      url: 'https://example.com/',
      title: 'Example'
    });
  });

  it('allows default sidepanel sessions to record unmanaged tabs', async () => {
    const context: ToolContext = {
      tabId: 5,
      browserSessionScope: { sessionId: DEFAULT_BROWSER_SESSION_ID },
      tabAccess: 'write',
      permissionManager: {} as ToolContext['permissionManager'],
      resolveTabId: vi.fn(async () => 5)
    };

    const result = await gifCreatorTool.execute({ action: 'start_recording', tabId: 5 }, context);

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('Started recording');
    expect(tabGroupMock.isInGroup).not.toHaveBeenCalled();
    expect(gifFrameStorageMock.clearFrames).toHaveBeenCalledWith(-1);
    expect(gifFrameStorageMock.startRecording).toHaveBeenCalledWith(-1);
  });
});
