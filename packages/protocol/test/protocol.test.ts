import { describe, expect, it } from 'vitest';
import { parseScene, validatePackManifest, validateScene } from '../src/index.js';

const scene = {
  revision: 0,
  timestampMs: 0,
  workspaceStatus: 'ready',
  objects: [
    {
      trackId: 't1',
      pieceId: 'letter:A',
      packId: 'test',
      x: 0,
      y: 1,
      rotationDeg: -90,
      confidence: 1,
    },
  ],
  rows: [['t1']],
  derived: { currentWord: 'A' },
};

describe('roadmap section 2.2 scene boundary', () => {
  it('round trips the canonical normalized scene without renaming fields', () => {
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });

  it('rejects invalid poses, duplicate tracking IDs and dangling row references', () => {
    const invalid = {
      ...scene,
      objects: [...scene.objects, { ...scene.objects[0], x: 1.1 }],
      rows: [['missing']],
    };
    const result = validateScene(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('trackId must be unique');
    expect(result.errors.join(' ')).toContain('x must be in [0,1]');
    expect(result.errors.join(' ')).toContain('existing track IDs');
  });

  it.each([NaN, Infinity, undefined, () => 1, new Date()])(
    'rejects a derived value JSON would alter: %s',
    (value) => {
      expect(validateScene({ ...scene, derived: { value } }).valid).toBe(false);
    },
  );

  it('rejects cyclic data instead of attempting to serialize it', () => {
    const derived: Record<string, unknown> = {};
    derived.self = derived;
    expect(validateScene({ ...scene, derived }).errors.join(' ')).toContain('cycle');
  });
});

describe('versioned pack boundary (P9-002)', () => {
  const pack = {
    schemaVersion: '1.0',
    packId: 'test',
    displayName: 'Test',
    pieces: [{ pieceId: 'one', display: 'One', semantic: { type: 'number', value: 1 } }],
  };

  it('accepts metadata without assuming a particular vocabulary', () => {
    expect(validatePackManifest(pack).valid).toBe(true);
  });

  it('rejects an unsupported schema version and duplicate IDs', () => {
    expect(validatePackManifest({ ...pack, schemaVersion: '9.0' }).valid).toBe(false);
    expect(validatePackManifest({ ...pack, pieces: [...pack.pieces, ...pack.pieces] }).valid).toBe(
      false,
    );
  });
});
