# Building OpenFrame on Windows

## Developer prerequisites

Install:

- Node.js 20 or newer.
- Rust stable through rustup, using the `x86_64-pc-windows-msvc` target.
- Microsoft Visual Studio Build Tools with Desktop development with C++.
- WebView2 Runtime (normally present on Windows 10/11).

Confirm the toolchain:

```powershell
node --version
npm.cmd --version
rustc --version
cargo --version
```

PowerShell execution policy can block `npm.ps1`; using `npm.cmd` avoids that wrapper issue.

## Development

```powershell
npm.cmd install
npm.cmd run tauri:dev
```

Run only the React layer with `npm.cmd run dev`. In browser mode, native dialogs and FFmpeg commands are replaced by browser-safe development behavior or a clear unavailable message.

## Tests and production UI

```powershell
npm.cmd test
npm.cmd run build:web
cargo test --manifest-path src-tauri/Cargo.toml
```

## NSIS installer

```powershell
npm.cmd run tauri:build
```

Tauri places bundle artifacts below `src-tauri/target/release/bundle/`. The configuration targets an NSIS per-user installer for Windows x64. FFmpeg and FFprobe are loaded from `vendor/ffmpeg/bin` in development and from the installed application resource directory in packaged builds.

Unsigned early builds may trigger Windows reputation warnings. Production signing should be added without blocking local development.

## Optional local captions

Open Models from either workspace. OpenFrame can download the displayed official whisper.cpp model files only after an explicit click and verifies each published SHA-1 before installation. For the runtime, use Official releases, download/extract a Windows whisper.cpp release, and choose whisper-cli.exe. Audio extraction and inference stay local. FFmpeg is bundled; no model or runtime is fetched silently.

## Plugin development

OpenFrame 0.9 uses the declarative Plugin SDK v1. Start with examples/community-starter.of-plugin and read docs/plugin-sdk.md. Packages never execute arbitrary code; the Rust validator is authoritative.
