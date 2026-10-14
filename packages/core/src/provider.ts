import type { TangibleObject, TangibleScene } from '@itch/protocol';

export type Unsubscribe = () => void;
export type SceneListener = (scene: TangibleScene) => void;
export type ObjectListener = (object: TangibleObject) => void;

export interface ProviderStatus {
  state: 'idle' | 'running' | 'stopped' | 'error';
  message?: string;
}

/** Camera, replay and remote providers share this device-independent contract. */
export interface TangiblesProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  getScene(): TangibleScene;
  onSceneChanged(listener: SceneListener): Unsubscribe;
  onObjectAdded(listener: ObjectListener): Unsubscribe;
  onObjectRemoved(listener: ObjectListener): Unsubscribe;
  subscribe(listener: SceneListener): Unsubscribe;
  getStatus(): ProviderStatus;
}
