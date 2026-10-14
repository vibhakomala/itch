import { createEmptyScene, SyntheticTestProvider, type RecordedSession } from '@itch/core';
import {
  assertScene,
  type PackManifest,
  type TangibleObject,
  type TangibleScene,
} from '@itch/protocol';

export { SyntheticTestProvider as MockTangiblesProvider } from '@itch/core';

/** Synthetic data, never recognition output or a physical accuracy claim. */
export const fixturePack: PackManifest = {
  schemaVersion: '1.0',
  packId: 'itch.fixture.v0',
  displayName: 'Synthetic fixture letters',
  pieces: ['A', 'C', 'G', 'O', 'T'].map((letter) => ({
    pieceId: `letter:${letter}`,
    display: letter,
    semantic: { type: 'letter', value: letter },
  })),
};

export function createTangibleObject(overrides: Partial<TangibleObject> = {}): TangibleObject {
  const object = {
    trackId: 'fixture-1',
    pieceId: 'letter:A',
    packId: fixturePack.packId,
    x: 0.25,
    y: 0.5,
    rotationDeg: 0,
    confidence: 1,
    ...overrides,
  };
  assertScene({ ...createEmptyScene(0, 'ready'), objects: [object] });
  return object;
}

export function createScene(overrides: Partial<TangibleScene> = {}): TangibleScene {
  const scene = { ...createEmptyScene(0, 'ready'), ...overrides };
  assertScene(scene);
  return JSON.parse(JSON.stringify(scene)) as TangibleScene;
}

/** Tracks identify slots so repeated letters remain distinct tangible instances. */
export function createWordScene(word: string, timestampMs = 0): TangibleScene {
  const letters = [...word];
  if (letters.length > 10) throw new RangeError('Fixture words support at most ten pieces');
  const objects = letters.map((letter, index) => {
    if (!fixturePack.pieces.some((piece) => piece.pieceId === `letter:${letter}`))
      throw new TypeError(`Unsupported fixture letter: ${letter}`);
    return createTangibleObject({
      trackId: `fixture-${index + 1}`,
      pieceId: `letter:${letter}`,
      x: 0.1 + index * 0.08,
    });
  });
  return createScene({ timestampMs, objects });
}

export function createMockProvider(initialScene?: TangibleScene): SyntheticTestProvider {
  return new SyntheticTestProvider(
    initialScene ? { initialScene, pack: fixturePack } : { pack: fixturePack },
  );
}

export function createTenSecondFixture(): RecordedSession {
  return {
    schemaVersion: '0.1',
    metadata: { synthetic: true, durationMs: 10000, requirement: 'T-P0-03' },
    scenes: Array.from({ length: 11 }, (_, index) => {
      const word = index < 2 ? '' : index < 4 ? 'C' : index < 7 ? 'CAT' : index < 9 ? 'AT' : '';
      return createWordScene(word, index * 1000);
    }),
  };
}
