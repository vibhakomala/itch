# ADR-005: Canonical workspace resolution

**Status:** Open in Phase 1.

**Context:** NFR-004 uses normalized A5 workspace coordinates. The roadmap recommends an initial landscape rectified frame such as 840 × 592.

**Decision:** Preserve landscape 210 × 148 mm and normalized scene coordinates. Treat 840 × 592 as a benchmark candidate only; the Phase 0 pipeline has no actual rectification output.

**Consequences:** Camera resolution does not alter public pose units. Compare geometry errors and throughput on baseline devices before accepting a rectified pixel resolution.

**Alternatives considered:** Lower/higher resolutions with the same physical aspect ratio; changing physical orientation is not needed to tune processing cost.
