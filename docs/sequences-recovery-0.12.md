# OpenFrame 0.12.0 - Voice-over, Compounds, Sequences & Recovery

## Voice-over recording

The Program transport microphone button requests the operating system microphone permission and toggles recording. OpenFrame uses the WebView MediaRecorder implementation with Opus/WebM when available, echo cancellation, noise suppression, and automatic gain control. The recording is written to the local application-data recordings directory, probed as normal media, added to the project bin, and inserted at the original playhead on a Voice over track. Recording never uploads audio.

## Compound clips

Compound creates a nested sequence from the selected clips, preserves linked groups, shifts nested timing to local zero, and replaces the selection with one editable wrapper. Double-click the wrapper or choose Open compound to edit its contents. Preview and audio evaluation expand nested items. Export recursively flattens compounds into ordinary bounded sources before the native FFmpeg trust boundary, including compound trimming, speed, gain, opacity, mute, solo, visibility, and pan.

## Multiple sequences

The sequence strip supports create, switch, rename, duplicate, and delete. Normal sequences and compound sequences share the same validated Sequence model. The active sequence remains available through the legacy sequence property while sequences and activeSequenceId persist the complete collection, preserving schema-1 compatibility.

## Autosave and crash recovery

Unsaved commits are debounced for 1.5 seconds and written to one atomic recovery snapshot per project. Desktop snapshots live below the OpenFrame application-data recovery directory; browser preview uses localStorage. Home lists valid snapshots by newest edit and offers Restore or Discard. Saving the project successfully clears its snapshot, while cleanup failure cannot turn a completed project save into a reported failure.

Recovery loading skips unreadable or malformed files, validates valid projects at the native boundary, marks missing media, and authorizes existing media for local preview.

## Verification

- Frontend tests cover multiple-sequence lifecycle, legacy normalization, compound creation/preview/export flattening, recovery storage/list/discard, visible controls, and a simulated complete microphone session.
- Native tests cover bounded recording writes and format rejection in addition to real FFmpeg media analysis and export.
- TypeScript production build, Rust formatting, Clippy with warnings denied, all tests, and NSIS packaging are release gates.