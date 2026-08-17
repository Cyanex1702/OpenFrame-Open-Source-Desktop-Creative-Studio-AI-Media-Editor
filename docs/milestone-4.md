# Milestone 4 - Advanced Video

OpenFrame 0.4.0 adds an offline-first advanced editing vertical slice.

## Delivered

- Chroma key and sampled-color automatic background removal.
- Manual captions, editable timing/style, SRT/VTT interchange, Program overlay, burned-in export, and optional whisper.cpp local transcription.
- Speed-ramp points and easing in project timing, preview, and export.
- Advanced color controls and 3D LUT import/application.
- Local stabilization and motion-analysis/tracking caches.
- 960px H.264 proxy creation and preview switching.
- FFmpeg capability/encoder detection and software fallback.
- Additive .ofp defaults and Rust trust-boundary validation for all new fields.

## Verification

The frontend suite covers caption interchange, ramp integration, and visible editor workflows. Rust tests use the bundled FFmpeg/FFprobe to:

- inspect advanced filter/hardware capability availability;
- create and probe a real proxy while confirming the source file is unchanged;
- generate cached motion points;
- render a playable multi-layer MP4 containing speed ramping, tracking, keying, automatic cutout, advanced color, LUT, stabilization, captions, and mixed audio.

Optional whisper.cpp executables and models are not redistributed by OpenFrame; users select their own compatible local files and remain responsible for their licenses.