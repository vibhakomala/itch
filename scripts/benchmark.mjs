import { performance } from 'node:perf_hooks';
import { SyntheticTestProvider } from '@itch/core';
import { VisionPipeline } from '@itch/vision';
import { summarizeLatency } from '@itch/devtools';
import { starterPack } from '@itch/packs';

const provider = new SyntheticTestProvider({ pack: starterPack });
const pipeline = new VisionPipeline();
await provider.start();
const pipelineSamples = [];
const coreSamples = [];
for (let index = 0; index < 1000; index += 1) {
  let start = performance.now();
  await pipeline.processFrame({
    id: String(index),
    timestampMs: index * 100,
    width: 640,
    height: 480,
  });
  pipelineSamples.push(performance.now() - start);
  start = performance.now();
  provider.setObjects(
    starterPack.pieces.slice(0, 3).map((piece, pieceIndex) => ({
      trackId: `bench-${pieceIndex}`,
      pieceId: piece.pieceId,
      packId: starterPack.packId,
      x: 0.2 + pieceIndex * 0.25 + (index % 2) * 0.01,
      y: 0.5,
      rotationDeg: 0,
      confidence: 1,
    })),
    index * 100,
    'ready',
  );
  coreSamples.push(performance.now() - start);
}
await provider.stop();
console.log(
  JSON.stringify(
    {
      mode: 'synthetic CPU benchmark; no recognition or real-camera performance measured',
      pipeline: summarizeLatency(pipelineSamples),
      core: summarizeLatency(coreSamples),
      captureFps: null,
      processingFps: null,
      droppedFrames: 0,
      note: 'Use Vision Demo diagnostics and hardware matrix for measured device capture/processing FPS.',
    },
    null,
    2,
  ),
);
