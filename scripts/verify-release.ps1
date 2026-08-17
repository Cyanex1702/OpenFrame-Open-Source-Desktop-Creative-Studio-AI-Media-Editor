param(
  [switch]$BuildInstaller
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory)]
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

Push-Location $projectRoot
try {
  Invoke-Checked { npm.cmd test }
  Invoke-Checked { npm.cmd run build:web }
  Invoke-Checked { cargo fmt --manifest-path src-tauri/Cargo.toml --check }
  Invoke-Checked { cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings }
  Invoke-Checked { cargo test --manifest-path src-tauri/Cargo.toml }

  if ($BuildInstaller) {
    Invoke-Checked { npm.cmd run tauri:build }
  }
} finally {
  Pop-Location
}