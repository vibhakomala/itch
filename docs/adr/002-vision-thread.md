# ADR-002: Vision execution thread

**Status:** Provisional Phase 0 implementation; benchmark-driven decision remains open.

**Context:** The roadmap requires Scratch/UI responsiveness if vision slows and investigation of Worker/OffscreenCanvas support. No baseline iPad/Android measurements are available yet.

**Decision:** Run the lightweight Phase 0 placeholder pipeline sequentially on the main thread, at 15 Hz by default. Permit only one acquired/processed frame at a time, skip missed intervals instead of queuing frames, and fence late results after stop. Expose processing timings, FPS and dropped processing intervals. Keep pipeline stages injectable and probe Worker/OffscreenCanvas support.

**Consequences:** The scaffold works without a worker-specific capture format. CPU-heavy stages can still block the main thread; this baseline does not establish production responsiveness. Measure real frame transfer, calibration/recognition CPU time and Scratch animation behavior on both mobile classes before accepting the thread strategy.

**Alternatives considered:** Worker-only processing may reduce compatibility or transfer overhead; OffscreenCanvas availability varies. An unbounded main-thread backlog increases scene age. Worker/OffscreenCanvas remains a candidate rather than an adopted requirement.
