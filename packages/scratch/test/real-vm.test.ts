import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { SyntheticTestProvider, type TangibleObject } from '@itch/core';
import { starterPack } from '@itch/packs';
import { describe, expect, it, vi } from 'vitest';
import {
  ITCH_VERSION,
  registerScratchExtension,
  type ScratchVmRegistrationTarget,
} from '../src/index.js';

/** Test-only view of private APIs in the pinned 15.2.0 VM package. */
interface StageTarget {
  isStage: boolean;
  createVariable(id: string, name: string, type: string, isCloud: boolean): void;
  blocks: { createBlock(block: Record<string, unknown>): void };
  variables: Record<string, { value: unknown }>;
}

interface RealVm extends ScratchVmRegistrationTarget {
  stopAll(): void;
  runtime: ScratchVmRegistrationTarget['runtime'] & {
    getOpcodeFunction(
      opcode: string,
    ): ((args: Record<string, unknown>, util: unknown) => unknown) | undefined;
    getTargetForStage(): StageTarget | undefined;
    addTarget(target: StageTarget): void;
    _hats: Record<string, { edgeActivated: boolean }>;
    currentStepTime: number | null;
    _step(): void;
    dispose(): void;
  };
}

// Version 15.2.0's Node bundle fails resolving browser/default-stylesheet.css.
// Use its shipped source instead; no extension manager or sequencer is mocked.
// Neither package entry supplies TypeScript declarations.
const require = createRequire(import.meta.url);
const vmSource = resolve(dirname(require.resolve('@scratch/scratch-vm')), '../../src/index.js');
const VirtualMachine = require(vmSource) as new () => RealVm;
const Sprite = require(resolve(dirname(vmSource), 'sprites/sprite.js')) as new (
  blocks: null,
  runtime: RealVm['runtime'],
) => { name: string; createClone(): StageTarget };

function installSceneStack(stage: StageTarget): void {
  // Attach a real Scratch stack to an assetless stage. Project extension
  // persistence/loading is a separate gate; the helper registers in memory only.
  stage.blocks.createBlock({
    id: 'scene-hat',
    opcode: 'itch_whenSceneChanges',
    next: 'increment-count',
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: true,
    x: 0,
    y: 0,
  });
  stage.blocks.createBlock({
    id: 'increment-count',
    opcode: 'data_changevariableby',
    next: null,
    parent: 'scene-hat',
    inputs: { VALUE: { name: 'VALUE', block: 'one', shadow: 'one' } },
    fields: { VARIABLE: { name: 'VARIABLE', value: 'scene changes observed', id: 'scene-count' } },
    shadow: false,
    topLevel: false,
  });
  stage.blocks.createBlock({
    id: 'one',
    opcode: 'math_number',
    next: null,
    parent: 'increment-count',
    inputs: {},
    fields: { NUM: { name: 'NUM', value: '1' } },
    shadow: true,
    topLevel: false,
  });
}

const tile: TangibleObject = {
  trackId: 'test-A',
  pieceId: 'letter:A',
  packId: starterPack.packId,
  x: 0.2,
  y: 0.5,
  rotationDeg: 0,
  confidence: 1,
};

describe('real Scratch VM hello-extension (T-P0-02 Node integration)', () => {
  it('registers reporters and executes a real scene-event stack', async () => {
    const vm = new VirtualMachine();
    const provider = new SyntheticTestProvider({ pack: starterPack });
    const connection = registerScratchExtension(vm, provider);
    try {
      // Registration installs primitives through asynchronous central dispatch.
      await vi.waitFor(() => {
        expect(vm.runtime.getOpcodeFunction('itch_itchVersion')).toBeTypeOf('function');
        expect(vm.runtime.getOpcodeFunction('itch_itchReady')).toBeTypeOf('function');
        expect(vm.runtime._hats['itch_whenSceneChanges']).toMatchObject({ edgeActivated: false });
      });
      const version = vm.runtime.getOpcodeFunction('itch_itchVersion');
      const ready = vm.runtime.getOpcodeFunction('itch_itchReady');
      if (!version || !ready) throw new Error('ITCH reporter primitives were not registered.');
      expect(version({}, {})).toBe(ITCH_VERSION);
      expect(ready({}, {})).toBe(false);

      const sprite = new Sprite(null, vm.runtime);
      sprite.name = 'Stage';
      const stage = sprite.createClone();
      stage.isStage = true;
      stage.createVariable('scene-count', 'scene changes observed', '', false);
      vm.runtime.addTarget(stage);
      expect(vm.runtime.getTargetForStage()).toBe(stage);
      installSceneStack(stage);
      await provider.start();
      provider.setObjects([tile], 100);
      expect(ready({}, {})).toBe(true);
      // Step the real sequencer manually, without launching a timer or renderer.
      // Runtime.start() normally sets this scheduler work budget before ticking.
      vm.runtime.currentStepTime = 1000 / 30;
      vm.runtime._step();
      expect(stage.variables['scene-count']?.value).toBe(1);

      // Duplicate content and ordinary runtime ticks must not launch this event.
      provider.setObjects([tile], 200);
      vm.runtime._step();
      expect(stage.variables['scene-count']?.value).toBe(1);
      provider.setObjects([{ ...tile, x: 0.3 }], 300);
      vm.runtime._step();
      expect(stage.variables['scene-count']?.value).toBe(2);

      connection.dispose();
      provider.setObjects([], 400);
      vm.runtime._step();
      expect(stage.variables['scene-count']?.value).toBe(2);
      await provider.stop();
      expect(ready({}, {})).toBe(false);
    } finally {
      connection.dispose();
      await provider.stop();
      vm.stopAll();
      vm.runtime.dispose();
    }
  });
});
