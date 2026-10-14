import {
  assertPackManifest,
  assertScene,
  type PackManifest,
  type TangibleObject,
  type TangibleScene,
  type WorkspaceStatus,
} from '@itch/protocol';
import { deriveScene } from './derive.js';
import type {
  ObjectListener,
  ProviderStatus,
  SceneListener,
  TangiblesProvider,
  Unsubscribe,
} from './provider.js';
import { cloneScene, createEmptyScene, SceneStore } from './scene-store.js';

export interface SyntheticProviderOptions {
  initialScene?: TangibleScene;
  pack?: PackManifest;
  clock?: () => number;
}

/** A controlled scene source for Phase 0 demos and integration tests. */
export class SyntheticTestProvider implements TangiblesProvider {
  protected readonly store: SceneStore;
  private state: ProviderStatus['state'] = 'idle';
  private readonly pack: PackManifest | undefined;
  private readonly clock: () => number;

  constructor(options: SyntheticProviderOptions = {}) {
    if (options.pack) assertPackManifest(options.pack);
    this.pack = options.pack
      ? (JSON.parse(JSON.stringify(options.pack)) as PackManifest)
      : undefined;
    this.clock = options.clock ?? Date.now;
    const initial = options.initialScene ?? createEmptyScene();
    this.store = new SceneStore(this.prepare(initial));
  }

  async start(): Promise<void> {
    this.state = 'running';
  }
  async stop(): Promise<void> {
    this.state = 'stopped';
  }
  getStatus(): ProviderStatus {
    return { state: this.state };
  }
  getScene(): TangibleScene {
    return this.store.getScene();
  }
  onSceneChanged(listener: SceneListener): Unsubscribe {
    return this.store.onSceneChanged(listener);
  }
  subscribe(listener: SceneListener): Unsubscribe {
    return this.onSceneChanged(listener);
  }
  onObjectAdded(listener: ObjectListener): Unsubscribe {
    return this.store.onObjectAdded(listener);
  }
  onObjectRemoved(listener: ObjectListener): Unsubscribe {
    return this.store.onObjectRemoved(listener);
  }

  setObjects(
    objects: TangibleObject[],
    timestampMs = this.clock(),
    workspaceStatus: WorkspaceStatus = 'ready',
  ): boolean {
    return this.setScene({
      revision: this.getScene().revision,
      timestampMs,
      workspaceStatus,
      objects,
    });
  }

  setScene(scene: TangibleScene): boolean {
    if (this.state !== 'running') return false;
    return this.store.publish(this.prepare(scene));
  }

  private prepare(scene: TangibleScene): TangibleScene {
    assertScene(scene);
    return this.pack ? deriveScene(scene, this.pack) : cloneScene(scene);
  }
}

/** Compatibility name used by the roadmap's immediate Phase 0 work package. */
export { SyntheticTestProvider as MockTangiblesProvider };

export interface RecordedSession {
  schemaVersion: '0.1';
  scenes: TangibleScene[];
  metadata?: Record<string, unknown>;
}

export interface ReplayOptions {
  pack?: PackManifest;
}

/**
 * Scene-fixture replay without a camera or timers. start selects frame zero;
 * step advances one snapshot. Raw image replay remains a vision-layer concern.
 */
export class RecordedSessionProvider implements TangiblesProvider {
  private readonly provider: SyntheticTestProvider;
  private readonly scenes: TangibleScene[];
  private index = -1;

  constructor(session: RecordedSession | TangibleScene[], options: ReplayOptions = {}) {
    if (!Array.isArray(session) && session.schemaVersion !== '0.1')
      throw new TypeError('Unsupported recorded session version');
    const scenes = Array.isArray(session) ? session : session.scenes;
    if (!Array.isArray(scenes)) throw new TypeError('Recorded session scenes must be an array');
    let previousTimestamp = -1;
    this.scenes = scenes.map((scene) => {
      assertScene(scene);
      if (scene.timestampMs < previousTimestamp)
        throw new TypeError('Recorded scene timestamps must be ordered');
      previousTimestamp = scene.timestampMs;
      return cloneScene(scene);
    });
    this.provider = new SyntheticTestProvider(options);
  }

  get position(): number {
    return this.index;
  }
  get length(): number {
    return this.scenes.length;
  }

  async start(): Promise<void> {
    if (this.getStatus().state === 'running') return;
    await this.provider.start();
    if (this.index < 0 && this.scenes.length > 0) this.seek(0);
  }

  async stop(): Promise<void> {
    await this.provider.stop();
  }
  getStatus(): ProviderStatus {
    return this.provider.getStatus();
  }
  getScene(): TangibleScene {
    return this.provider.getScene();
  }
  onSceneChanged(listener: SceneListener): Unsubscribe {
    return this.provider.onSceneChanged(listener);
  }
  subscribe(listener: SceneListener): Unsubscribe {
    return this.onSceneChanged(listener);
  }
  onObjectAdded(listener: ObjectListener): Unsubscribe {
    return this.provider.onObjectAdded(listener);
  }
  onObjectRemoved(listener: ObjectListener): Unsubscribe {
    return this.provider.onObjectRemoved(listener);
  }

  step(): boolean {
    return this.seek(this.index + 1);
  }

  seek(index: number): boolean {
    if (this.getStatus().state !== 'running') return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.scenes.length) return false;
    const scene = this.scenes[index];
    if (!scene) return false;
    this.index = index;
    this.provider.setScene(scene);
    return true;
  }
}
