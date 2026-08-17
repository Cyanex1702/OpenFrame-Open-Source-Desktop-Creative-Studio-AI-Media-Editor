# Windows release

OpenFrame 0.12.0 targets 64-bit Windows 10 and 11. The NSIS installer is per-user and includes OpenFrame, FFmpeg, FFprobe, third-party notices, checksums, and the FFmpeg license text.

## Verify and build

    powershell -ExecutionPolicy Bypass -File scripts/verify-release.ps1
    powershell -ExecutionPolicy Bypass -File scripts/verify-release.ps1 -BuildInstaller

The default installer path is:

    src-tauri/target/release/bundle/nsis/OpenFrame_0.12.0_x64-setup.exe

When CARGO_TARGET_DIR is configured, use its corresponding release/bundle/nsis/ directory.

## Release acceptance checks

- Frontend unit/interaction tests and the TypeScript/Vite production build pass.
- Rust formatting and Clippy pass with warnings denied.
- Rust tests generate/probe real media, create a proxy without changing its source, analyze motion, remove an image background, validate model and plugin catalogs, validate structured logs, and export a playable advanced H.264/AAC composition.
- The installer includes openframe.exe, ffmpeg/ffmpeg.exe, ffmpeg/ffprobe.exe, licenses, and checksums.
- Metadata reports OpenFrame 0.12.0 and a 64-bit NSIS target.

The development installer is unsigned. Public releases should be code-signed.
NSIS uses ZLIB compression to keep packaging memory bounded on Windows build machines; application contents and runtime behavior are unchanged.

For constrained system drives, set TEMP and TMP to a build-drive directory for the bundle command. The NSIS setup EXE contains the complete application payload.
