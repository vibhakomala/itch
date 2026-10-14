# ADR-001: Scratch integration and distribution

**Status:** Provisional Phase 0 spike; final distribution path remains open.

**Context:** P0-002 and T-P0-02 require hello-extension plumbing before recognition. Current Scratch is maintained in `scratchfoundation/scratch-editor`. Source inspection found built-in service registration and a distinct URL/worker route; a local provider cannot be passed unchanged across the worker boundary.

**Decision:** Implement a small provider-consuming extension class with version/ready reporters and semantic reporters/events. Isolate `_registerInternalExtension` behind `registerScratchExtension`. Exercise the contract using mocks and a test-only `@scratch/scratch-vm` 15.2.0 dependency. Do not introduce a Scratch fork or a runtime VM dependency in the browser apps.

**Consequences:** Core and vision remain independent of Scratch. The private registration helper may change with upstream versions and does not handle saved-project extension discovery. T-P0-02's Node test verifies real reporter registration and event-stack execution; the package's shipped source is used because its default Node bundle fails resolving a stylesheet in this environment. Browser camera/Scratch operation, packaging and project persistence still require evidence before selecting production distribution. See the [source inspection and test limits](../architecture/scratch-source-inspection.md).

**Alternatives considered:** A full editor fork adds an unmeasured maintenance burden. A URL extension requires worker message transport. Direct VM private API registration is the smallest local spike but remains provisional.
