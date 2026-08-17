# Architecture

## Boundaries

    React editor UI
      - persisted project state and bounded undo history
      - timeline, keyframe, speed-ramp, and caption evaluators
      - layered Program monitor and advanced tool panels
              -> typed Tauri commands
    Rust desktop core
      - project validation and atomic persistence
      - FFprobe and FFmpeg media abstraction
      - proxy, motion-analysis, and local-transcription workflows
      - timeline compositor with software/hardware encoder fallback

Long-running export, proxy, tracking, and transcription commands execute with spawn_blocking; process I/O does not run on the Tauri UI thread.

## Time, animation, and identity

Entities use stable UUID-based IDs. Timeline positions, source ranges, fades, transitions, captions, speed points, tracking points, and keyframes use integer microseconds. The sequence owns an explicit rational frame rate.

The TypeScript evaluator interpolates animation and speed-ramp values at the playhead. Source-time evaluation integrates the ramp curve and applies reverse or an explicit freeze-frame source position. Split and trim preserve source ranges and rebase local animation data.

## State ownership

- OpenFrameProject contains persisted creative state, captions, proxy references, and performance settings.
- React component state owns playback, selection, active tools, filters, zoom, and transient UI status.
- The Program monitor evaluates every active visible layer bottom-to-top and renders the active caption above them.
- Browser blob URLs are preview-only and removed before browser-mode persistence.
- Source files are never modified; proxies and temporary transcription audio use separate paths.

## Native command surface

- save_project(path, project)
- load_project(path)
- probe_media(path)
- export_project(project, output_path)
- detect_media_capabilities()
- generate_proxy(path)
- analyze_motion(path)
- transcribe_local(path, model_path)

Rust validates project structure and file extensions. Child processes are invoked using argument vectors, never shell command strings.

## FFmpeg compositor

The 0.4 exporter builds one filter graph for the complete timeline:

1. Visible items become time-aligned RGBA streams.
2. Trim, reverse/freeze, speed curves, transform/color keyframes, effects, advanced color, LUT, stabilization, keying, masks, opacity, tracking, and transitions are applied per stream.
3. Streams are overlaid or blended in track order.
4. Caption cues become time-enabled drawtext stages.
5. Enabled audio is source-trimmed, retimed, faded, delayed, and mixed.
6. Output is normalized to sequence FPS, AAC stereo, fast-start MP4, and the requested H.264 encoder. Unsupported hardware execution falls back to libx264.

Real integration tests generate media with the bundled tools, exercise the complete advanced graph, probe the result, and verify source files remain unchanged during proxy work.

## Next architectural increments

1. Background job registry with progress and cancellation.
2. Thumbnail, waveform, segmentation-mask, and stabilization-analysis caches with explicit size bounds.
3. Dedicated playback/audio clock shared by preview and playhead.
4. GPU-backed preview compositor matching the native filter evaluator.
5. Explicit project-schema migration registry and autosave recovery index.