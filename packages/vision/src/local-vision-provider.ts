import { SceneStore, createEmptyScene } from '@itch/core';
import type {
  ProviderStatus,
  TangibleObject,
  TangibleScene,
  TangiblesProvider,
  Unsubscribe,
} from '@itch/core';
import type { FrameSource } from './frame-source.js';
import { VisionPipeline } from './pipeline.js';
import type { FrameProcessor } from './pipeline.js';

export interface VisionDiagnostics {
  running: boolean;
  targetFps: number;
  /** Frames sampled locally by the source; actual camera FPS is track metadata. */
  captureFps: number;
  processingFps: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  capturedFrames: number;
  processedFrames: number;
  /** Processing intervals skipped while a frame was in flight; no backlog is kept. */
  droppedFrames: number;
  errors: number;
  lastError?: string;
}

export interface LocalVisionProviderOptions {
  targetFps?: number;
  onDiagnostics?: (diagnostics: VisionDiagnostics) => void;
  now?: () => number;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

/**
 * Sequential local processing at 15 Hz by default (NFR-002, NFR-006).
 * At most one frame is acquired/processed at a time. Stop fences late results,
 * and a restart waits for an older in-flight operation before sampling again.
 * This Phase 0 main-thread spike is not a benchmark-backed worker decision.
 */
export class LocalVisionProvider implements TangiblesProvider {
  private readonly store = new SceneStore(createEmptyScene());
  private status: ProviderStatus = { state: 'idle' };
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startPromise: Promise<void> | undefined;
  private inFlight: Promise<void> | undefined;
  private readonly targetFps: number;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private captureTimes: number[] = [];
  private processingTimes: number[] = [];
  private latencySamples: number[] = [];
  private diagnostics: VisionDiagnostics;

  constructor(
    private readonly source: FrameSource,
    private readonly pipeline: FrameProcessor = new VisionPipeline(),
    private readonly options: LocalVisionProviderOptions = {},
  ) {
    this.targetFps = options.targetFps ?? 15;
    if (!Number.isFinite(this.targetFps) || this.targetFps <= 0 || this.targetFps > 120) {
      throw new RangeError('Processing FPS must be greater than zero and at most 120.');
    }
    this.intervalMs = 1000 / this.targetFps;
    this.now = options.now ?? (() => performance.now());
    this.diagnostics = this.emptyDiagnostics();
  }

  getScene(): TangibleScene {
    return this.store.getScene();
  }
  getStatus(): ProviderStatus {
    return { ...this.status };
  }
  getDiagnostics(): VisionDiagnostics {
    return { ...this.diagnostics };
  }
  onSceneChanged(callback: (scene: TangibleScene) => void): Unsubscribe {
    return this.store.onSceneChanged(callback);
  }
  onObjectAdded(callback: (object: TangibleObject) => void): Unsubscribe {
    return this.store.onObjectAdded(callback);
  }
  onObjectRemoved(callback: (object: TangibleObject) => void): Unsubscribe {
    return this.store.onObjectRemoved(callback);
  }
  subscribe(callback: (scene: TangibleScene) => void): Unsubscribe {
    return this.onSceneChanged(callback);
  }

  async start(): Promise<void> {
    if (this.status.state === 'running') return;
    if (this.startPromise) return this.startPromise;
    const generation = ++this.generation;
    this.status = { state: 'idle', message: 'Starting frame source.' };
    const pending = this.startSource(generation);
    this.startPromise = pending;
    try {
      await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = undefined;
    }
  }

  private async startSource(generation: number): Promise<void> {
    try {
      await this.source.start();
      if (generation !== this.generation) return;
      this.status = { state: 'running' };
      this.captureTimes = [];
      this.processingTimes = [];
      this.latencySamples = [];
      this.diagnostics = { ...this.emptyDiagnostics(), running: true };
      this.reportDiagnostics();
      this.schedule(generation, 0);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.fail(error, generation);
      throw error;
    }
  }

  async stop(): Promise<void> {
    ++this.generation;
    this.startPromise = undefined;
    this.clearTimer();
    this.status = { state: 'stopped' };
    this.diagnostics.running = false;
    await this.source.stop();
    this.reportDiagnostics();
  }

  private schedule(generation: number, delayMs: number): void {
    if (generation !== this.generation || this.status.state !== 'running') return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick(generation);
    }, delayMs);
  }

  private async tick(generation: number): Promise<void> {
    if (generation !== this.generation || this.status.state !== 'running') return;
    if (this.inFlight) {
      this.schedule(generation, this.intervalMs);
      return;
    }
    const startedAt = this.now();
    const pending = this.processOneFrame(generation, startedAt);
    this.inFlight = pending;
    try {
      await pending;
    } catch (error) {
      await this.fail(error, generation);
    } finally {
      if (this.inFlight === pending) this.inFlight = undefined;
      if (generation === this.generation && this.status.state === 'running') {
        const elapsed = Math.max(0, this.now() - startedAt);
        this.diagnostics.droppedFrames += Math.max(0, Math.floor(elapsed / this.intervalMs) - 1);
        this.reportDiagnostics();
        this.schedule(generation, Math.max(0, this.intervalMs - elapsed));
      }
    }
  }

  private async processOneFrame(generation: number, startedAt: number): Promise<void> {
    const frame = await this.source.readFrame();
    if (generation !== this.generation || !frame) return;
    this.diagnostics.capturedFrames++;
    this.recordTime(this.captureTimes, this.now());
    const scene = await this.pipeline.processFrame(frame);
    if (generation !== this.generation) return;
    const completedAt = this.now();
    this.diagnostics.processedFrames++;
    this.recordTime(this.processingTimes, completedAt);
    this.latencySamples.push(Math.max(0, completedAt - startedAt));
    if (this.latencySamples.length > 120) this.latencySamples.shift();
    this.diagnostics.captureFps = this.fps(this.captureTimes);
    this.diagnostics.processingFps = this.fps(this.processingTimes);
    this.diagnostics.medianLatencyMs = percentile(this.latencySamples, 0.5);
    this.diagnostics.p95LatencyMs = percentile(this.latencySamples, 0.95);
    this.store.publish(scene);
  }

  private async fail(error: unknown, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    ++this.generation;
    this.clearTimer();
    const message = error instanceof Error ? error.message : String(error);
    this.status = { state: 'error', message };
    this.diagnostics.running = false;
    this.diagnostics.errors++;
    this.diagnostics.lastError = message;
    try {
      await this.source.stop();
    } catch {
      /* Preserve the original acquisition/processing error. */
    }
    this.reportDiagnostics();
  }

  private recordTime(times: number[], at: number): void {
    times.push(at);
    while (times.length > 120 || (times.length > 1 && at - times[0]! > 2000)) times.shift();
  }

  private fps(times: number[]): number {
    if (times.length < 2) return 0;
    const duration = times[times.length - 1]! - times[0]!;
    return duration > 0 ? ((times.length - 1) * 1000) / duration : 0;
  }

  private emptyDiagnostics(): VisionDiagnostics {
    return {
      running: false,
      targetFps: this.targetFps,
      captureFps: 0,
      processingFps: 0,
      medianLatencyMs: 0,
      p95LatencyMs: 0,
      capturedFrames: 0,
      processedFrames: 0,
      droppedFrames: 0,
      errors: 0,
    };
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private reportDiagnostics(): void {
    try {
      this.options.onDiagnostics?.(this.getDiagnostics());
    } catch {
      /* Diagnostics do not control processing. */
    }
  }
}
