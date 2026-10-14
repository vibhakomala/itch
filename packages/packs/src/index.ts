import { assertPackManifest, type PackManifest } from '@itch/core';
import starter from './starter-pack.json' with { type: 'json' };

assertPackManifest(starter);

export const starterPack: PackManifest = starter;

export { assertPackManifest, validatePackManifest } from '@itch/core';
export type { PackManifest, PieceDefinition } from '@itch/core';
