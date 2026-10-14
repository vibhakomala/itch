import { describe, expect, it, vi } from 'vitest';
import type { TangibleObject } from '@itch/core';
import { VisionPipeline } from '../src/index.js';
import type { VisionFrame } from '../src/index.js';

const frame: VisionFrame = { id: 'fixture-1', timestampMs: 100, width: 840, height: 592 };
const object: TangibleObject = {
  trackId: 'fixture-A',
  pieceId: 'letter:A',
  packId: 'itch.micro.v0',
  x: 0.2,
  y: 0.3,
  rotationDeg: 0,
  confidence: 1,
};

describe('VisionPipeline (Phase 0 skeleton)', () => {
  it('honestly reports an uncalibrated empty scene without a camera', async () => {
    expect(await new VisionPipeline().processFrame(frame)).toEqual({
      revision: 1,
      timestampMs: 100,
      workspaceStatus: 'uncalibrated',
      objects: [],
    });
  });

  it('passes synthetic fixtures through injected stages in order', async () => {
    const calls: string[] = [];
    const pipeline = new VisionPipeline({
      workspaceDetector: {
        detect: (input) => {
          calls.push(`workspace:${input.id}`);
          return { status: 'ready' };
        },
      },
      workspaceRectifier: {
        rectify: (input, workspace) => {
          calls.push('rectify');
          return { frame: input, workspaceStatus: workspace.status };
        },
      },
      pieceDetector: {
        detect: () => {
          calls.push('pieces');
          return [{ id: 'candidate-A', x: 0.2, y: 0.3, width: 0.1, height: 0.1 }];
        },
      },
      pieceRecognizer: {
        recognize: (pieces) => {
          calls.push(`recognize:${pieces[0]?.id}`);
          return [object];
        },
      },
    });
    expect(await pipeline.processFrame(frame)).toEqual({
      revision: 1,
      timestampMs: 100,
      workspaceStatus: 'ready',
      objects: [object],
    });
    expect(calls).toEqual(['workspace:fixture-1', 'rectify', 'pieces', 'recognize:candidate-A']);
    expect((await pipeline.processFrame({ ...frame, timestampMs: 200 })).revision).toBe(2);
  });

  it('does not emit recognition while the workspace is invalid', async () => {
    const recognize = vi.fn(() => [object]);
    const pipeline = new VisionPipeline({
      workspaceDetector: { detect: () => ({ status: 'degraded' }) },
      pieceRecognizer: { recognize },
    });
    expect((await pipeline.processFrame(frame)).objects).toEqual([]);
    expect(recognize).not.toHaveBeenCalled();
  });
});
