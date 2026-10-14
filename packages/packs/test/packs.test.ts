import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starterPack, validatePackManifest } from '../src/index.js';

describe('starter tangible metadata (ARC-004, NFR-005)', () => {
  it('publishes the six requested letter meanings with a versioned manifest', () => {
    expect(validatePackManifest(starterPack)).toEqual({ valid: true, errors: [] });
    expect(starterPack.schemaVersion).toBe('1.0');
    expect(starterPack.pieces.map((piece) => piece.semantic.value).join('')).toBe('CATDOG');
    expect(new Set(starterPack.pieces.map((piece) => piece.pieceId)).size).toBe(6);
  });

  it('keeps the physical pack manifest synchronized with the package data', () => {
    const printedManifest: unknown = JSON.parse(
      readFileSync(
        new URL('../../../tangible-packs/starter/manifest.json', import.meta.url),
        'utf8',
      ),
    );
    expect(printedManifest).toEqual(starterPack);
  });

  it('rejects malformed semantic metadata before use', () => {
    expect(validatePackManifest({ ...starterPack, pieces: [{ pieceId: 'broken' }] }).valid).toBe(
      false,
    );
  });
});
