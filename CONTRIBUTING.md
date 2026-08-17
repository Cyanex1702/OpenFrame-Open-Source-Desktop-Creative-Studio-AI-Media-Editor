# Contributing to OpenFrame

OpenFrame is early-stage. Keep changes focused, compiling, tested, and honest about incomplete behavior.

## Workflow

1. Install the prerequisites in `docs/building.md`.
2. Create a focused branch.
3. Add or update tests for project and timeline behavior.
4. Run `npm test` and `npm run build:web`.
5. Run Rust formatting and tests when the Rust toolchain is installed.
6. Explain user-facing limitations and licensing implications in the pull request.

Avoid blocking the UI thread, raw shell strings, floating-point persisted timestamps, transient UI state in project files, or UI controls that imply unavailable functionality. New effects and transitions should enter through typed engine interfaces once those registries are introduced.

Report security issues privately rather than in a public issue. Include reproducible steps for regular bugs and only use media you are allowed to redistribute in tests.
