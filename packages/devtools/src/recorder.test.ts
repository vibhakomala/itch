import { describe, expect, it } from 'vitest';
import { createEmptyScene, RecordedSessionProvider } from '@itch/core';
import { SceneRecorder, summarizeLatency } from './index.js';

describe('Scene recording and deterministic replay (P0-004 / T-P0-03)', () => {
  it('records a ten-second timeline and replays identical snapshots on two runs', async () => {
    const recorder = new SceneRecorder({ fixture: 'ten-second-synthetic' });
    recorder.start();
    for (let index = 0; index <= 100; index += 1) {
      recorder.record({
        ...createEmptyScene(),
        revision: index,
        timestampMs: index * 100,
        workspaceStatus: 'ready',
        objects:
          index % 4 === 0
            ? []
            : [
                {
                  trackId: 'recorded-a',
                  pieceId: 'letter:A',
                  packId: 'test',
                  x: index / 100,
                  y: 0.5,
                  rotationDeg: 0,
                  confidence: 1,
                },
              ],
      });
    }
    const session = recorder.stop();
    expect(session.scenes.at(-1)?.timestampMs).toBe(10_000);
    const outputs: unknown[][] = [];
    for (let run = 0; run < 2; run += 1) {
      const output: unknown[] = [];
      const provider = new RecordedSessionProvider(JSON.parse(JSON.stringify(session)));
      provider.subscribe((scene) => output.push(scene));
      await provider.start();
      while (provider.step()) {
        /* explicit advancement, no live camera or timer */
      }
      await provider.stop();
      outputs.push(output);
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]).toHaveLength(101);
  });

  it('does not record implicitly, clones inputs, and rejects backwards time', () => {
    const recorder = new SceneRecorder();
    const scene = { ...createEmptyScene(), timestampMs: 100 };
    recorder.record(scene);
    expect(recorder.length).toBe(0);
    recorder.start();
    recorder.record(scene);
    scene.timestampMs = 200;
    expect(recorder.getSession().scenes[0]?.timestampMs).toBe(100);
    expect(() => recorder.record({ ...scene, timestampMs: 99 })).toThrow('nondecreasing');
  });

  it('preserves JSON-safe recording provenance independently of caller mutations', () => {
    const metadata = { camera: { width: 640 } };
    const recorder = new SceneRecorder(metadata);
    metadata.camera.width = 320;
    expect(recorder.getSession().metadata).toEqual({ camera: { width: 640 } });
    expect(() => new SceneRecorder({ date: new Date() })).toThrow('plain JSON');
  });
});

it('reports latency percentile values without mutating samples', () => {
  const samples = [40, 10, 30, 20];
  expect(summarizeLatency(samples)).toEqual({ samples: 4, medianMs: 20, p95Ms: 40 });
  expect(samples).toEqual([40, 10, 30, 20]);
  expect(summarizeLatency([]).medianMs).toBe(0);
  expect(() => summarizeLatency([NaN])).toThrow();
});
