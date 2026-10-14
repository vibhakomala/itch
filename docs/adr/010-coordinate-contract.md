# ADR-010: Normalized workspace coordinates

**Status:** Accepted from roadmap NFR-004 and scene contract §2.2.

**Context:** Device resolution, orientation and mirror optics should not leak into project-facing coordinates.

**Decision:** Objects publish normalized `x` and `y` within [0,1] on the rectified A5 landscape workspace, with origin at its upper-left. x increases rightward; y increases downward. `rotationDeg` describes clockwise rotation in workspace coordinates. Correct optical mirroring once in the future camera transform, before publishing poses.

**Consequences:** Pack dimensions remain millimeters and camera frames remain pixels; conversion belongs to calibration/vision. Synthetic scenes already use these units. Actual mirror correction and homography tests are still Phase 1 work. Scratch reporters return normalized values, not Scratch-stage pixel coordinates.

**Alternatives considered:** Raw camera pixels or stage coordinates vary by source/consumer and cannot serve as the canonical scene contract.
