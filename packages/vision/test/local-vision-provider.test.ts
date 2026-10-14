import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TangibleScene } from '@itch/core';
import { LocalVisionProvider } from '../src/index.js';
import type { FrameSource, VisionFrame } from '../src/index.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function scene(frame: VisionFrame): TangibleScene {
  return {
    revision: 1,
    timestampMs: frame.timestampMs,
    workspaceStatus: 'ready',
    objects: [
      {
        trackId: frame.id,
        pieceId: 'letter:A',
        packId: 'itch.micro.v0',
        x: 0.2,
        y: 0.3,
        rotationDeg: 0,
        confidence: 1,
      },
    ],
  };
}

function syntheticSource() {
  let sequence = 0;
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    readFrame: vi.fn(async () => ({
      id: `synthetic-${++sequence}`,
      timestampMs: sequence * 100,
      width: 840,
      height: 592,
    })),
    getStatus: () => ({ state: 'running' as const }),
  } satisfies FrameSource;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LocalVisionProvider', () => {
  it('publishes fixture scenes through the provider contract and stops sampling', async () => {
    const source = syntheticSource();
    const changed = vi.fn();
    const added = vi.fn();
    const diagnostics = vi.fn();
    const provider = new LocalVisionProvider(
      source,
      { processFrame: async (frame) => scene(frame) },
      { onDiagnostics: diagnostics },
    );
    provider.onSceneChanged(changed);
    provider.onObjectAdded(added);
    await provider.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(provider.getStatus().state).toBe('running');
    expect(provider.getScene().objects[0]?.pieceId).toBe('letter:A');
    expect(changed).toHaveBeenCalled();
    expect(added).toHaveBeenCalled();
    expect(provider.getDiagnostics()).toMatchObject({
      running: true,
      errors: 0,
      capturedFrames: 3,
      processedFrames: 3,
    });
    expect(diagnostics).toHaveBeenCalled();
    await provider.stop();
    const count = source.readFrame.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(source.readFrame).toHaveBeenCalledTimes(count);
    expect(source.stop).toHaveBeenCalledOnce();
    expect(provider.getStatus().state).toBe('stopped');
  });

  it('ignores processing results that resolve after stop', async () => {
    const source = syntheticSource();
    const processing = deferred<TangibleScene>();
    const changed = vi.fn();
    const provider = new LocalVisionProvider(source, { processFrame: () => processing.promise });
    provider.onSceneChanged(changed);
    await provider.start();
    await vi.advanceTimersByTimeAsync(1);
    await provider.stop();
    processing.resolve(scene({ id: 'late', timestampMs: 1, width: 1, height: 1 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.getScene().objects).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
    expect(provider.getDiagnostics().processedFrames).toBe(0);
  });

  it('restarts without overlapping an older in-flight processor', async () => {
    const source = syntheticSource();
    const oldProcessing = deferred<TangibleScene>();
    const processFrame = vi
      .fn()
      .mockImplementationOnce(() => oldProcessing.promise)
      .mockImplementation(async (frame: VisionFrame) => scene(frame));
    const provider = new LocalVisionProvider(source, { processFrame });
    await provider.start();
    await vi.advanceTimersByTimeAsync(1);
    await provider.stop();
    await provider.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(source.readFrame).toHaveBeenCalledOnce();
    expect(processFrame).toHaveBeenCalledOnce();
    oldProcessing.resolve(scene({ id: 'old', timestampMs: 0, width: 1, height: 1 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.getScene().objects[0]?.trackId).toBe('synthetic-2');
    expect(source.start).toHaveBeenCalledTimes(2);
    await provider.stop();
  });

  it('keeps a slow processor sequential and reports missed processing intervals', async () => {
    const source = syntheticSource();
    const processing = deferred<TangibleScene>();
    let now = 0;
    const provider = new LocalVisionProvider(
      source,
      { processFrame: () => processing.promise },
      { now: () => now },
    );
    await provider.start();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(source.readFrame).toHaveBeenCalledOnce();
    now = 300;
    processing.resolve(scene({ id: 'slow', timestampMs: 100, width: 1, height: 1 }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.getDiagnostics()).toMatchObject({
      medianLatencyMs: 300,
      p95LatencyMs: 300,
      droppedFrames: 3,
    });
    await provider.stop();
  });

  it('reports a source failure and releases its resources', async () => {
    const source = syntheticSource();
    source.readFrame.mockRejectedValueOnce(new Error('Capture failed'));
    const provider = new LocalVisionProvider(source);
    await provider.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(provider.getStatus()).toEqual({ state: 'error', message: 'Capture failed' });
    expect(provider.getDiagnostics()).toMatchObject({
      running: false,
      errors: 1,
      lastError: 'Capture failed',
    });
    expect(source.stop).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300);
    expect(source.readFrame).toHaveBeenCalledOnce();
  });

  it('does not resume when source startup resolves after stop', async () => {
    const source = syntheticSource();
    const opening = deferred<void>();
    source.start.mockImplementationOnce(() => opening.promise);
    const provider = new LocalVisionProvider(source);
    const starting = provider.start();
    await provider.stop();
    opening.resolve();
    await starting;
    await vi.advanceTimersByTimeAsync(200);
    expect(provider.getStatus().state).toBe('stopped');
    expect(source.readFrame).not.toHaveBeenCalled();
  });
});
