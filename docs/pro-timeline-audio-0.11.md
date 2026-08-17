# OpenFrame 0.11.0 - Professional Timeline & Audio

This release makes synchronized picture/sound editing and multitrack audio practical.

## Linked video and audio clips

Detached audio is linked to its source video. Linked selection follows the complete link group, and move, trim, split, duplicate, normal delete, and ripple delete keep the group synchronized. The link toolbar button can link a multi-selection or unlink an existing group.

## Ripple and professional edit tools

- Ripple delete removes the selected linked group and closes its occupied range on unlocked tracks.
- Roll changes the shared cut between adjacent clips without changing their combined duration.
- Slip keeps a clip in place while moving its source in/out range.
- Slide moves a clip while compensating its immediate neighbors.
- Select remains the default move-and-trim tool.

All edit tools respect locked tracks and source bounds.

## Real waveform analysis and mixer

The desktop backend decodes the first audio stream to mono PCM with the bundled FFmpeg runtime and returns bounded peak buckets. Timeline waveforms use these source-derived peaks and map them to each clip's source range.

The mixer provides gain, stereo pan, solo, mute, and a live peak meter per video/audio track. Native export applies the same track state to video-contained audio and standalone audio before mixing.

## Markers and beat detection

Markers can be added at the playhead, dragged, removed with a double click, and used as snap targets. Beat detection builds a short-time energy envelope from decoded audio, finds energy transients with a minimum interval, estimates BPM from the median interval, and creates persistent beat markers.

## Compatibility

All additions remain in schema version 1 and use neutral serde/TypeScript defaults. Existing projects open with no links or markers, unity track gain, centered pan, and solo disabled.

## Verification

- 45 frontend unit and interaction tests pass.
- 11 native Rust tests pass.
- Native tests decode a real generated audio stream, verify waveform peaks, exercise mixer filter generation, and export a playable composition.
- The TypeScript/Vite production build and Windows NSIS packaging are release gates.