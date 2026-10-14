import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraFrameSource } from '../src/index.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function cameraMocks() {
  const stop = vi.fn();
  const track = {
    stop,
    label: 'Front camera',
    readyState: 'live',
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30, facingMode: 'user' }),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const video = {
    srcObject: null,
    muted: false,
    playsInline: false,
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 4,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
  return { stop, track, stream, video };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CameraFrameSource (P0-001)', () => {
  it('reports unsupported camera APIs explicitly', async () => {
    vi.stubGlobal('navigator', {});
    const { video } = cameraMocks();
    const source = new CameraFrameSource(video);
    await expect(source.start()).rejects.toThrow('Camera access is unavailable');
    expect(source.getStatus()).toMatchObject({ state: 'error', errorCode: 'unsupported' });
    expect(await source.readFrame()).toBeNull();
  });

  it('reports a denied permission and permits a later retry', async () => {
    const { video, stream, stop } = cameraMocks();
    const denied = new Error('Camera permission denied');
    denied.name = 'NotAllowedError';
    const getUserMedia = vi.fn().mockRejectedValueOnce(denied).mockResolvedValue(stream);
    const source = new CameraFrameSource(video, { mediaDevices: { getUserMedia } });
    await expect(source.start()).rejects.toThrow('Camera permission denied');
    expect(source.getStatus()).toMatchObject({ state: 'error', errorCode: 'permission-denied' });
    await source.start();
    expect(source.getStatus().state).toBe('running');
    await source.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('prefers the front camera, exposes metadata, and stops every track', async () => {
    const { video, stream, stop } = cameraMocks();
    const getUserMedia = vi.fn(async () => stream);
    const source = new CameraFrameSource(video, { mediaDevices: { getUserMedia } });
    await source.start();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
    });
    expect(video.srcObject).toBe(stream);
    expect(video.playsInline).toBe(true);
    expect(source.getCameraInfo()).toMatchObject({ width: 1280, height: 720, frameRate: 30 });
    await source.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(source.getStatus().state).toBe('stopped');
  });

  it('honors explicit camera selection and filters camera enumeration', async () => {
    const { video, stream } = cameraMocks();
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => stream);
    const devices = [
      { kind: 'audioinput', deviceId: 'mic' },
      { kind: 'videoinput', deviceId: 'rear' },
    ] as MediaDeviceInfo[];
    const source = new CameraFrameSource(video, {
      deviceId: 'rear',
      mediaDevices: { getUserMedia, enumerateDevices: async () => devices },
    });
    expect(await source.enumerateCameras()).toEqual([devices[1]]);
    await source.start();
    expect(getUserMedia.mock.calls[0]?.[0]).toMatchObject({
      video: { deviceId: { exact: 'rear' } },
    });
    await source.stop();
  });

  it('releases a stream received after stop without opening the preview', async () => {
    const { video, stream, stop } = cameraMocks();
    const pending = deferred<MediaStream>();
    const source = new CameraFrameSource(video, {
      mediaDevices: { getUserMedia: () => pending.promise },
    });
    const started = source.start();
    expect(source.getStatus().state).toBe('starting');
    await source.stop();
    pending.resolve(stream);
    await started;
    expect(stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(source.getStatus().state).toBe('stopped');
  });

  it('lets a restart supersede a pending old permission request', async () => {
    const first = cameraMocks();
    const second = cameraMocks();
    const oldPermission = deferred<MediaStream>();
    const getUserMedia = vi
      .fn()
      .mockReturnValueOnce(oldPermission.promise)
      .mockResolvedValueOnce(second.stream);
    const source = new CameraFrameSource(first.video, { mediaDevices: { getUserMedia } });
    const oldStart = source.start();
    await source.stop();
    await source.start();
    oldPermission.resolve(first.stream);
    await oldStart;
    expect(first.stop).toHaveBeenCalledOnce();
    expect(first.video.srcObject).toBe(second.stream);
    expect(source.getStatus().state).toBe('running');
    await source.stop();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it('releases the stream when video playback fails', async () => {
    const { video, stream, stop } = cameraMocks();
    vi.mocked(video.play).mockRejectedValueOnce(new Error('Video playback failed'));
    const source = new CameraFrameSource(video, {
      mediaDevices: { getUserMedia: async () => stream },
    });
    await expect(source.start()).rejects.toThrow('Video playback failed');
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(source.getStatus().errorCode).toBe('capture-failed');
  });

  it('captures bounded local image data and preserves the aspect ratio', async () => {
    const { video, stream } = cameraMocks();
    const image = { width: 640, height: 360, data: new Uint8ClampedArray() } as ImageData;
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => image) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const source = new CameraFrameSource(video, {
      mediaDevices: { getUserMedia: async () => stream },
      createCanvas: () => canvas,
      now: () => 123,
    });
    await source.start();
    const frame = await source.readFrame();
    expect(frame).toMatchObject({
      id: 'camera-1',
      timestampMs: 123,
      width: 640,
      height: 360,
      image,
    });
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(frame?.metadata).toMatchObject({ source: 'camera', mirrored: false });
    await source.stop();
  });

  it('releases camera tracks when local capture fails', async () => {
    const { video, stream, stop } = cameraMocks();
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    const source = new CameraFrameSource(video, {
      mediaDevices: { getUserMedia: async () => stream },
      createCanvas: () => canvas,
    });
    await source.start();
    await expect(source.readFrame()).rejects.toThrow('2D canvas');
    expect(stop).toHaveBeenCalledOnce();
    expect(source.getStatus().state).toBe('error');
    expect(video.srcObject).toBeNull();
  });

  it('reports an unexpectedly ended camera stream instead of remaining running', async () => {
    const { video, stream, track, stop } = cameraMocks();
    const source = new CameraFrameSource(video, {
      mediaDevices: { getUserMedia: async () => stream },
    });
    await source.start();
    track.readyState = 'ended';
    await expect(source.readFrame()).rejects.toThrow('camera stream ended');
    expect(source.getStatus().state).toBe('error');
    expect(stop).toHaveBeenCalledOnce();
  });
});
