# ITCH Starter Letters

`manifest.json` is the versioned semantic definition for `itch.starter.v0`: C, A, T, D, O and G. `@itch/packs` exports a validated copy, with a test checking that the package and physical manifests agree. Piece IDs such as `letter:C` are independent of the visual recognition method.

The SVGs in `pieces` show human-visible letters on **40 × 40 mm** tile faces. `starter-sheet.svg` lays out all six on A4 landscape. Print at actual size / 100%; confirm the ruler measures 100 mm before cutting or mounting on flat matte cardboard. The outlined letter paths avoid font-dependent glyph substitutions.

These are **draft fabrication assets**. The small numbered labels reserve `starter-001` through `starter-006` as deterministic design identifiers in `print-spec.json`; they are not a selected machine-readable marker family. No recognizer decodes these labels or the letter artwork in the current baseline. ADR-004 remains open pending glyph-vs-marker fixture comparison; no print reliability, supported lighting or identity accuracy is claimed.

The physical workspace is A5 landscape, 210 × 148 mm. The starter sheet is a fabrication page, not the calibration mat. Use `hardware/workspace/a5-draft.svg` for dimensional experiments; its corner marks are also placeholders until ADR-003 is resolved.
