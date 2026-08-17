# Third-party licensing

OpenFrame application source is MIT licensed. Each dependency retains its own license.

Current major dependencies include:

- Tauri and its Rust/JavaScript ecosystem.
- React and TypeScript.
- Lucide icons.
- FFmpeg/FFprobe 8.1.2 Essentials Build, bundled as separate GPLv3 executables on Windows.

The exact FFmpeg distribution is recorded in `THIRD_PARTY_LICENSES.md` and `vendor/ffmpeg/README.txt`. The verified archive SHA-256 is `e25b682664025d49034c981afb4bae36238a40f29a3cc1c713ad9a8b5b3528f6`; per-file checksums are stored in `vendor/ffmpeg/SHA256SUMS.txt`.

The bundled programs report GPLv3 and include GPL components such as libx264. They are invoked as separate processes and are not linked into OpenFrame. Their GPL text, build configuration, upstream source commit, and checksums ship with the installer. FFmpeg licensing, OpenFrame's MIT license, and codec patent considerations are related but not interchangeable.
OpenFrame does not bundle AI models, the whisper.cpp runtime, fonts, or stock assets. Built-in design templates are application-authored. Any future redistributed asset must include provenance, version, license, source URL, checksum, and redistribution review.

OpenFrame 0.10.0 can download a user-selected model file from the official ggerganov/whisper.cpp Hugging Face repository, verify its published SHA-1, and use it through a user-installed whisper.cpp executable as a separate local process. The catalog shows model license/source metadata before installation. Neither model weights nor the runtime are redistributed in the OpenFrame installer; their upstream terms remain applicable.


## Community plugins

OpenFrame does not redistribute installed community packages or extension models. The plugin manager displays each package author, license, source URL, requested permissions, capabilities, and package SHA-256. Model extensions additionally require their own license, HTTPS source, declared size, and SHA-256. Contributors remain responsible for having rights to share their packages and assets.
