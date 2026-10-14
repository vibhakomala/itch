import type { RecordedSession } from '@itch/core';
import { assertScene, PROTOCOL_VERSION, type TangibleScene } from '@itch/protocol';

export interface PerformanceSummary {
  samples: number;
  medianMs: number;
  p95Ms: number;
}

export function summarizeLatency(samples: readonly number[]): PerformanceSummary {
  if (samples.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError('Latency samples must be nonnegative finite milliseconds.');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (fraction: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return { samples: sorted.length, medianMs: quantile(0.5), p95Ms: quantile(0.95) };
}

/** Recording is explicit. This recorder saves normalized state, never camera images. */
export class SceneRecorder {
  private scenes: TangibleScene[] = [];
  private active = false;
  private readonly metadata: Record<string, unknown>;

  constructor(metadata: Record<string, unknown> = {}) {
    assertScene({
      revision: 0,
      timestampMs: 0,
      workspaceStatus: 'uncalibrated',
      objects: [],
      derived: metadata,
    });
    this.metadata = structuredClone(metadata);
  }

  start(): void {
    this.scenes = [];
    this.active = true;
  }

  record(scene: TangibleScene): void {
    if (!this.active) return;
    assertScene(scene);
    const previous = this.scenes.at(-1);
    if (previous && scene.timestampMs < previous.timestampMs) {
      throw new RangeError('Recorded scene timestamps must be nondecreasing.');
    }
    this.scenes.push(structuredClone(scene));
  }

  stop(): RecordedSession {
    this.active = false;
    return this.getSession();
  }

  getSession(): RecordedSession {
    return structuredClone({
      schemaVersion: PROTOCOL_VERSION,
      metadata: this.metadata,
      scenes: this.scenes,
    });
  }

  get isRecording(): boolean {
    return this.active;
  }
  get length(): number {
    return this.scenes.length;
  }
}

export interface CapabilityReport {
  schemaVersion: typeof PROTOCOL_VERSION;
  timestampMs: number;
  browser: string;
  platform: string;
  secureContext: boolean;
  mediaDevices: boolean;
  worker: boolean;
  offscreenCanvas: boolean;
  videoFrameCallback: boolean;
  webgl: boolean;
  webgpu: boolean;
  camera: Record<string, unknown>;
  notes: string[];
}

/** This probe does not request permission, open a camera, or send any data. */
export function probeCapabilities(camera: Record<string, unknown> = {}): CapabilityReport {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const webgl = Boolean(context);
  if (context) context.getExtension('WEBGL_lose_context')?.loseContext();
  return {
    schemaVersion: PROTOCOL_VERSION,
    timestampMs: Date.now(),
    browser: navigator.userAgent,
    platform: navigator.platform,
    secureContext: window.isSecureContext,
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    worker: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    videoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    webgl,
    webgpu: 'gpu' in navigator,
    camera: structuredClone(camera),
    notes: [
      'Capability availability is not a successful device acceptance test.',
      'OS information is limited to browser-exposed user agent/platform fields.',
    ],
  };
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
