# Hardware assumptions — draft v0.1

These are Phase 0 dimensional references for low-cost prototypes. No physical assembly or camera recognition has been validated. The roadmap's target is a same-device front camera redirected toward an **A5 landscape workspace (210 × 148 mm)** through an adjustable mirror jig. Portrait examples in the bootstrap brief are superseded by the roadmap's landscape geometry.

`workspace/a5-draft.svg` is a true-size layout with labeled corner placeholders, a 50 mm scale check and physical axes. `workspace/spec.json` records millimeter dimensions. Print at 100% / actual size and measure the scale before using the layout for dimension experiments. The placeholder marks are not a chosen fiducial family and do not calibrate the current pipeline (ADR-003).

`jig/side-view.svg` is an illustrative dimensioned side view. `jig/spec.json` and `jig/README.md` give adjustable prototype assumptions, not universal device-fit instructions or fabrication-ready CAD. A simple flat mirror and cardboard or printed support remain the intended entry point; actual BOM prices, camera field of view and tolerances need measurement.

`../tangible-packs/starter` contains six 40 mm square letter print drafts. Use matte high-contrast printing on flat cardboard; keep glyph faces unobstructed during initial geometry experiments. No paper/cardboard durability, marker reliability, mirror compensation, lighting range or piece identity accuracy is claimed yet.

Record device/camera position, mirror type and angle, workspace offset, print scale, shadows/glare and supported lighting in each fixture. Phase 1 requires a functional jig, automatic four-anchor detection and measured rectification errors before recognizing pieces. The supported device list remains open until the mobile test matrix is populated.
