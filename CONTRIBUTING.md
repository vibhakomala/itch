# Contributing to ITCH

Use [ITCH-ROADMAP-001 v0.1](<ITCH_Product_Technical_Roadmap_v0.1 (1).docx>) as the baseline. Current work is Phase 0; the [scope note](docs/architecture/scope.md) lists later features and unresolved gates.

Follow [development setup](docs/development.md), then run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm format:check` before proposing a change. Use `pnpm test:e2e` for changes to browser interactions. Document device tests separately from automated tests.

Keep camera acquisition and recognition inside `@itch/vision`. Keep the core independent of browser/camera and Scratch APIs. Scratch adapters consume providers and meaningful scene data. Core semantics may use pack metadata; recognition must not hardcode CAT/DOG or a six-letter alphabet. Fixtures should replay without a camera or network service.

Public contracts require validation and an explicit version change when compatibility changes. Add meaningful tests for scene/event behavior, pack parsing, geometry or provider lifecycle where those behaviors change. Capture frame metadata and an expected scene timeline with image fixtures. Keep participant images out of shared fixtures; use controlled workspaces without faces or identity data.

Use roadmap IDs (for example `P0-004` or `T-P0-03`) in issues, PR validation notes and relevant test names. Propose substantial cross-package decisions as ADRs; [ADR-001 through ADR-007](docs/adr/README.md) preserve the roadmap's assigned meanings. Update documentation when commands, file formats or test evidence change. Never label a roadmap phase complete based solely on code or mocks.

For a new tangible pack, start with `tangible-packs/starter/manifest.json` and validate it with `@itch/packs`. Give the pack a unique `packId`, stable semantic `pieceId` values and generic semantic metadata. Describe physical size, print scale and recognizer requirements alongside the manifest. A pack definition alone does not imply the installed recognizer supports it.
