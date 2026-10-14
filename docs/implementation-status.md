# Bootstrap engineering report

Reference: ITCH-ROADMAP-001 v0.1. Verified on 13 October 2026 with Windows,
Node 24.21.0, pnpm 10.20.0 and Playwright Chromium. The original roadmap is
preserved; [scope reconciliation](architecture/scope.md) records differences
from the accompanying bootstrap brief.

## Implemented

The Git repository and pnpm monorepo contain strict TypeScript packages for
protocol, core, vision, Scratch, packs, devtools and test utilities. Vision Demo
has explicit camera controls, camera selection, permission/error states, preview
mirroring, diagnostics, scene JSON, synthetic CAT/DOG controls, scene recording
and replay, capability reports, and opt-in camera still export.

Core validates normalized scenes, owns subscriptions/revisions and scene
differences, derives rows/words from pack metadata, and supplies synthetic/mock
and recorded-session providers. Camera acquisition is separate from injectable
vision stages; placeholder stages publish no detections and remain uncalibrated.

The thin Scratch adapter exposes version/readiness, word, count, presence and
pose reporters plus scene/word events. A real Node Scratch VM integration test
registers the extension and executes a native Scratch event stack. The browser
player is a contract harness. Six printable SVG letter tiles, a fabrication
sheet, draft A5/jig specifications, ADRs and CI are included.

## Architecture decisions

Use the roadmap's `trackId`, `pieceId`, `packId`, `revision`, `timestampMs` and
`rotationDeg` compatibility contract. A5 is landscape, 210 × 148 mm; coordinates
start at the upper-left and increase right/down. Camera frames stay local.
Scratch consumes the provider API independently of camera implementation.

Keep recognition, mirror compensation and raw detection stabilization deferred
until the roadmap gates allow them. The temporary main-thread pipeline processes
sequentially at 15 Hz with no backlog. Worker adoption and marker families remain
open decisions that require measurements. See [ADRs](adr/README.md).

## Verification

| Check                                       | Result                                          |
| ------------------------------------------- | ----------------------------------------------- |
| `pnpm install --frozen-lockfile`            | Passed                                          |
| Clean TypeScript rebuild / `pnpm typecheck` | Passed; core/protocol compile without DOM types |
| `pnpm lint`                                 | Passed, including package-boundary checks       |
| `pnpm format:check`                         | Passed                                          |
| `pnpm test`                                 | 54 tests passed in 11 files                     |
| `pnpm build`                                | All libraries and both production apps built    |
| `pnpm test:e2e`                             | 6 Chromium browser tests passed                 |
| `pnpm benchmark`                            | Passed; synthetic CPU measurement only          |
| GitHub Actions                              | Workflow created; hosted execution not yet run  |

Tests cover JSON contracts, scene events, observer isolation, pack semantics,
golden CAT → CT → CAT snapshots, deterministic ten-second replay, camera lifecycle,
permission/unsupported failures, throttling, late asynchronous results, Scratch
reporters and real VM event execution. Browser tests verify synthetic movement
with stable IDs, recording/export/replay, error recovery, responsive layout,
fake-camera frames, explicit PNG export and track cleanup. A desktop screenshot
was visually reviewed.

## Commands

On this Windows workspace, activate the portable Node toolchain in each new
PowerShell session, then use the root commands:

```powershell
. ./scripts/setup-node.ps1
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm dev:player` opens the player harness. `pnpm test:e2e` first builds libraries;
install its test browser once with `pnpm exec playwright install chromium`.
For trusted HTTPS on mobile, follow [development setup](development.md).

## Current MVP status and known limits

The synthetic provider → core → debug UI/Scratch adapter vertical slice works,
and the camera preview feeds the local placeholder pipeline. Automatic A5
calibration, physical piece recognition, raw tracking/debounce, continuous camera
sequence recording, browser Scratch hosting and `.sb3` playback are not implemented.
Printed hardware has not been physically validated.

The pinned Scratch VM's default Node bundle fails to resolve
`browser/default-stylesheet.css`; the integration test uses its shipped source.
The private extension registration path remains isolated and provisional, with
project persistence/distribution unverified.

The full MVP and Phase 0 device exit gate remain open: no actual iPad/iPhone-class
or Android device acceptance evidence is available. No physical recognition
accuracy or interaction latency target is claimed.

## Next task

Execute T-P0-01 and T-P0-04 on one iPad/iPhone-class and one Android device: export
capability/camera reports, run a two-minute preview at ≥10 FPS, and record camera
selection, orientation and permission recovery. Attach those results to the
[device matrix](testing.md). Resolve same-device camera/Scratch blockers before
starting Phase 1 four-anchor detection and rectification to the candidate
840 × 592 landscape workspace.
