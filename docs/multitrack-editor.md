# Functional multitrack editor

OpenFrame 0.12.0 replaces the original two-lane presentation with a working layered editing core.

## Default timeline

New projects contain five visible lanes:

1. Image overlays — dedicated still-image compositing.
2. Video overlay 1 — picture-in-picture, masks, opacity, transforms, and blend modes.
3. Main video — the primary sequential edit.
4. Audio 1 — dialogue, music, or effects.
5. Audio 2 — a second simultaneous audio source.

Use the V, I, and A buttons above the lane labels to create additional video, image, or audio tracks. Earlier visual tracks render above later visual tracks.

## Working operations

- Import multiple videos, images, and audio files.
- Drag project media onto any compatible lane and timeline position.
- Move a selected clip to another compatible lane with Inspector → Layer → Track.
- Rename, reorder, lock, hide, mute, and remove empty lanes.
- Overlap clips in time to composite visuals or mix audio.
- Transform, scale, rotate, change opacity/blend mode, and apply rectangle or ellipse masks per visual clip.
- Preview all active visual layers bottom-to-top.
- Preview all active audio-bearing video and audio clips together with clip volume, fades, track gain, mute, and solo.
- Link related video/audio clips so move, trim, split, duplicate, and delete operations preserve synchronization.
- Use ripple delete plus select, roll, slip, and slide edit tools.
- View source-derived waveforms, mix track gain/pan, and add or detect beat markers.
- Export the same visible visual lanes and unmuted audio sources through the native FFmpeg compositor.

## Compatibility and safety

Older schema-1 projects are normalized on open. Missing image, overlay-video, and second-audio lanes are added as empty lanes; existing assets and edit decisions are not moved.

The Rust project validator rejects incompatible lane contents. Audio lanes accept audio, image lanes accept images, and video lanes accept video or images. Locked lanes reject clip moves and drops.

## Current boundary

This release makes the concrete multitrack, overlay, mask, audio-mix, compound, multi-sequence, and voice-over workflow functional. It does not claim full CapCut or Canva parity. Arbitrary Bézier masks, adjustment layers, audio buses, automation curves, multichannel recording, and sequence-to-sequence transitions remain future work.