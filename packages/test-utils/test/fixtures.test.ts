import { describe, expect, it } from 'vitest';
import { RecordedSessionProvider } from '@itch/core';
import { createTenSecondFixture, createWordScene, fixturePack } from '../src/index.js';

describe('synthetic fixture helpers', () => {
  it('assigns different track IDs to repeated letter instances', () => {
    const scene = createWordScene('OO');
    expect(scene.objects.map((object) => object.pieceId)).toEqual(['letter:O', 'letter:O']);
    expect(new Set(scene.objects.map((object) => object.trackId)).size).toBe(2);
    expect(() => createWordScene('Z')).toThrow('Unsupported fixture letter');
  });

  it('replays the fixture timeline without a camera, including duplicate snapshots', async () => {
    const fixture = createTenSecondFixture();
    expect(fixture.scenes[10]?.timestampMs).toBe(10000);
    const replay = new RecordedSessionProvider(fixture, { pack: fixturePack });
    const words: unknown[] = [];
    replay.subscribe((scene) => words.push(scene.derived?.currentWord));
    await replay.start();
    while (replay.step()) {
      /* deterministic explicit clock */
    }
    expect(words).toEqual(['', 'C', 'CAT', 'AT', '']);
  });
});
