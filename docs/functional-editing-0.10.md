# OpenFrame 0.10.0 - Functional Editing Pass

This release addresses the gap between visible controls and usable editing workflows.

## Direct manipulation

- Design objects use working corner resize handles and a rotation handle. Shift preserves aspect ratio while resizing and snaps rotation to 15-degree increments.
- Shift/Ctrl selects multiple design layers; dragging any selected layer moves the group.
- Program-preview visual layers use working mouse move, scale, and rotate controls.

## Timeline

- Shift/Ctrl multi-selection with group duplicate, delete, and horizontal movement.
- Drag selected clips vertically onto compatible tracks; grouped clips preserve relative time and lane offsets where compatible.
- Snapping considers the half-second grid, playhead, and every unselected clip edge.
- End trimming can extend source-backed clips to available media and still images to long user-controlled durations.
- Video clips can detach their audio into an audio lane in one action.

## Visual editing and output parity

- Image/design crop, flip, borders, corners, shadows, typography, adjustments, and filters are persisted in projects and included in raster design export.
- Timeline crop and horizontal/vertical flip appear in Program preview and are translated to FFmpeg crop/hflip/vflip filters for MP4 export.
- Legacy schema-1 projects receive full-frame crop and unflipped defaults when opened.

## Graphics and type

The Design workspace includes a searchable built-in library of Unicode emoji, reactions, arrows, symbols, callouts, and meme-style labels. These are local system-font objects, remain editable, and do not introduce third-party asset licensing.

The typography inspector supports system font families, common named weights, italic, case transforms, alignment, letter and line spacing, fill, outline, shadow, opacity, and reusable text styles.

## Verification

- TypeScript production build passes.
- 42 frontend tests pass.
- 11 native Rust tests pass, including actual FFmpeg compositing/export and crop/flip filter assertions.