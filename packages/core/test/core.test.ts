import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyScene,
  deriveScene,
  RecordedSessionProvider,
  SceneStore,
  SyntheticTestProvider,
  type PackManifest,
  type TangibleObject,
  type TangibleScene,
} from '../src/index.js';

function object(trackId = 'track-1', overrides: Partial<TangibleObject> = {}): TangibleObject {
  return {
    trackId,
    pieceId: 'tile:a',
    packId: 'custom',
    x: 0.1,
    y: 0.4,
    rotationDeg: 0,
    confidence: 1,
    ...overrides,
  };
}

const pack: PackManifest = {
  schemaVersion: '1.0',
  packId: 'custom',
  displayName: 'Custom vocabulary',
  pieces: [
    { pieceId: 'tile:a', display: 'α', semantic: { type: 'letter', value: 'α' } },
    { pieceId: 'tile:b', display: 'β', semantic: { type: 'letter', value: 'β' } },
    { pieceId: 'tile:one', display: '1', semantic: { type: 'number', value: 1 } },
  ],
};

describe('scene publication (ARC-001)', () => {
  it('commits coherent revisions and suppresses timestamp-only duplicates', () => {
    const store = new SceneStore();
    const changes: number[] = [];
    store.onSceneChanged((scene) => changes.push(scene.revision));
    store.onObjectAdded(() => expect(store.getScene().revision).toBe(1));
    expect(store.setObjects([object()], 100, 'ready')).toBe(true);
    expect(store.setObjects([object()], 200, 'ready')).toBe(false);
    expect(changes).toEqual([1]);
    expect(store.getScene().timestampMs).toBe(100);
  });

  it('isolates consumer exceptions and mutations from every other consumer', () => {
    const store = new SceneStore();
    const added = vi.fn();
    store.onObjectAdded(() => {
      throw new Error('Broken consumer');
    });
    store.onObjectAdded(added);
    store.onSceneChanged((scene) => {
      scene.objects.length = 0;
    });
    const received: TangibleScene[] = [];
    store.onSceneChanged((scene) => received.push(scene));
    const input = object();
    expect(() => store.setObjects([input], 0, 'ready')).not.toThrow();
    input.x = 0.9;
    expect(added).toHaveBeenCalledOnce();
    expect(received[0]?.objects[0]?.x).toBe(0.1);
    const copy = store.getScene();
    copy.objects.length = 0;
    expect(store.getScene().objects).toHaveLength(1);
  });

  it('reports identity replacements as remove/add, and pose changes as one scene event', () => {
    const store = new SceneStore();
    const added = vi.fn();
    const removed = vi.fn();
    const changed = vi.fn();
    store.onObjectAdded(added);
    store.onObjectRemoved(removed);
    store.onSceneChanged(changed);
    store.setObjects([object()], 0, 'ready');
    store.setObjects([object('track-1', { x: 0.3 })], 1, 'ready');
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    store.setObjects([object('track-1', { pieceId: 'tile:b' })], 2, 'ready');
    expect(added).toHaveBeenCalledTimes(2);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(3);
    expect(removed.mock.calls[0]?.[0].pieceId).toBe('tile:a');
  });

  it('serializes reentrant changes so later listeners see every coherent revision', () => {
    const store = new SceneStore();
    store.onSceneChanged((scene) => {
      if (scene.revision === 1) store.setObjects([], 2, 'ready');
    });
    const revisions: number[] = [];
    store.onSceneChanged((scene) => {
      expect(store.getScene().revision).toBe(scene.revision);
      revisions.push(scene.revision);
    });
    store.setObjects([object()], 1, 'ready');
    expect(revisions).toEqual([1, 2]);
    expect(store.getScene().objects).toEqual([]);
  });

  it('unsubscribe is idempotent and object order alone creates no duplicate event', () => {
    const store = new SceneStore();
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    const objects = [object('one'), object('two', { x: 0.2 })];
    store.setObjects(objects, 0, 'ready');
    expect(store.setObjects([...objects].reverse(), 1, 'ready')).toBe(false);
    unsubscribe();
    unsubscribe();
    store.setObjects([], 2, 'ready');
    expect(changed).toHaveBeenCalledOnce();
  });
});

describe('manifest-driven synthetic rows', () => {
  it('orders rows and derives letters from metadata, independently of IDs or glyphs', () => {
    const scene = {
      ...createEmptyScene(0, 'ready'),
      objects: [
        object('right', { pieceId: 'tile:b', x: 0.25 }),
        object('bottom', { y: 0.8 }),
        object('left'),
      ],
    };
    const derived = deriveScene(scene, pack);
    expect(derived.rows).toEqual([['left', 'right'], ['bottom']]);
    expect(derived.derived).toMatchObject({ currentWord: 'αβ', words: ['αβ', 'α'] });
    expect(scene).not.toHaveProperty('rows');
  });

  it('splits words at gaps, unknown packs, nonletters and low confidence', () => {
    const scene = {
      ...createEmptyScene(0, 'ready'),
      objects: [
        object('first'),
        object('gap', { x: 0.5 }),
        object('number', { x: 0.6, pieceId: 'tile:one' }),
        object('letter', { x: 0.7, pieceId: 'tile:b' }),
        object('unknown', { x: 0.8, packId: 'other' }),
        object('noisy', { x: 0.9, confidence: 0.1 }),
      ],
    };
    expect(deriveScene(scene, pack, { minConfidence: 0.5 }).derived?.words).toEqual([
      'α',
      'α',
      'β',
    ]);
  });
});

describe('synthetic provider lifecycle', () => {
  it('can start/stop repeatedly and preserves frozen scene while stopped', async () => {
    const provider = new SyntheticTestProvider({ pack, clock: () => 123 });
    expect(provider.getStatus().state).toBe('idle');
    expect(provider.setObjects([object()])).toBe(false);
    await provider.start();
    await provider.start();
    expect(provider.setObjects([object()])).toBe(true);
    expect(provider.getScene()).toMatchObject({ timestampMs: 123, derived: { currentWord: 'α' } });
    await provider.stop();
    await provider.stop();
    expect(provider.setObjects([])).toBe(false);
    expect(provider.getScene().objects).toHaveLength(1);
    await provider.start();
    expect(provider.setObjects([])).toBe(true);
  });
});

describe('deterministic 10-second fixture replay (T-P0-03)', () => {
  const scenes = Array.from({ length: 11 }, (_, index): TangibleScene => ({
    ...createEmptyScene(index * 1000, 'ready'),
    objects:
      index < 2 || index >= 9 ? [] : [object('one', { pieceId: index < 5 ? 'tile:a' : 'tile:b' })],
  }));

  async function run(): Promise<{ words: unknown[]; added: string[]; removed: string[] }> {
    const replay = new RecordedSessionProvider(scenes, { pack });
    const words: unknown[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    replay.onSceneChanged((scene) => words.push(scene.derived?.currentWord));
    replay.onObjectAdded((object) => added.push(object.pieceId));
    replay.onObjectRemoved((object) => removed.push(object.pieceId));
    await replay.start();
    while (replay.step()) {
      /* explicit fixture clock */
    }
    expect(replay.position).toBe(10);
    await replay.stop();
    expect(replay.seek(0)).toBe(false);
    return { words, added, removed };
  }

  it('reproduces identical semantic events with no live camera and no wall-clock waits', async () => {
    const first = await run();
    expect(first).toEqual(await run());
    expect(first).toEqual({
      words: ['', 'α', 'β', ''],
      added: ['tile:a', 'tile:b'],
      removed: ['tile:a', 'tile:b'],
    });
  });

  it('validates ordered timestamps and allows seeking backwards with increasing revisions', async () => {
    expect(() => new RecordedSessionProvider([...scenes].reverse())).toThrow(
      'timestamps must be ordered',
    );
    const replay = new RecordedSessionProvider(scenes, { pack });
    await replay.start();
    replay.seek(5);
    const before = replay.getScene().revision;
    replay.seek(2);
    expect(replay.getScene().timestampMs).toBe(2000);
    expect(replay.getScene().revision).toBe(before + 1);
    expect(replay.getScene().derived?.currentWord).toBe('α');
  });
});
