import type { TangibleObject, TangiblesProvider, Unsubscribe } from '@itch/core';

export const ITCH_VERSION = '0.1.0';

/** The small part of Scratch Runtime used by this Phase 0 adapter. */
export interface ScratchRuntime {
  startHats(opcode: string): unknown;
}

export class ScratchBridge {
  private readonly unsubscribe: Unsubscribe;

  constructor(
    private readonly provider: TangiblesProvider,
    runtime?: ScratchRuntime,
  ) {
    let previousWord = this.currentWord();
    this.unsubscribe = provider.onSceneChanged(() => {
      const currentWord = this.currentWord();
      runtime?.startHats('itch_whenSceneChanges');
      if (currentWord !== previousWord) {
        previousWord = currentWord;
        runtime?.startHats('itch_whenWordChanges');
      }
    });
  }

  currentWord(): string {
    const value = this.provider.getScene().derived?.['currentWord'];
    return typeof value === 'string' ? value : '';
  }

  ready(): boolean {
    return (
      this.provider.getStatus().state === 'running' &&
      this.provider.getScene().workspaceStatus === 'ready'
    );
  }

  pieceCount(): number {
    return this.provider.getScene().objects.length;
  }

  piecePresent(pieceId: string): boolean {
    return this.findPiece(pieceId) !== undefined;
  }

  pieceX(pieceId: string): number {
    return this.findPiece(pieceId)?.x ?? 0;
  }

  pieceY(pieceId: string): number {
    return this.findPiece(pieceId)?.y ?? 0;
  }

  pieceRotation(pieceId: string): number {
    return this.findPiece(pieceId)?.rotationDeg ?? 0;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private findPiece(pieceId: string): TangibleObject | undefined {
    // If copies exist, choose the same visible track independently of array order.
    return this.provider
      .getScene()
      .objects.filter((object) => object.pieceId === pieceId)
      .sort((a, b) => a.trackId.localeCompare(b.trackId))[0];
  }
}

interface PieceArguments {
  PIECE: string;
}

export interface ScratchBlockInfo {
  opcode: string;
  blockType: 'reporter' | 'Boolean' | 'event';
  text: string;
  arguments?: Record<string, { type: 'string'; defaultValue: string }>;
  isEdgeActivated?: boolean;
  shouldRestartExistingThreads?: boolean;
}

export interface ScratchExtensionInfo {
  id: string;
  name: string;
  blocks: ScratchBlockInfo[];
}

export class ItchScratchExtension {
  readonly bridge: ScratchBridge;

  constructor(provider: TangiblesProvider, runtime?: ScratchRuntime) {
    this.bridge = new ScratchBridge(provider, runtime);
  }

  getInfo(): ScratchExtensionInfo {
    const piece = { PIECE: { type: 'string' as const, defaultValue: 'letter:A' } };
    return {
      id: 'itch',
      name: 'ITCH',
      blocks: [
        { opcode: 'itchVersion', blockType: 'reporter', text: 'ITCH version' },
        { opcode: 'itchReady', blockType: 'Boolean', text: 'ITCH ready?' },
        {
          opcode: 'whenSceneChanges',
          blockType: 'event',
          text: 'when tangible scene changes',
          isEdgeActivated: false,
          shouldRestartExistingThreads: true,
        },
        {
          opcode: 'whenWordChanges',
          blockType: 'event',
          text: 'when word changes',
          isEdgeActivated: false,
          shouldRestartExistingThreads: true,
        },
        { opcode: 'currentWord', blockType: 'reporter', text: 'current word' },
        { opcode: 'pieceCount', blockType: 'reporter', text: 'number of pieces' },
        {
          opcode: 'piecePresent',
          blockType: 'Boolean',
          text: 'piece [PIECE] present?',
          arguments: piece,
        },
        {
          opcode: 'pieceX',
          blockType: 'reporter',
          text: 'piece [PIECE] x position',
          arguments: piece,
        },
        {
          opcode: 'pieceY',
          blockType: 'reporter',
          text: 'piece [PIECE] y position',
          arguments: piece,
        },
        {
          opcode: 'pieceRotation',
          blockType: 'reporter',
          text: 'piece [PIECE] rotation',
          arguments: piece,
        },
      ],
    };
  }

  itchVersion(): string {
    return ITCH_VERSION;
  }

  itchReady(): boolean {
    return this.bridge.ready();
  }

  currentWord(): string {
    return this.bridge.currentWord();
  }

  pieceCount(): number {
    return this.bridge.pieceCount();
  }

  piecePresent({ PIECE }: PieceArguments): boolean {
    return this.bridge.piecePresent(PIECE);
  }

  pieceX({ PIECE }: PieceArguments): number {
    return this.bridge.pieceX(PIECE);
  }

  pieceY({ PIECE }: PieceArguments): number {
    return this.bridge.pieceY(PIECE);
  }

  pieceRotation({ PIECE }: PieceArguments): number {
    return this.bridge.pieceRotation(PIECE);
  }

  dispose(): void {
    this.bridge.dispose();
  }
}

/** Private Scratch API: isolate this spike until a real-VM integration is verified. */
export interface ScratchVmRegistrationTarget {
  runtime: ScratchRuntime;
  extensionManager: {
    _registerInternalExtension(extension: ItchScratchExtension): string;
  };
}

export function registerScratchExtension(
  vm: ScratchVmRegistrationTarget,
  provider: TangiblesProvider,
): { extension: ItchScratchExtension; serviceName: string; dispose: () => void } {
  const extension = new ItchScratchExtension(provider, vm.runtime);
  try {
    const serviceName = vm.extensionManager._registerInternalExtension(extension);
    return { extension, serviceName, dispose: () => extension.dispose() };
  } catch (error) {
    extension.dispose();
    throw error;
  }
}
