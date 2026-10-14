import {
  assertPackManifest,
  assertScene,
  type PackManifest,
  type TangibleObject,
  type TangibleScene,
} from '@itch/protocol';
import { cloneScene } from './scene-store.js';

export interface RowOptions {
  /** Normalized distance from the running row's mean y coordinate. */
  rowTolerance?: number;
  /** Split words when neighboring centers are further apart than this. */
  maxGap?: number;
  minConfidence?: number;
}

/** Synthetic spatial interpretation; recognition identities always come from the pack. */
export function deriveScene(
  scene: TangibleScene,
  pack: PackManifest,
  options: RowOptions = {},
): TangibleScene {
  assertScene(scene);
  assertPackManifest(pack);
  const rowTolerance = options.rowTolerance ?? 0.08;
  const maxGap = options.maxGap ?? 0.25;
  const minConfidence = options.minConfidence ?? 0;
  for (const [key, value] of Object.entries({ rowTolerance, maxGap, minConfidence })) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError(`${key} must be in [0,1]`);
  }
  const groups: { meanY: number; objects: TangibleObject[] }[] = [];
  for (const object of [...scene.objects].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.trackId.localeCompare(b.trackId),
  )) {
    const row = groups.find((group) => Math.abs(group.meanY - object.y) <= rowTolerance);
    if (row) {
      row.meanY = (row.meanY * row.objects.length + object.y) / (row.objects.length + 1);
      row.objects.push(object);
    } else groups.push({ meanY: object.y, objects: [object] });
  }
  groups.sort((a, b) => a.meanY - b.meanY);
  for (const group of groups)
    group.objects.sort((a, b) => a.x - b.x || a.trackId.localeCompare(b.trackId));
  const definitions = new Map(pack.pieces.map((piece) => [piece.pieceId, piece]));
  const words: string[] = [];
  for (const group of groups) {
    let word = '';
    let previous: TangibleObject | undefined;
    for (const object of group.objects) {
      const semantic =
        object.packId === pack.packId ? definitions.get(object.pieceId)?.semantic : undefined;
      const letter =
        object.confidence >= minConfidence &&
        semantic?.type === 'letter' &&
        typeof semantic.value === 'string'
          ? semantic.value
          : undefined;
      if (!letter || (previous !== undefined && object.x - previous.x > maxGap)) {
        if (word) words.push(word);
        word = '';
      }
      if (letter) word += letter;
      previous = object;
    }
    if (word) words.push(word);
  }
  return {
    ...cloneScene(scene),
    rows: groups.map((group) => group.objects.map((object) => object.trackId)),
    derived: { ...scene.derived, words, currentWord: words[0] ?? '' },
  };
}
