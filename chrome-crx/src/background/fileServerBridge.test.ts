import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileServerBridge } from './fileServerBridge';

describe('createFileServerBridge', () => {
  let bridge: ReturnType<typeof createFileServerBridge>;

  beforeEach(() => {
    bridge = createFileServerBridge();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with empty file server info', () => {
    expect(bridge.getFileServerInfo()).toEqual({ url: '', token: '' });
  });

  it('handles file_server_ready message and stores URL + token', () => {
    const handled = bridge.handleMessage({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token'
    });

    expect(handled).toBe(true);
    expect(bridge.getFileServerInfo()).toEqual({
      url: 'http://127.0.0.1:54321',
      token: 'secret-token'
    });
  });

  it('ignores file_server_ready with missing url or token', () => {
    bridge.handleMessage({ type: 'file_server_ready', url: 'http://127.0.0.1:54321' });
    expect(bridge.getFileServerInfo()).toEqual({ url: '', token: '' });

    bridge.handleMessage({ type: 'file_server_ready', token: 'secret' });
    expect(bridge.getFileServerInfo()).toEqual({ url: '', token: '' });
  });

  it('handles file_ready message and invokes callback', () => {
    const received: unknown[] = [];
    bridge.onFileReady((info) => received.push(info));

    const handled = bridge.handleMessage({
      type: 'file_ready',
      id: 'file-123',
      url: 'http://127.0.0.1:54321/f/file-123',
      filename: 'report.md',
      mimeType: 'text/markdown',
      size: 1024
    });

    expect(handled).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      id: 'file-123',
      url: 'http://127.0.0.1:54321/f/file-123',
      filename: 'report.md',
      mimeType: 'text/markdown',
      size: 1024
    });
  });

  it('does not invoke callback for file_ready without id', () => {
    const received: unknown[] = [];
    bridge.onFileReady((info) => received.push(info));

    bridge.handleMessage({ type: 'file_ready', url: 'http://127.0.0.1/f/x' });

    expect(received).toHaveLength(0);
  });

  it('only the last onFileReady callback is active', () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    bridge.onFileReady((info) => first.push(info));
    bridge.onFileReady((info) => second.push(info));

    bridge.handleMessage({
      type: 'file_ready',
      id: 'f1',
      url: '',
      filename: '',
      mimeType: '',
      size: 0
    });

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('returns false for unrelated message types', () => {
    expect(bridge.handleMessage({ type: 'tool_request' })).toBe(false);
    expect(bridge.handleMessage({ type: 'pong' })).toBe(false);
    expect(bridge.handleMessage({ type: 'status_response' })).toBe(false);
  });

  it('fetchFileFromHost throws when not ready', async () => {
    await expect(bridge.fetchFileFromHost('test-id')).rejects.toThrow('file server not ready');
  });

  it('fetchFileFromHost fetches with Bearer auth after ready', async () => {
    bridge.handleMessage({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token'
    });

    const mockBlob = new Blob(['content'], { type: 'text/plain' });
    const fetchMock = vi.fn(
      async () => new Response(mockBlob, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await bridge.fetchFileFromHost('file-123');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:54321/f/file-123', {
      headers: { Authorization: 'Bearer secret-token' }
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it('fetchFileFromHost throws on HTTP error', async () => {
    bridge.handleMessage({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token'
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' }))
    );

    await expect(bridge.fetchFileFromHost('missing')).rejects.toThrow('fetch file missing: 404');
  });

  it('reset clears URL, token, and callback', () => {
    bridge.handleMessage({
      type: 'file_server_ready',
      url: 'http://127.0.0.1:54321',
      token: 'secret-token'
    });
    const received: unknown[] = [];
    bridge.onFileReady((info) => received.push(info));

    bridge.reset();

    expect(bridge.getFileServerInfo()).toEqual({ url: '', token: '' });

    bridge.handleMessage({
      type: 'file_ready',
      id: 'f1',
      url: '',
      filename: '',
      mimeType: '',
      size: 0
    });
    expect(received).toHaveLength(0);
  });

  it('handles file_ready with missing optional fields gracefully', () => {
    const received: unknown[] = [];
    bridge.onFileReady((info) => received.push(info));

    bridge.handleMessage({ type: 'file_ready', id: 'minimal' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      id: 'minimal',
      url: '',
      filename: '',
      mimeType: '',
      size: 0
    });
  });
});
