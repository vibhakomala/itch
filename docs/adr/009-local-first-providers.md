# ADR-009: Local processing and providers

**Status:** Accepted from roadmap B2, ARC-001–003 and NFR-001–003.

**Context:** Camera ownership and recognition must evolve independently of Scratch, replay and possible future remote providers.

**Decision:** A `TangiblesProvider` publishes canonical scenes/events. Implement synthetic and local vision providers behind that interface. Local mode processes frames on-device; recording exports files through an explicit local action. No cloud vision, image upload or identity processing belongs in this baseline.

**Consequences:** Scratch consumes semantic data rather than camera internals. Deterministic fixtures can replace live capture. Offline asset delivery and remote transport still need their own future acceptance evidence.

**Alternatives considered:** Embedding recognition in a Scratch extension would couple consumers and camera lifecycle. Cloud inference would conflict with the local reference path.
