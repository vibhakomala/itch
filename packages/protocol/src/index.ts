/** Serializable compatibility boundary for ITCH roadmap v0.1, section 2.2. */
export const PROTOCOL_VERSION = '0.1' as const;
export const PACK_SCHEMA_VERSION = '1.0' as const;

export type TangibleId = string;
export type WorkspaceStatus = 'uncalibrated' | 'calibrating' | 'ready' | 'degraded';

export interface TangibleObject {
  trackId: string;
  pieceId: TangibleId;
  packId: string;
  /** Coordinates in the rectified workspace: origin top left, x right, y down. */
  x: number;
  y: number;
  rotationDeg: number;
  confidence: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface TangibleScene {
  revision: number;
  timestampMs: number;
  workspaceStatus: WorkspaceStatus;
  objects: TangibleObject[];
  /** Ordered track IDs: rows top to bottom, objects left to right. */
  rows?: string[][];
  derived?: Record<string, unknown>;
}

export interface PieceDefinition {
  pieceId: TangibleId;
  display: string;
  semantic: { type: string; value: string | number | boolean };
}

export interface PackManifest {
  schemaVersion: typeof PACK_SCHEMA_VERSION;
  packId: string;
  displayName: string;
  pieces: PieceDefinition[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function unit(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** JSON must retain values exactly; dates, cycles, undefined and NaN are rejected. */
function jsonErrors(value: unknown, path: string, ancestors: Set<object>, errors: string[]): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || value === null) {
    errors.push(`${path} must be JSON serializable`);
    return;
  }
  if (ancestors.has(value)) {
    errors.push(`${path} contains a cycle`);
    return;
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    errors.push(`${path} must be a plain JSON object`);
    return;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) errors.push(`${path} contains symbol keys`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      jsonErrors(value[index], `${path}[${index}]`, ancestors, errors);
    }
  } else {
    for (const [key, child] of Object.entries(value))
      jsonErrors(child, `${path}.${key}`, ancestors, errors);
  }
  ancestors.delete(value);
}

export function validateScene(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!record(input)) return { valid: false, errors: ['scene must be an object'] };
  jsonErrors(input, 'scene', new Set(), errors);
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0)
    errors.push('scene.revision must be a nonnegative safe integer');
  if (!finite(input.timestampMs) || input.timestampMs < 0)
    errors.push('scene.timestampMs must be a nonnegative finite number');
  if (
    !['uncalibrated', 'calibrating', 'ready', 'degraded'].includes(input.workspaceStatus as string)
  )
    errors.push('scene.workspaceStatus is invalid');
  const tracks = new Set<string>();
  if (!Array.isArray(input.objects)) {
    errors.push('scene.objects must be an array');
  } else {
    input.objects.forEach((object: unknown, index: number) => {
      const path = `scene.objects[${index}]`;
      if (!record(object)) {
        errors.push(`${path} must be an object`);
        return;
      }
      for (const key of ['trackId', 'pieceId', 'packId']) {
        if (!nonempty(object[key])) errors.push(`${path}.${key} must be a nonempty string`);
      }
      if (typeof object.trackId === 'string') {
        if (tracks.has(object.trackId)) errors.push(`${path}.trackId must be unique`);
        tracks.add(object.trackId);
      }
      for (const key of ['x', 'y', 'confidence']) {
        if (!unit(object[key])) errors.push(`${path}.${key} must be in [0,1]`);
      }
      if (!finite(object.rotationDeg)) errors.push(`${path}.rotationDeg must be finite`);
      if (object.bbox !== undefined) {
        if (!record(object.bbox)) errors.push(`${path}.bbox must be an object`);
        else
          for (const key of ['x', 'y', 'w', 'h']) {
            if (!unit(object.bbox[key])) errors.push(`${path}.bbox.${key} must be in [0,1]`);
          }
      }
    });
  }
  if (input.rows !== undefined) {
    if (!Array.isArray(input.rows)) errors.push('scene.rows must be an array');
    else {
      const rowTracks = new Set<string>();
      for (const [index, row] of input.rows.entries()) {
        if (!Array.isArray(row)) {
          errors.push(`scene.rows[${index}] must be an array`);
          continue;
        }
        for (const track of row) {
          if (typeof track !== 'string' || !tracks.has(track))
            errors.push(`scene.rows[${index}] must contain existing track IDs`);
          else if (rowTracks.has(track))
            errors.push(`scene.rows contains duplicate track ID ${track}`);
          else rowTracks.add(track);
        }
      }
    }
  }
  if (input.derived !== undefined && !record(input.derived))
    errors.push('scene.derived must be an object');
  return { valid: errors.length === 0, errors };
}

export function assertScene(input: unknown): asserts input is TangibleScene {
  const result = validateScene(input);
  if (!result.valid) throw new TypeError(result.errors.join('; '));
}

export function parseScene(json: string): TangibleScene {
  const value: unknown = JSON.parse(json);
  assertScene(value);
  return value;
}

export function validatePackManifest(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!record(input)) return { valid: false, errors: ['pack must be an object'] };
  jsonErrors(input, 'pack', new Set(), errors);
  if (input.schemaVersion !== PACK_SCHEMA_VERSION)
    errors.push(`pack.schemaVersion must be ${PACK_SCHEMA_VERSION}`);
  for (const key of ['packId', 'displayName'])
    if (!nonempty(input[key])) errors.push(`pack.${key} must be a nonempty string`);
  if (!Array.isArray(input.pieces) || input.pieces.length === 0) {
    errors.push('pack.pieces must be a nonempty array');
  } else {
    const ids = new Set<string>();
    input.pieces.forEach((piece: unknown, index: number) => {
      const path = `pack.pieces[${index}]`;
      if (!record(piece)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (!nonempty(piece.pieceId)) errors.push(`${path}.pieceId must be a nonempty string`);
      else {
        if (ids.has(piece.pieceId)) errors.push(`${path}.pieceId must be unique`);
        ids.add(piece.pieceId);
      }
      if (!nonempty(piece.display)) errors.push(`${path}.display must be a nonempty string`);
      if (!record(piece.semantic) || !nonempty(piece.semantic.type))
        errors.push(`${path}.semantic.type must be a nonempty string`);
      else if (
        typeof piece.semantic.value !== 'string' &&
        typeof piece.semantic.value !== 'boolean' &&
        !finite(piece.semantic.value)
      )
        errors.push(`${path}.semantic.value must be a string, boolean or finite number`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function assertPackManifest(input: unknown): asserts input is PackManifest {
  const result = validatePackManifest(input);
  if (!result.valid) throw new TypeError(result.errors.join('; '));
}
