import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertPackManifest,
  RecordedSessionProvider,
  type RecordedSession,
  type TangibleScene,
} from '../src/index.js';

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
}

describe('on-disk synthetic CAT fixture (NFR-003 / T-P0-03)', () => {
  it('preserves the ten-second scene and event timeline across repeated replay', async () => {
    const metadata = readJson('../../../fixtures/synthetic-cat/metadata.json');
    expect(metadata).toMatchObject({
      schemaVersion: '0.1',
      source: 'synthetic',
      packId: 'itch.starter.v0',
      durationMs: 10000,
      camera: null,
    });
    const session = readJson(
      '../../../fixtures/synthetic-cat/expected-scenes.json',
    ) as RecordedSession;
    const outputs: TangibleScene[][] = [];
    for (let run = 0; run < 2; run += 1) {
      const replay = new RecordedSessionProvider(session);
      const scenes: TangibleScene[] = [];
      const placed: string[] = [];
      const removed: string[] = [];
      replay.subscribe((scene) => scenes.push(scene));
      replay.onObjectAdded((object) => placed.push(object.pieceId));
      replay.onObjectRemoved((object) => removed.push(object.pieceId));
      await replay.start();
      while (replay.step()) {
        /* fixture time advances explicitly */
      }
      await replay.stop();
      expect(scenes.map((scene) => scene.timestampMs)).toEqual([0, 5000, 10000]);
      expect(scenes.map((scene) => scene.derived?.currentWord)).toEqual(['CAT', 'CT', 'CAT']);
      expect(placed).toEqual(['letter:C', 'letter:A', 'letter:T', 'letter:A']);
      expect(removed).toEqual(['letter:A']);
      expect(scenes).toEqual(session.scenes);
      outputs.push(scenes);
    }
    expect(outputs[0]).toEqual(outputs[1]);
  });

  it('recomputes exactly the golden rows and words using the manifest and normalized spacing', async () => {
    const pack = readJson('../../packs/src/starter-pack.json');
    assertPackManifest(pack);
    const session = readJson(
      '../../../fixtures/synthetic-cat/expected-scenes.json',
    ) as RecordedSession;
    const replay = new RecordedSessionProvider(session, { pack });
    const scenes: TangibleScene[] = [];
    replay.subscribe((scene) => scenes.push(scene));
    await replay.start();
    while (replay.step()) {
      /* no camera is used */
    }
    expect(scenes).toEqual(session.scenes);
    await replay.stop();
  });
});
