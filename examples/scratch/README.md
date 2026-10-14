# Scratch integration spike

`pnpm dev:player` opens the provider/adapter browser harness. It displays the same
version, readiness, word, count and events exposed by the extension contract.

`packages/scratch/test/real-vm.test.ts` registers ITCH in the pinned current Scratch
VM source and executes a scene-change stack that increments a native Scratch
variable. It runs without a renderer, camera, or mock VM and validates P0-002's
runtime plumbing. The shipped Node bundle has an asset-resolution issue, so the
test uses the package's shipped source.

Browser VM hosting, project extension persistence/distribution, and `.sb3`
loading are separate work. No playable Scratch project is included yet. See
`docs/architecture/scratch-source-inspection.md` and ADR-001 before extending the
private registration spike.
