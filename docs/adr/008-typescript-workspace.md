# ADR-008: TypeScript workspace

**Status:** Accepted for bootstrap.

**Context:** P0-003 requires public packages to compile independently of Scratch. The bootstrap needs reproducible installation and two small browser apps without framework coupling in core.

**Decision:** Use pnpm workspaces, strict TypeScript packages, ESM exports and Vite for the browser apps. Pin Node in `.node-version` and pnpm through the root `packageManager`. Use Vitest for deterministic tests and Playwright for browser smoke tests.

**Consequences:** Package dependency direction is checked by lint. App development builds libraries first. Core remains usable from other hosts; no UI framework is a core dependency.

**Alternatives considered:** npm workspaces and a larger framework both work; pnpm and minimal Vite apps provide the required baseline with few moving parts.
