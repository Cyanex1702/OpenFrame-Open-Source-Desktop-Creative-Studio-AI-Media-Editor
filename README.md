# OpenFrame

### Free, open-source creative software with private, local AI.

**OpenFrame** is a local-first Windows desktop video editor and visual-design studio built with **React, TypeScript, Rust, Tauri, FFmpeg, and whisper.cpp**.

It combines multitrack video editing, audio tools, visual design, local AI transcription, and native media processing in a single desktop application.

**No account. No subscription. No ads. No cloud upload required.**

Your media stays on your computer, and AI transcription can run locally using Whisper models.

---

## Why OpenFrame?

Most modern creative tools increasingly depend on cloud services, subscriptions, accounts, and remote AI APIs.

OpenFrame explores a different approach:

- 🧠 **Local AI** — speech-to-text transcription powered by `whisper.cpp`
- 🔒 **Privacy-first** — project media does not need to be uploaded to a server
- 📴 **Offline capable** — editing, FFmpeg processing, export, and installed AI models can work locally
- 💸 **Free to use** — no subscription or paid tier
- 🌍 **Open source** — source code is available under the MIT License
- 🖥️ **Native desktop application** — built with Tauri and Rust rather than running only in a browser
- 🎬 **Real media processing** — FFmpeg/FFprobe power native analysis, compositing, audio processing, and export
- 🎨 **Video + design workflows** — editing and visual-design tools live inside the same project format

---

# Local AI, Not Cloud AI

One of OpenFrame's core goals is to make useful AI features available **without requiring users to send their media to a remote API**.

## Local Whisper transcription

OpenFrame integrates with **whisper.cpp** for local speech-to-text transcription.

Users can install supported Whisper models and perform transcription directly on their own computer.

The workflow is designed around explicit, inspectable local dependencies:

1. The user chooses a supported Whisper model.
2. OpenFrame displays information about the model before installation.
3. The model is downloaded only after an explicit user action.
4. The downloaded model is written to a temporary local file.
5. OpenFrame verifies the model checksum.
6. Only a successfully verified model is installed.
7. Audio extraction and inference happen locally.

**Source media is not uploaded for transcription.**

OpenFrame currently supports a local model workflow around Whisper Tiny, Base, and multilingual model options.

> OpenFrame integrates and runs existing Whisper models locally; it does not claim to train or develop the Whisper model itself.

---

# Offline-First Architecture

OpenFrame is designed so its main creative workflow can remain on the user's machine.

### Local operations include

- Video and audio editing
- Media probing
- FFmpeg processing
- Video export
- Audio waveform generation
- Proxy generation
- Voice-over recording
- Motion/media analysis
- Local Whisper transcription
- Project saving
- Autosave and recovery
- Image/design editing

There is no requirement to create an OpenFrame account to edit a project.

Once any optional AI model/runtime dependencies have been installed, the core media and transcription workflows can operate locally.

---

# Features

## 🎬 Multitrack Video Editor

OpenFrame includes a layered editing timeline rather than a simple single-track editor.

### Timeline capabilities

- Multiple video tracks
- Image overlay tracks
- Multiple audio tracks
- Drag-and-drop media placement
- Clip trimming and splitting
- Linked video/audio clips
- Ripple delete
- Roll editing
- Slip editing
- Slide editing
- Track locking
- Track visibility
- Track mute and solo
- Reordering and renaming tracks
- Overlapping clips
- Picture-in-picture layouts
- Opacity and blend modes
- Rectangle and ellipse masks

Visual layers are composited in track order while multiple audio sources can be mixed together.

---

## 🔊 Audio Editing & Mixing

OpenFrame uses real decoded audio data rather than placeholder waveforms.

Features include:

- Source-derived audio waveforms
- Track gain
- Stereo pan
- Mute
- Solo
- Live peak meters
- Clip fades
- Multiple simultaneous audio sources
- Beat detection
- Timeline markers
- Marker snapping

Beat detection analyzes a local audio energy envelope to identify transients and estimate tempo.

---

## 🎙️ Local Voice-Over Recording

Voice-over recording is built directly into the editor.

OpenFrame can:

- Request microphone permission
- Record locally
- Display an active recording timer
- Apply browser/WebView audio processing where available
- Save the recording into local application data
- Import it as a real project asset
- Insert it onto a dedicated voice-over track at the playhead

**Recorded audio is not uploaded.**

---

## 🧩 Compound Clips

Multiple clips can be grouped into an editable nested sequence.

Compound clips:

- Preserve linked clip groups
- Maintain local timing
- Can be reopened and edited
- Preview as nested content
- Are recursively flattened for native export

This allows complex timeline sections to remain manageable without losing editability.

---

## 🎞️ Multiple Sequences

A single OpenFrame project can contain multiple independent sequences.

Sequences can be:

- Created
- Renamed
- Switched
- Duplicated
- Deleted

Each sequence maintains its own:

- Tracks
- Captions
- Markers
- Timing
- Dimensions
- Editing state

---

## 💾 Autosave & Crash Recovery

Unsaved edits can be stored as local recovery snapshots.

When OpenFrame discovers recoverable work, the user can explicitly choose to:

- **Restore** the project
- **Discard** the recovery snapshot

A successful manual save clears the corresponding recovery snapshot.

Malformed or unreadable recovery data is rejected rather than blindly loaded.

---

# 🎨 Visual Design Studio

OpenFrame is not limited to video editing.

Projects also include a visual-design workspace with a multi-page SVG-based canvas.

### Design tools include

- Text
- Images
- Rectangles
- Ellipses
- Stars
- Arrows
- Freehand paths
- Image frames
- Layer ordering
- Locking
- Visibility controls
- Duplication
- Rotation
- Opacity
- Stroke
- Solid and gradient fills
- Blend modes
- Cropping

Image controls include adjustments for:

- Brightness
- Contrast
- Exposure
- Saturation
- Vibrance
- Temperature
- Tint
- Highlights
- Shadows
- Sharpening
- Blur
- Grayscale
- Sepia
- Vignette
- Pixelation
- Glow

Designs can be exported locally as **PNG, JPEG, or WebP**.

Design assets can also be used inside the video-editing workflow.

---

# Templates & Reusable Designs

OpenFrame includes a local creation system with support for:

- Social-media presets
- YouTube-oriented designs
- Square posts
- Stories
- Posters
- Presentation layouts
- Multiple pages/scenes
- Reusable text styles
- User-created templates
- Reusable graphics
- Asset favorites
- Local project template libraries
- Versioned community-pack files

Community packs remain local and inspectable rather than depending on an opaque remote marketplace.

---

# Native Media Engine

OpenFrame uses **FFmpeg and FFprobe** through its Rust desktop backend for real media operations.

The native media layer handles functionality including:

- Media probing
- Timeline export
- Audio decoding
- Waveform analysis
- Proxy generation
- Audio extraction
- Motion analysis
- Local transcription preparation
- Layer compositing
- Audio mixing

The exporter builds a native FFmpeg filter graph for the project timeline.

It can apply operations including:

- Trimming
- Speed changes
- Reverse/freeze behavior
- Transform animation
- Color adjustments
- Effects
- LUTs
- Masks
- Opacity
- Tracking data
- Transitions
- Captions
- Audio fades
- Audio mixing

Unsupported hardware encoding can fall back to software H.264 encoding.

---

# Non-Destructive Editing

OpenFrame is designed around non-destructive media workflows.

**Original source files are not modified.**

Generated data such as proxies and temporary transcription audio use separate files and paths.

Projects store editing decisions rather than destructively rewriting the original media.

---

# Architecture

OpenFrame combines a web-style interface with a native desktop core.

```text
┌──────────────────────────────────────────────┐
│           React + TypeScript UI              │
│                                              │
│  Timeline • Design Studio • Model Center     │
│  Captions • Audio Mixer • Project State      │
└─────────────────────┬────────────────────────┘
                      │
                Typed Tauri Commands
                      │
┌─────────────────────▼────────────────────────┐
│              Rust / Tauri Core               │
│                                              │
│  Validation • Persistence • Native I/O       │
│  Media Processing • Local AI Workflows       │
└───────────────┬─────────────────┬────────────┘
                │                 │
        ┌───────▼──────┐   ┌──────▼──────────┐
        │ FFmpeg /     │   │   whisper.cpp   │
        │ FFprobe      │   │   Local AI      │
        └──────────────┘   └─────────────────┘
```

The separation keeps privileged filesystem and process operations in the native Rust layer while React/TypeScript handles the editing experience.

Long-running native processing is kept away from the main Tauri UI thread.

---

# Privacy & Security

OpenFrame is built around explicit local operations.

Some relevant design decisions include:

- Project media does not need to be uploaded to OpenFrame servers
- Whisper inference can execute locally
- Models are downloaded only after explicit user interaction
- Downloaded model files are checksum-verified
- Source media is not modified
- Rust validates project data at the native boundary
- Native child processes are invoked using argument arrays rather than shell command strings
- The initial plugin SDK is declarative rather than allowing arbitrary executable plugin code

OpenFrame is still under active development, and security-sensitive functionality should continue to be reviewed as the project evolves.

---

# Technology Stack

### Frontend

- **React 19**
- **TypeScript**
- **Vite**
- **Vitest**
- Testing Library

### Desktop / Native

- **Rust**
- **Tauri 2**
- **FFmpeg**
- **FFprobe**

### AI

- **whisper.cpp**
- Local Whisper speech-to-text models
- Local model management and checksum verification

---

# Running OpenFrame Locally

## Requirements

OpenFrame currently targets **Windows 10/11 x64**.

Development requires:

- Node.js 20+
- Rust stable
- `x86_64-pc-windows-msvc` Rust target
- Microsoft Visual Studio C++ Build Tools
- WebView2 Runtime
- Git LFS for repositories containing the bundled FFmpeg binaries

## Clone

```bash
git lfs install
Then Clone the repo 
```

Replace the repository URL above with the actual OpenFrame repository URL.

## Install frontend dependencies

```bash
npm install
```

## Start the desktop application

```bash
npm run tauri:dev
```

## Run the web UI only

```bash
npm run dev
```

Browser mode is useful for frontend development, but native filesystem, FFmpeg, and other desktop functionality require the Tauri application.

---

# Tests & Verification

Run the frontend test suite:

```bash
npm test
```

Build and type-check the frontend:

```bash
npm run build:web
```

Run the Rust tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Run Clippy with warnings treated as errors:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

---

# Building the Windows Application

```bash
npm run tauri:build
```

Tauri creates the Windows bundle from the production frontend and native Rust application.

FFmpeg and FFprobe are bundled as application resources for native media processing.

> Current development installers may be unsigned and can therefore trigger Windows reputation/security warnings.

---

# Project Structure

```text
openframe/
├── assets/                  # Project assets
├── docs/                    # Architecture and feature documentation
├── examples/                # Example/community resources
├── scripts/                 # Development/build utilities
├── src/                     # React + TypeScript frontend
├── src-tauri/               # Rust/Tauri desktop backend
│   ├── src/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── tauri.conf.json
├── tests/                   # Tests
├── vendor/
│   └── ffmpeg/              # Native FFmpeg/FFprobe runtime
├── package.json
├── package-lock.json
├── tsconfig.json
└── vite.config.ts
```

Generated dependencies, build output, installers, caches, and temporary test artifacts are intentionally excluded from source control.

---

# Current Status

**Version 0.12.0**

OpenFrame is an actively developed project.

Current functionality includes substantial working editing, design, native media-processing, local transcription, sequence, compound-clip, audio, voice-over, autosave, and recovery workflows.

It is **not intended to claim complete feature parity with established commercial editors**.

Areas that remain candidates for future development include:

- Background-job management with progress/cancellation
- More advanced caching
- GPU-backed preview compositing
- More advanced segmentation/background tools
- Expanded plugin sandboxing
- Production application signing/update infrastructure
- Additional professional editing workflows

---

# Philosophy

OpenFrame is built around a simple idea:

> **Creative software — including AI-powered creative software — should be able to run on your computer, respect your files, and remain accessible without forcing you into a subscription or cloud workflow.**

OpenFrame aims to make powerful media and AI workflows:

**local, transparent, inspectable, free, and open.**

---

# Open Source & Free

OpenFrame's source code is released under the **MIT License**.

That means the source can be used, studied, modified, and redistributed according to the terms of the license.

There is:

- **No subscription**
- **No paid tier required**
- **No account requirement**
- **No advertising**
- **No proprietary project lock-in intended**

Third-party components such as FFmpeg, models, runtimes, codecs, templates, plugins, and community packs retain their respective licenses.

See:

- [`LICENSE`](LICENSE)
- [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)

---

# Contributing

Contributions, bug reports, ideas, documentation improvements, and experimentation are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Submit a pull request describing what changed and why.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for additional information.

---

# Built With

**React · TypeScript · Rust · Tauri · FFmpeg · whisper.cpp**

### Local AI. Local media. Open source.