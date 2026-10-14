# Tests and acceptance evidence

Use the IDs and acceptance criteria from ITCH-ROADMAP-001 v0.1. Automated contract evidence and physical acceptance evidence are recorded separately; the presence of a test harness does not close a device gate.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check`. For app interactions run `pnpm exec playwright install chromium` once, then `pnpm test:e2e`. Run `pnpm benchmark` for a repeatable synthetic timing baseline.

| Roadmap test                        | Baseline evidence                                                                              | Remaining acceptance work                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T-P0-01 camera smoke                | Camera lifecycle/frame-source unit coverage and an explicit browser preview UI                 | Run ≥10 FPS preview for two minutes on iPad/iPhone-class and Android devices; record failures and recovery. |
| T-P0-02 Scratch hello extension     | Real Node VM reporter registration and event-stack execution; mock word-event contract tests   | Validate browser packaging, .sb3 lifecycle and same-device camera/Scratch operation.                        |
| T-P0-03 record/replay               | Ten-second synthetic scene recorder/replayer test and representative still PNG/metadata export | Implement continuous frame-sequence recording, then capture/replay camera-derived evidence.                 |
| T-P0-04 capability matrix           | Browser capability JSON export                                                                 | Produce reports on both baseline mobile device classes and review same-device camera/Scratch blockers.      |
| P0-003 independent core compilation | Strict package builds and architecture-boundary lint                                           | Continue checking that core never imports Scratch or camera/browser APIs.                                   |

Core tests cover unchanged scenes, scene differences, semantic events, synthetic movement, row ordering, malformed input and explicit absence/presence. Temporal-noise tracking/debounce tests belong to Phase 2, when those filters exist. Scratch tests include mocks and a real Node VM source integration test; they contain no recognition logic. The real test checks registered version/ready primitives and an event-driven Scratch variable increment, without a renderer or .sb3 load. Vision tests inject frame sources/stages, so they run without permission dialogs or cameras. Browser smoke tests should use synthetic inputs and verify visible updates and diagnostics.

Fixture exports belong in `fixtures/recorded-video`, `fixtures/images` and `fixtures/expected-scenes` as appropriate. Store capture timestamps, source resolution, orientation, mirror state, device/browser metadata and expected scene outputs alongside frames. Include the command and version used to generate expected output. A human-reviewed image dataset and expected timeline are needed before calibration/recognition accuracy can be reported.

Manual baseline checklist:

1. Open the trusted HTTPS demo. Export the capability report before and after camera acquisition.
2. Grant camera access; record the returned mode/resolution/FPS and whether front/rear selection behaves as expected.
3. Keep preview active for two minutes and record FPS stability and any fatal errors (T-P0-01).
4. Rotate portrait/landscape and record viewport/video behavior. Deny permission, retry, stop, then restart; verify camera tracks turn off on stop.
5. Export a representative still PNG with metadata and record/replay a ten-second scene timeline. A continuous camera/frame-sequence recorder remains planned; after implementing it, capture and replay that sequence twice to complete camera-derived T-P0-03 evidence.
6. With a real Scratch runtime, register the hello extension and execute a scene-change hat while the camera preview runs. Record performance and any same-device blockers.
7. Inspect network activity: no camera frames or local fixture images should leave the device (NFR-002).

| Device class           | Model / OS / browser           | Capability JSON               | Camera smoke     | Real Scratch + camera | Status                        |
| ---------------------- | ------------------------------ | ----------------------------- | ---------------- | --------------------- | ----------------------------- |
| iPad / iPhone class    | Pending                        | Pending                       | Pending          | Pending               | Not validated                 |
| Android tablet / phone | Pending                        | Pending                       | Pending          | Pending               | Not validated                 |
| Desktop Chromium       | Record actual test environment | Optional development evidence | Development-only | Pending               | Does not satisfy mobile gates |

Do not report Phase 0 complete until the gate's real evidence is attached. Later calibration, ≥99% identity/≥98% scene accuracy, latency, mirror compensation and working-jig tests remain outside this bootstrap's achieved scope.
