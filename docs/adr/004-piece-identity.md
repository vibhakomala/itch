# ADR-004: V0 piece identity encoding

**Status:** Open in Phase 2.

**Context:** The starter letters must eventually meet P2 identity/tracking accuracy. D/O and C/G provide useful confusable classes.

**Decision:** Keep semantic pack IDs independent of recognition. Reserve deterministic draft marker identifiers in the physical print specification without claiming an implemented encoding or recognizer. Human-facing letter artwork remains printable.

**Consequences:** A manifest and printed glyph are not proof of camera recognition. Compare glyph-only classification and visual machine IDs on controlled fixtures before selecting the encoding.

**Alternatives considered:** Glyph-only, border encodings and fiducial-style piece IDs. Reliability and child-friendly design will determine the decision.
