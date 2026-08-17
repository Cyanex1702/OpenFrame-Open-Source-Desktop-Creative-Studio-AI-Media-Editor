use crate::{
    error::{AppError, AppResult},
    media::media_binary,
    plugins::installed_plugin_count,
};
use serde::Serialize;
use serde_json::json;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsStatus {
    app_version: String,
    build_profile: String,
    target: String,
    operating_system: String,
    architecture: String,
    log_path: String,
    ffmpeg_available: bool,
    ffprobe_available: bool,
    installed_plugins: usize,
    installed_model_files: usize,
    update_channel_configured: bool,
    update_message: String,
}

pub fn initialize(app: &tauri::AppHandle) -> AppResult<()> {
    append_log(
        app,
        "info",
        "app.start",
        &format!("OpenFrame {} started", env!("CARGO_PKG_VERSION")),
    )
}

#[tauri::command]
pub fn diagnostics_status(app: tauri::AppHandle) -> AppResult<DiagnosticsStatus> {
    let log = log_path(&app)?;
    let model_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Media(error.to_string()))?
        .join("models");
    Ok(DiagnosticsStatus {
        app_version: env!("CARGO_PKG_VERSION").into(),
        build_profile: if cfg!(debug_assertions) { "debug" } else { "release" }.into(),
        target: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        operating_system: std::env::consts::OS.into(),
        architecture: std::env::consts::ARCH.into(),
        log_path: log.to_string_lossy().into_owned(),
        ffmpeg_available: media_binary(&app, "ffmpeg").is_file(),
        ffprobe_available: media_binary(&app, "ffprobe").is_file(),
        installed_plugins: installed_plugin_count(&app)?,
        installed_model_files: count_files(&model_directory),
        update_channel_configured: option_env!("OPENFRAME_UPDATE_MANIFEST_URL").is_some(),
        update_message: option_env!("OPENFRAME_UPDATE_MANIFEST_URL")
            .map(|_| "A signed update feed is configured for this build.")
            .unwrap_or("This development release has no signed update channel configured. OpenFrame will never download an update silently.")
            .into(),
    })
}

#[tauri::command]
pub fn write_app_log(
    level: String,
    event: String,
    message: String,
    app: tauri::AppHandle,
) -> AppResult<()> {
    if !matches!(level.as_str(), "info" | "warning" | "error")
        || event.len() > 80
        || !event
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '.' | '-' | '_'))
        || message.len() > 500
        || message.contains(['\r', '\n'])
    {
        return Err(AppError::InvalidInput("Log entry is invalid".into()));
    }
    append_log(&app, &level, &event, &message)
}

#[tauri::command]
pub fn export_diagnostics(path: String, app: tauri::AppHandle) -> AppResult<String> {
    let target = PathBuf::from(&path);
    if target.extension().and_then(|value| value.to_str()) != Some("json") {
        return Err(AppError::InvalidInput(
            "Diagnostics exports must use .json".into(),
        ));
    }
    let status = diagnostics_status(app.clone())?;
    let log_tail = read_log_tail(&log_path(&app)?, 100)?;
    let value = json!({
        "schemaVersion": 1,
        "generatedAtUnixMs": now_ms(),
        "diagnostics": status,
        "recentEvents": log_tail,
        "privacy": "Project names, media paths, captions, and creative content are intentionally excluded."
    });
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&target, serde_json::to_vec_pretty(&value)?)?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_logs_folder(app: tauri::AppHandle) -> AppResult<()> {
    let path = log_path(&app)?;
    let directory = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("Log folder is unavailable".into()))?;
    fs::create_dir_all(directory)?;
    std::process::Command::new("explorer.exe")
        .arg(directory)
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn check_for_updates(app: tauri::AppHandle) -> AppResult<DiagnosticsStatus> {
    let status = diagnostics_status(app.clone())?;
    append_log(&app, "info", "updates.check", &status.update_message)?;
    Ok(status)
}

fn append_log(app: &tauri::AppHandle, level: &str, event: &str, message: &str) -> AppResult<()> {
    let path = log_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    rotate_if_needed(&path)?;
    let record = json!({
        "timestampUnixMs": now_ms(),
        "level": level,
        "event": event,
        "message": message,
    });
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(file, "{}", serde_json::to_string(&record)?)?;
    Ok(())
}

fn log_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_log_dir()
        .map_err(|error| AppError::Media(error.to_string()))?
        .join("openframe.jsonl"))
}
fn rotate_if_needed(path: &Path) -> AppResult<()> {
    if path.is_file() && fs::metadata(path)?.len() > 2 * 1024 * 1024 {
        let backup = path.with_extension("jsonl.1");
        if backup.is_file() {
            fs::remove_file(&backup)?;
        }
        fs::rename(path, backup)?;
    }
    Ok(())
}
fn read_log_tail(path: &Path, limit: usize) -> AppResult<Vec<serde_json::Value>> {
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path)?;
    Ok(text
        .lines()
        .rev()
        .take(limit)
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect())
}
fn count_files(path: &Path) -> usize {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| {
            if entry.path().is_dir() {
                count_files(&entry.path())
            } else {
                1
            }
        })
        .sum()
}
fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_tail_is_bounded_and_structured() {
        let directory =
            std::env::temp_dir().join(format!("openframe-log-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("events.jsonl");
        fs::write(
            &path,
            "{\"event\":\"one\"}\nnot-json\n{\"event\":\"two\"}\n",
        )
        .unwrap();
        let values = read_log_tail(&path, 2).unwrap();
        assert_eq!(values.len(), 1);
        assert_eq!(values[0]["event"], "two");
        fs::remove_dir_all(directory).unwrap();
    }
}
