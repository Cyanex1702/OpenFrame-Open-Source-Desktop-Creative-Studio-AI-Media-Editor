# Milestones 5 and 6 - Design Studio

OpenFrame 0.6.0 delivers both milestones in one release.

## Milestone 5: Image and design editor

- Separate Video and Design workspaces in the same .ofp project.
- Multi-page SVG canvas with selection, direct movement, ordered layers, locking, visibility, naming, duplication, deletion, and forward/backward ordering.
- Image, text, rectangle, ellipse, star, arrow, freehand path, and image-frame objects.
- Numeric position, size, rotation, opacity, stroke, solid/gradient fill, blend modes, crop, and frame-shape controls.
- Brightness, contrast, exposure, saturation, vibrance, temperature, tint, highlight/shadow/white/black, sharpen, blur, grayscale, sepia, vignette, pixelate, and glow document properties.
- Real PNG/JPEG/WebP raster export from the current page.
- Real local sampled-color background removal through bundled FFmpeg, preserving the original.
- Design images can be placed onto the video timeline; image assets selected in Video can open directly in Design.

## Milestone 6: Canva-like creation system

- Built-in YouTube and social templates.
- Canvas presets for thumbnail, square social, story, poster, and presentation designs.
- Pages/scenes with add, duplicate, rename, select, delete, and filmstrip organization.
- Reusable text styles and user-created template export/import.
- Image frames, reusable graphic objects, asset favorites, and per-project template libraries.
- Versioned community-pack JSON with author, version, license, source URL, and typed template/graphic/text-style items. Packs remain local and inspectable.

## Models and dependencies

The requested installation flow is included now because local captions already depend on it:

- FFmpeg and FFprobe are shown as bundled dependencies.
- The catalog previews purpose, expected size, language, quality, version, license, official source, and SHA-1.
- Clicking Download & verify fetches the selected official whisper.cpp model, streams it to a temporary local file, verifies the published SHA-1, and only then installs it.
- A mismatch or partial download is removed.
- whisper.cpp runtime installation is guided through its official releases page and a local executable picker because OpenFrame does not silently redistribute or execute an unreviewed archive.
- Nothing downloads without an explicit user click, and media never uploads.
