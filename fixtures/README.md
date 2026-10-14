# Deterministic fixture corpus

Each case uses `metadata.json`, representative images in `frames/` (or a short local video),
`expected-scenes.json`, and `notes.md`. Record device/browser, lighting, camera settings,
pack version, and mirror configuration. Geometry assertions use explicit tolerances;
semantic IDs and event order compare exactly.

Vision Demo records scene changes only after **Record scene**, exports a session JSON,
and replays it without camera access. **Save camera still** explicitly downloads a PNG
and metadata JSON. Put a saved PNG in the case's `frames/` directory. No fixture images
are uploaded or saved automatically. Inspect captures before committing them.

The initial `synthetic-cat` fixture validates the provider/scene boundary, not image
recognition. Tests also generate and replay a deterministic ten-second scene timeline.
Calibration/recognition fixture gates remain pending until Phase 1/2.
