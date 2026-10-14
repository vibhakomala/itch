/** A local, timestamped input. Synthetic fixtures may omit image data. */
export interface VisionFrame {
  id: string;
  timestampMs: number;
  width: number;
  height: number;
  image?: CanvasImageSource | ImageData;
  metadata?: Record<string, unknown>;
}

export type FrameSourceState = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export interface FrameSourceStatus {
  state: FrameSourceState;
  message?: string;
  errorCode?: 'unsupported' | 'permission-denied' | 'not-found' | 'capture-failed';
}

/** Acquisition is separate from calibration/recognition and never uploads frames. */
export interface FrameSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  readFrame(): Promise<VisionFrame | null>;
  getStatus(): FrameSourceStatus;
}
