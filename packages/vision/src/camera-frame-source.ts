import type { FrameSource, FrameSourceStatus, VisionFrame } from './frame-source.js';

export interface CameraMediaDevices {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices?(): Promise<MediaDeviceInfo[]>;
}

export interface CameraFrameSourceOptions {
  deviceId?: string;
  facingMode?: 'user' | 'environment';
  maxWidth?: number;
  maxHeight?: number;
  mediaDevices?: CameraMediaDevices;
  createCanvas?: () => HTMLCanvasElement;
  now?: () => number;
  onStatusChanged?: (status: FrameSourceStatus) => void;
}

export interface CameraInfo {
  deviceId?: string | undefined;
  label?: string | undefined;
  facingMode?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  frameRate?: number | undefined;
}

function errorStatus(error: unknown): FrameSourceStatus {
  const name = error instanceof Error ? error.name : '';
  const errorCode =
    name === 'NotAllowedError' || name === 'SecurityError'
      ? 'permission-denied'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'not-found'
        : 'capture-failed';
  return {
    state: 'error',
    errorCode,
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Camera acquisition for the Phase 0 preview spike (P0-001).
 * The front camera is preferred unless a device or environment camera is chosen.
 * Preview mirroring belongs in the UI. No mirror compensation or workspace
 * rectification is applied here; calibrated transforms are a Phase 1 gate.
 */
export class CameraFrameSource implements FrameSource {
  private status: FrameSourceStatus = { state: 'idle' };
  private stream: MediaStream | undefined;
  private startPromise: Promise<void> | undefined;
  private generation = 0;
  private frameNumber = 0;
  private canvas: HTMLCanvasElement | undefined;
  private readonly releasedStreams = new WeakSet<MediaStream>();
  private readonly mediaDevices: CameraMediaDevices | undefined;
  private readonly maxWidth: number;
  private readonly maxHeight: number;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: CameraFrameSourceOptions = {},
  ) {
    this.mediaDevices =
      options.mediaDevices ??
      (typeof navigator === 'undefined' ? undefined : navigator.mediaDevices);
    this.maxWidth = options.maxWidth ?? 640;
    this.maxHeight = options.maxHeight ?? 480;
    if (
      !Number.isFinite(this.maxWidth) ||
      !Number.isFinite(this.maxHeight) ||
      this.maxWidth < 1 ||
      this.maxHeight < 1
    ) {
      throw new RangeError('Camera capture dimensions must be positive finite numbers.');
    }
  }

  getStatus(): FrameSourceStatus {
    return { ...this.status };
  }

  getCameraInfo(): CameraInfo {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return {};
    const settings = track.getSettings();
    return {
      deviceId: settings.deviceId,
      label: track.label,
      facingMode: settings.facingMode,
      width: settings.width ?? (this.video.videoWidth || undefined),
      height: settings.height ?? (this.video.videoHeight || undefined),
      frameRate: settings.frameRate,
    };
  }

  async enumerateCameras(): Promise<MediaDeviceInfo[]> {
    if (!this.mediaDevices?.enumerateDevices) return [];
    return (await this.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === 'videoinput',
    );
  }

  async start(): Promise<void> {
    if (this.status.state === 'running') return;
    if (this.startPromise) return this.startPromise;
    if (!this.mediaDevices?.getUserMedia) {
      const message =
        'Camera access is unavailable. Use a supported browser on HTTPS or localhost.';
      this.setStatus({ state: 'error', errorCode: 'unsupported', message });
      throw new Error(message);
    }
    const generation = ++this.generation;
    this.setStatus({ state: 'starting' });
    const pending = this.openCamera(generation);
    this.startPromise = pending;
    try {
      await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = undefined;
    }
  }

  private async openCamera(generation: number): Promise<void> {
    let stream: MediaStream | undefined;
    try {
      stream = await this.mediaDevices!.getUserMedia({
        audio: false,
        video: {
          ...(this.options.deviceId
            ? { deviceId: { exact: this.options.deviceId } }
            : { facingMode: { ideal: this.options.facingMode ?? 'user' } }),
          width: { ideal: this.maxWidth },
          height: { ideal: this.maxHeight },
        },
      });
      if (generation !== this.generation) {
        this.release(stream);
        return;
      }
      this.stream = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) {
        this.release(stream);
        return;
      }
      this.setStatus({ state: 'running' });
    } catch (error) {
      if (stream) this.release(stream);
      if (generation !== this.generation) return;
      this.setStatus(errorStatus(error));
      throw error;
    }
  }

  async stop(): Promise<void> {
    ++this.generation;
    this.startPromise = undefined;
    if (this.stream) this.release(this.stream);
    this.canvas = undefined;
    this.setStatus({ state: 'stopped' });
  }

  async readFrame(): Promise<VisionFrame | null> {
    if (this.status.state !== 'running') return null;
    try {
      if (
        !this.stream ||
        this.stream.getVideoTracks().some((track) => track.readyState === 'ended')
      ) {
        throw new Error('The camera stream ended. Start the camera again to recover.');
      }
      const width = this.video.videoWidth;
      const height = this.video.videoHeight;
      if (width === 0 || height === 0 || this.video.readyState < 2) return null;
      this.canvas ??= this.options.createCanvas?.() ?? document.createElement('canvas');
      const ratio = Math.min(1, this.maxWidth / width, this.maxHeight / height);
      const captureWidth = Math.max(1, Math.round(width * ratio));
      const captureHeight = Math.max(1, Math.round(height * ratio));
      if (this.canvas.width !== captureWidth) this.canvas.width = captureWidth;
      if (this.canvas.height !== captureHeight) this.canvas.height = captureHeight;
      const context = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('A local 2D canvas is required to capture camera frames.');
      context.drawImage(this.video, 0, 0, captureWidth, captureHeight);
      const image = context.getImageData(0, 0, captureWidth, captureHeight);
      return {
        id: `camera-${++this.frameNumber}`,
        timestampMs: this.options.now?.() ?? Date.now(),
        width: captureWidth,
        height: captureHeight,
        image,
        metadata: { camera: this.getCameraInfo(), source: 'camera', mirrored: false },
      };
    } catch (error) {
      if (this.stream) this.release(this.stream);
      this.setStatus(errorStatus(error));
      throw error;
    }
  }

  private release(stream: MediaStream): void {
    if (!this.releasedStreams.has(stream)) {
      this.releasedStreams.add(stream);
      for (const track of stream.getTracks()) track.stop();
    }
    if (this.video.srcObject === stream) {
      this.video.pause();
      this.video.srcObject = null;
    }
    if (this.stream === stream) this.stream = undefined;
  }

  private setStatus(status: FrameSourceStatus): void {
    this.status = status;
    try {
      this.options.onStatusChanged?.({ ...status });
    } catch {
      /* UI listeners do not own camera lifetime. */
    }
  }
}
