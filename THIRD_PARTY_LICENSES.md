# Third-party notices

OpenFrame application source is licensed under MIT. Third-party components retain their own licenses.

## FFmpeg 8.1.2 Essentials Build

OpenFrame's Windows package includes the separate `ffmpeg.exe` and `ffprobe.exe` programs from the Gyan.dev FFmpeg 8.1.2 Essentials Build.

- Version: `8.1.2-essentials_build-www.gyan.dev`
- Architecture: Windows x86-64, static
- License reported by the distributor: GPL version 3
- Upstream source commit: `38b88335f9`
- Source: https://github.com/FFmpeg/FFmpeg/commit/38b88335f9
- Binary archive: https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.7z
- Archive SHA-256: `e25b682664025d49034c981afb4bae36238a40f29a3cc1c713ad9a8b5b3528f6`

The complete GPLv3 text and build configuration are installed beside the binaries as `ffmpeg/LICENSE.txt` and `ffmpeg/README.txt`. Checksums for each bundled resource are recorded in `vendor/ffmpeg/SHA256SUMS.txt`.

The executables are invoked as separate processes; they are not linked into the MIT-licensed OpenFrame application. Codec patent considerations are separate from copyright licensing and remain the distributor's responsibility.

## JavaScript and Rust packages

Tauri, React, TypeScript, Lucide, Vite, Vitest, Serde, UUID, and their transitive dependencies retain the licenses declared by their respective packages. Release engineering should generate a complete dependency inventory before a public distribution.
