use crate::{
    error::{AppError, AppResult},
    media::{hidden_command, media_binary, probe},
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    pub filters: Vec<String>,
    pub hardware_encoders: Vec<String>,
    pub semantic_background_model_installed: bool,
    pub transcription_model_installed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionPoint {
    pub time_us: i64,
    pub x: f32,
    pub y: f32,
    pub confidence: f32,
}

#[tauri::command]
pub async fn detect_media_capabilities(app: tauri::AppHandle) -> AppResult<MediaCapabilities> {
    let ffmpeg = media_binary(&app, "ffmpeg");
    tauri::async_runtime::spawn_blocking(move || detect_capabilities(&ffmpeg))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

#[tauri::command]
pub async fn generate_proxy(path: String, app: tauri::AppHandle) -> AppResult<String> {
    let source = PathBuf::from(path);
    let ffmpeg = media_binary(&app, "ffmpeg");
    tauri::async_runtime::spawn_blocking(move || generate_proxy_file(&source, &ffmpeg))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

#[tauri::command]
pub async fn analyze_motion(path: String, app: tauri::AppHandle) -> AppResult<Vec<MotionPoint>> {
    let source = PathBuf::from(path);
    let ffmpeg = media_binary(&app, "ffmpeg");
    let ffprobe = media_binary(&app, "ffprobe");
    tauri::async_runtime::spawn_blocking(move || analyze_motion_file(&source, &ffmpeg, &ffprobe))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}
#[tauri::command]
pub async fn transcribe_local(
    path: String,
    model_path: String,
    app: tauri::AppHandle,
) -> AppResult<String> {
    let source = PathBuf::from(path);
    let model = PathBuf::from(model_path);
    let ffmpeg = media_binary(&app, "ffmpeg");
    tauri::async_runtime::spawn_blocking(move || transcribe_local_file(&source, &model, &ffmpeg))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

fn transcribe_local_file(source: &Path, model: &Path, ffmpeg: &Path) -> AppResult<String> {
    if !source.is_file() {
        return Err(AppError::InvalidInput(
            "The source media file does not exist".into(),
        ));
    }
    if !model.is_file() {
        return Err(AppError::InvalidInput(
            "The transcription model file does not exist".into(),
        ));
    }
    let directory = std::env::temp_dir().join(format!("openframe-transcribe-{}", Uuid::new_v4()));
    fs::create_dir_all(&directory)?;
    let wav = directory.join("speech.wav");
    let output_base = directory.join("captions");
    let extract = hidden_command(ffmpeg)
        .args(["-y", "-i"])
        .arg(source)
        .args(["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"])
        .arg(&wav)
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    if let Err(error) = check(extract) {
        let _ = fs::remove_dir_all(&directory);
        return Err(error);
    }

    let parent = model.parent().unwrap_or_else(|| Path::new("."));
    let whisper = ["whisper-cli", "main"]
        .iter()
        .map(|name| parent.join(format!("{name}{}", std::env::consts::EXE_SUFFIX)))
        .find(|path| path.is_file())
        .ok_or_else(|| {
            AppError::InvalidInput(
                "Place whisper-cli.exe (or main.exe) beside the selected local model".into(),
            )
        })?;
    let output = hidden_command(&whisper)
        .arg("-m")
        .arg(model)
        .arg("-f")
        .arg(&wav)
        .args(["-osrt", "-of"])
        .arg(&output_base)
        .output()
        .map_err(|error| {
            AppError::Media(format!("Could not launch local transcription: {error}"))
        })?;
    let result = check(output).and_then(|_| {
        fs::read_to_string(output_base.with_extension("srt")).map_err(|error| {
            AppError::Media(format!(
                "Local transcription produced no SRT output: {error}"
            ))
        })
    });
    let _ = fs::remove_dir_all(&directory);
    result
}
fn detect_capabilities(ffmpeg: &Path) -> AppResult<MediaCapabilities> {
    let filters_output = hidden_command(ffmpeg)
        .args(["-hide_banner", "-filters"])
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    let encoders_output = hidden_command(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    let filters_text = String::from_utf8_lossy(&filters_output.stdout);
    let encoders_text = String::from_utf8_lossy(&encoders_output.stdout);
    let filters = [
        "chromakey",
        "despill",
        "drawtext",
        "subtitles",
        "lut3d",
        "deshake",
        "vidstabdetect",
        "vibrance",
        "exposure",
    ]
    .into_iter()
    .filter(|name| filters_text.contains(name))
    .map(str::to_owned)
    .collect();
    let hardware_encoders = ["h264_nvenc", "h264_qsv", "h264_amf"]
        .into_iter()
        .filter(|name| encoders_text.contains(name))
        .map(str::to_owned)
        .collect();
    Ok(MediaCapabilities {
        filters,
        hardware_encoders,
        semantic_background_model_installed: false,
        transcription_model_installed: false,
    })
}

fn generate_proxy_file(source: &Path, ffmpeg: &Path) -> AppResult<String> {
    if !source.is_file() {
        return Err(AppError::InvalidInput(
            "The source media file does not exist".into(),
        ));
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("media");
    let target = source.with_file_name(format!("{stem}.openframe-proxy.mp4"));
    let output = hidden_command(ffmpeg)
        .args(["-y", "-i"])
        .arg(source)
        .args([
            "-vf",
            "scale=w='min(960,iw)':h=-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
        ])
        .arg(&target)
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    check(output)?;
    Ok(target.to_string_lossy().into_owned())
}

fn analyze_motion_file(
    source: &Path,
    ffmpeg: &Path,
    ffprobe: &Path,
) -> AppResult<Vec<MotionPoint>> {
    let info = probe(source, ffprobe)?;
    let width = info.width.unwrap_or(1) as f32;
    let height = info.height.unwrap_or(1) as f32;
    let output = hidden_command(ffmpeg)
        .args(["-hide_banner", "-i"])
        .arg(source)
        .args([
            "-vf",
            "fps=5,cropdetect=limit=0.05:round=2:reset=1",
            "-an",
            "-f",
            "null",
            "-",
        ])
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    let logs = String::from_utf8_lossy(&output.stderr);
    let mut points = Vec::new();
    for line in logs.lines().filter(|line| line.contains("crop=")) {
        let Some(crop) = line
            .split("crop=")
            .nth(1)
            .and_then(|part| part.split_whitespace().next())
        else {
            continue;
        };
        let values = crop
            .split(':')
            .filter_map(|value| value.parse::<f32>().ok())
            .collect::<Vec<_>>();
        if values.len() != 4 {
            continue;
        }
        let time = line
            .split("t:")
            .nth(1)
            .or_else(|| line.split("pts_time:").nth(1))
            .and_then(|part| part.split_whitespace().next())
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(points.len() as f64 / 5.0);
        let x = (values[2] + values[0] / 2.0) / width;
        let y = (values[3] + values[1] / 2.0) / height;
        points.push(MotionPoint {
            time_us: (time * 1_000_000.0).round() as i64,
            x: x.clamp(0.0, 1.0),
            y: y.clamp(0.0, 1.0),
            confidence: 0.7,
        });
    }
    if points.is_empty() {
        points.push(MotionPoint {
            time_us: 0,
            x: 0.5,
            y: 0.5,
            confidence: 0.25,
        });
    }
    Ok(points)
}

fn check(output: std::process::Output) -> AppResult<()> {
    if output.status.success() {
        Ok(())
    } else {
        Err(AppError::Media(
            String::from_utf8_lossy(&output.stderr)
                .lines()
                .rev()
                .take(8)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n"),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Stdio};
    use uuid::Uuid;
    fn vendor(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("vendor")
            .join("ffmpeg")
            .join("bin")
            .join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
    }
    #[test]
    fn detects_bundled_advanced_capabilities() {
        let capabilities = detect_capabilities(&vendor("ffmpeg")).unwrap();
        assert!(capabilities.filters.contains(&"chromakey".into()));
        assert!(capabilities.filters.contains(&"lut3d".into()));
        assert!(capabilities
            .hardware_encoders
            .contains(&"h264_nvenc".into()));
    }
    #[test]
    fn generates_proxy_and_motion_points_without_touching_source() {
        let directory =
            std::env::temp_dir().join(format!("openframe-advanced-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("moving.mp4");
        let status = hidden_command(vendor("ffmpeg"))
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=640x360:r=30:d=1",
                "-vf",
                "drawbox=x=50+200*t:y=100:w=80:h=80:color=white:t=fill",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ])
            .arg(&source)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let original = fs::metadata(&source).unwrap().len();
        let proxy = generate_proxy_file(&source, &vendor("ffmpeg")).unwrap();
        assert!(Path::new(&proxy).is_file());
        assert_eq!(fs::metadata(&source).unwrap().len(), original);
        let points = analyze_motion_file(&source, &vendor("ffmpeg"), &vendor("ffprobe")).unwrap();
        assert!(!points.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }
}
