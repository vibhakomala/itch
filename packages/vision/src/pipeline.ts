import type { TangibleObject, TangibleScene } from '@itch/core';
import type { VisionFrame } from './frame-source.js';

type MaybePromise<T> = T | Promise<T>;
export type WorkspaceStatus = TangibleScene['workspaceStatus'];

export interface WorkspaceDetection {
  status: WorkspaceStatus;
  anchors?: ReadonlyArray<{ x: number; y: number }>;
  confidence?: number;
}

export interface RectifiedWorkspace {
  frame: VisionFrame;
  workspaceStatus: WorkspaceStatus;
}

export interface PieceCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  data?: unknown;
}

export interface WorkspaceDetector {
  detect(frame: VisionFrame): MaybePromise<WorkspaceDetection>;
}
export interface WorkspaceRectifier {
  rectify(frame: VisionFrame, workspace: WorkspaceDetection): MaybePromise<RectifiedWorkspace>;
}
export interface PieceDetector {
  detect(workspace: RectifiedWorkspace): MaybePromise<PieceCandidate[]>;
}
export interface PieceRecognizer {
  recognize(
    pieces: PieceCandidate[],
    workspace: RectifiedWorkspace,
  ): MaybePromise<TangibleObject[]>;
}

/** Explicit Phase 0 placeholders; these perform no calibration or recognition. */
export class NoopWorkspaceDetector implements WorkspaceDetector {
  detect(_frame: VisionFrame): WorkspaceDetection {
    return { status: 'uncalibrated' };
  }
}
export class NoopWorkspaceRectifier implements WorkspaceRectifier {
  rectify(frame: VisionFrame, workspace: WorkspaceDetection): RectifiedWorkspace {
    return { frame, workspaceStatus: workspace.status };
  }
}
export class NoopPieceDetector implements PieceDetector {
  detect(_workspace: RectifiedWorkspace): PieceCandidate[] {
    return [];
  }
}
export class NoopPieceRecognizer implements PieceRecognizer {
  recognize(_pieces: PieceCandidate[], _workspace: RectifiedWorkspace): TangibleObject[] {
    return [];
  }
}

export interface VisionPipelineStages {
  workspaceDetector?: WorkspaceDetector;
  workspaceRectifier?: WorkspaceRectifier;
  pieceDetector?: PieceDetector;
  pieceRecognizer?: PieceRecognizer;
}

export interface FrameProcessor {
  processFrame(frame: VisionFrame): Promise<TangibleScene>;
}

/** Inject stages for deterministic fixture replay; no live camera is required. */
export class VisionPipeline implements FrameProcessor {
  private revision = 0;
  private readonly workspaceDetector: WorkspaceDetector;
  private readonly workspaceRectifier: WorkspaceRectifier;
  private readonly pieceDetector: PieceDetector;
  private readonly pieceRecognizer: PieceRecognizer;

  constructor(stages: VisionPipelineStages = {}) {
    this.workspaceDetector = stages.workspaceDetector ?? new NoopWorkspaceDetector();
    this.workspaceRectifier = stages.workspaceRectifier ?? new NoopWorkspaceRectifier();
    this.pieceDetector = stages.pieceDetector ?? new NoopPieceDetector();
    this.pieceRecognizer = stages.pieceRecognizer ?? new NoopPieceRecognizer();
  }

  async processFrame(frame: VisionFrame): Promise<TangibleScene> {
    const detection = await this.workspaceDetector.detect(frame);
    const workspace = await this.workspaceRectifier.rectify(frame, detection);
    const objects =
      workspace.workspaceStatus === 'ready'
        ? await this.pieceRecognizer.recognize(
            await this.pieceDetector.detect(workspace),
            workspace,
          )
        : [];
    return {
      revision: ++this.revision,
      timestampMs: frame.timestampMs,
      workspaceStatus: workspace.workspaceStatus,
      objects,
    };
  }
}
