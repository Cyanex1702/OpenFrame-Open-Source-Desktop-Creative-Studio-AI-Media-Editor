# OpenFrame project format

OpenFrame projects use .ofp and contain human-readable UTF-8 JSON. Source media is referenced by path; saving never duplicates or modifies original media.

## Schema version 1

The root stores identity/timestamps, optional projectPath, the active workspace, assets, favoriteAssetIds, sequence, an optional design document, and additive settings.

Assets include media metadata plus optional proxyPath, proxyEnabled, and proxyStatus. A timeline item stores an optional compoundSequenceId for nested edits plus:

- sequence/source timing, fades, volume, linkedItemIds, and transform/color properties;
- keyframes, masks, blend mode, effects, and transitions; community effect/transition presets retain optional plugin attribution while remaining mapped to built-in operations;
- playback rate, reverse/freeze, and speedPoints with local microsecond time, rate, and easing;
- chromaKey and autoBackground settings;
- advancedColor, optional lutPath, and lutIntensity;
- stabilization settings;
- a motion-tracking region, cached normalized points, confidence, and analysis state.

Tracks persist gain, pan, mute, and solo mixer state. Each sequence stores tracks, draggable timeline markers, editable captions, dimensions, and a timebase. The root persists sequences, activeSequenceId, and sequence as the active compatibility view. Compound sequences retain a parentSequenceId and are referenced by compound timeline items. Each cue has integer-microsecond bounds, text, optional word timings, and style properties including font, colors, stroke, background, alignment, and vertical position.

Project settings persist preview quality, selected hardware encoder, and an optional local transcription-model path.

The design document stores its active page, pages/scenes, reusable text styles, user templates, and versioned community packs. Pages store bounded canvas dimensions, background/gradient settings, and ordered objects. Objects store type, transform, visibility/lock state, fills, crop, text/image/path/frame data, adjustments, and filters.

## Timing and validation invariants

- Sequence/source/caption/marker/keyframe/speed/tracking times are integer microseconds.
- Linked item identifiers must refer to another timeline item in the same sequence.
- Sequence identifiers are unique, activeSequenceId matches the active sequence, and compound references cannot be missing or self-referential.
- Track gain and stereo pan are finite and range checked; marker times are non-negative.
- Item starts cannot be negative; item and caption durations must be positive.
- Playback and speed-point rates are finite and between 0.25 and 4.
- Keyframes and speed points must lie within their item duration.
- Tracking coordinates, key controls, LUT intensity, and normalized color/background controls are range checked.
- Modes, easing, blend modes, masks, effects, transitions, proxy states, preview quality, and hardware encoders are allow-listed.
- Caption colors use validated hex values and styles have bounded sizes/opacities.
- Workspaces are allow-listed; design pages, dimensions, object counts, types, and required numeric transforms are validated.

Rust validates these invariants at the native trust boundary.

## Save safety

Desktop saves write and sync a temporary sibling file, move an existing project to a short-lived backup, promote the temporary file, and restore the backup if promotion fails. Missing source or proxy files do not prevent opening.

## Compatibility policy

Breaking changes require an explicit schema migration. Additive schema-1 fields use neutral defaults. OpenFrame 0.12 opens earlier schema-1 projects with the Video workspace active, no favorites, a fresh additive design document, captions empty, proxies off, neutral advanced controls, full preview quality, and software H.264 export.