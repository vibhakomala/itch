import { SyntheticTestProvider, type TangibleObject } from '@itch/core';
import { starterPack } from '@itch/packs';
import { describe, expect, it, vi } from 'vitest';
import { ITCH_VERSION, ItchScratchExtension, registerScratchExtension } from '../src/index.js';

function objects(word: string): TangibleObject[] {
  return [...word].map((letter, index) => ({
    trackId: `tile-${index}`,
    pieceId: `letter:${letter}`,
    packId: starterPack.packId,
    x: 0.2 + index * 0.2,
    y: 0.5,
    rotationDeg: 15,
    confidence: 1,
  }));
}

describe('Phase 0 Scratch adapter contract (T-P0-02 partial)', () => {
  it('registers hello reporters and dispatches an executable mock scene event', async () => {
    const provider = new SyntheticTestProvider({ pack: starterPack });
    const sceneHat = vi.fn();
    const wordHat = vi.fn();
    const startHats = vi.fn((opcode: string) => {
      if (opcode === 'itch_whenSceneChanges') sceneHat();
      if (opcode === 'itch_whenWordChanges') wordHat();
    });
    const register = vi.fn((extension: ItchScratchExtension) => {
      expect(extension.getInfo().id).toBe('itch');
      return 'extension_0_itch';
    });
    const connection = registerScratchExtension(
      { runtime: { startHats }, extensionManager: { _registerInternalExtension: register } },
      provider,
    );
    await provider.start();
    provider.setObjects(objects('CAT'), 100);
    expect(register).toHaveBeenCalledOnce();
    expect(connection.serviceName).toBe('extension_0_itch');
    expect(connection.extension.itchVersion()).toBe(ITCH_VERSION);
    expect(connection.extension.itchReady()).toBe(true);
    expect(connection.extension.currentWord()).toBe('CAT');
    expect(sceneHat).toHaveBeenCalled();
    expect(wordHat).toHaveBeenCalledOnce();
    expect(
      connection.extension.getInfo().blocks.find((block) => block.opcode === 'whenSceneChanges'),
    ).toMatchObject({ blockType: 'event', isEdgeActivated: false });
    connection.dispose();
    await provider.stop();
  });

  it('reports poses, distinguishes word changes from movement, and unsubscribes', async () => {
    const provider = new SyntheticTestProvider({ pack: starterPack });
    await provider.start();
    const startHats = vi.fn();
    const extension = new ItchScratchExtension(provider, { startHats });
    provider.setObjects(objects('CAT'), 100);
    startHats.mockClear();
    const moved = objects('CAT');
    const first = moved[0];
    if (!first) throw new Error('Missing test object');
    first.x = 0.21;
    provider.setObjects(moved, 200);
    expect(startHats.mock.calls.map(([opcode]) => opcode)).toEqual(['itch_whenSceneChanges']);
    expect(extension.pieceCount()).toBe(3);
    expect(extension.piecePresent({ PIECE: 'letter:C' })).toBe(true);
    expect(extension.piecePresent({ PIECE: 'letter:D' })).toBe(false);
    expect(extension.pieceX({ PIECE: 'letter:C' })).toBe(0.21);
    expect(extension.pieceY({ PIECE: 'letter:C' })).toBe(0.5);
    expect(extension.pieceRotation({ PIECE: 'letter:C' })).toBe(15);
    expect(extension.pieceX({ PIECE: 'letter:D' })).toBe(0);
    extension.dispose();
    startHats.mockClear();
    provider.setObjects(objects('DOG'), 300);
    expect(startHats).not.toHaveBeenCalled();
    await provider.stop();
  });

  it('cleans subscriptions when registration fails and requires a running ready scene', async () => {
    const provider = new SyntheticTestProvider({ pack: starterPack });
    const startHats = vi.fn();
    expect(() =>
      registerScratchExtension(
        {
          runtime: { startHats },
          extensionManager: {
            _registerInternalExtension: () => {
              throw new Error('unsupported');
            },
          },
        },
        provider,
      ),
    ).toThrow('unsupported');
    await provider.start();
    provider.setObjects(objects('CAT'), 100);
    expect(startHats).not.toHaveBeenCalled();
    const extension = new ItchScratchExtension(provider);
    expect(extension.itchReady()).toBe(true);
    provider.setObjects([], 200, 'degraded');
    expect(extension.itchReady()).toBe(false);
    await provider.stop();
    expect(extension.itchReady()).toBe(false);
    extension.dispose();
  });
});
