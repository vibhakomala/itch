import {
  assertScene,
  type TangibleObject,
  type TangibleScene,
  type WorkspaceStatus,
} from '@itch/protocol';
import type { ObjectListener, SceneListener, Unsubscribe } from './provider.js';

export function createEmptyScene(
  timestampMs = 0,
  workspaceStatus: WorkspaceStatus = 'uncalibrated',
): TangibleScene {
  return { revision: 0, timestampMs, workspaceStatus, objects: [] };
}

/** Validated scenes contain only JSON values, so JSON cloning is lossless. */
export function cloneScene(scene: TangibleScene): TangibleScene {
  return JSON.parse(JSON.stringify(scene)) as TangibleScene;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function content(scene: TangibleScene): string {
  const rest: Partial<TangibleScene> = { ...scene };
  delete rest.revision;
  delete rest.timestampMs;
  return canonical({
    ...rest,
    objects: [...scene.objects].sort((left, right) => left.trackId.localeCompare(right.trackId)),
  });
}

function identityChanged(previous: TangibleObject, next: TangibleObject): boolean {
  return previous.pieceId !== next.pieceId || previous.packId !== next.packId;
}

/**
 * Scene ownership, revisions and event differences. Input must already be stabilized:
 * this store deliberately does not interpret raw camera detections (Phase 2).
 */
export class SceneStore {
  private scene: TangibleScene;
  private readonly sceneListeners = new Set<SceneListener>();
  private readonly addedListeners = new Set<ObjectListener>();
  private readonly removedListeners = new Set<ObjectListener>();
  private readonly queue: TangibleScene[] = [];
  private dispatching = false;

  constructor(
    initialScene: TangibleScene = createEmptyScene(),
    private readonly onListenerError?: (error: unknown) => void,
  ) {
    assertScene(initialScene);
    this.scene = cloneScene(initialScene);
  }

  getScene(): TangibleScene {
    return cloneScene(this.scene);
  }

  onSceneChanged(listener: SceneListener): Unsubscribe {
    this.sceneListeners.add(listener);
    return () => {
      this.sceneListeners.delete(listener);
    };
  }

  subscribe(listener: SceneListener): Unsubscribe {
    return this.onSceneChanged(listener);
  }

  onObjectAdded(listener: ObjectListener): Unsubscribe {
    this.addedListeners.add(listener);
    return () => {
      this.addedListeners.delete(listener);
    };
  }

  onObjectRemoved(listener: ObjectListener): Unsubscribe {
    this.removedListeners.add(listener);
    return () => {
      this.removedListeners.delete(listener);
    };
  }

  /** Returns false for repeated scene content, even when its timestamp changes. */
  publish(next: TangibleScene): boolean {
    assertScene(next);
    const candidate = cloneScene(next);
    const last = this.queue[this.queue.length - 1] ?? this.scene;
    if (content(candidate) === content(last)) return false;
    this.queue.push(candidate);
    if (this.dispatching) return true;
    this.dispatching = true;
    try {
      let pending = this.queue.shift();
      while (pending) {
        this.commit(pending);
        pending = this.queue.shift();
      }
    } finally {
      this.dispatching = false;
    }
    return true;
  }

  setObjects(
    objects: TangibleObject[],
    timestampMs = this.scene.timestampMs,
    workspaceStatus: WorkspaceStatus = this.scene.workspaceStatus,
  ): boolean {
    // A changed object list invalidates old rows and derivations.
    return this.publish({ revision: this.scene.revision, timestampMs, workspaceStatus, objects });
  }

  private notify<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of [...listeners]) {
      try {
        listener(JSON.parse(JSON.stringify(value)) as T);
      } catch (error) {
        // A consumer cannot stop publication or prevent delivery to other consumers.
        try {
          this.onListenerError?.(error);
        } catch {
          /* diagnostics must also be isolated */
        }
      }
    }
  }

  private commit(next: TangibleScene): void {
    if (content(next) === content(this.scene)) return;
    const previous = this.scene;
    if (previous.revision === Number.MAX_SAFE_INTEGER)
      throw new RangeError('Scene revision exhausted');
    this.scene = { ...next, revision: previous.revision + 1 };
    const before = new Map(previous.objects.map((object) => [object.trackId, object]));
    const after = new Map(this.scene.objects.map((object) => [object.trackId, object]));
    // getScene() already returns the committed revision during every event callback.
    for (const object of previous.objects) {
      const replacement = after.get(object.trackId);
      if (!replacement || identityChanged(object, replacement))
        this.notify(this.removedListeners, object);
    }
    for (const object of this.scene.objects) {
      const old = before.get(object.trackId);
      if (!old || identityChanged(old, object)) this.notify(this.addedListeners, object);
    }
    this.notify(this.sceneListeners, this.scene);
  }
}
