use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;
use std::{
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub kind: String,
    pub duration_us: i64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codec: Option<String>,
    pub size_bytes: u64,
    pub has_audio: bool,
}

#[tauri::command]
pub async fn probe_media(path: String, app: tauri::AppHandle) -> AppResult<ProbeResult> {
    let source = PathBuf::from(path);
    app.asset_protocol_scope()
        .allow_file(&source)
        .map_err(|error| AppError::Media(format!("Could not authorize media preview: {error}")))?;
    let ffprobe = media_binary(&app, "ffprobe");
    tauri::async_runtime::spawn_blocking(move || probe(&source, &ffprobe))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

pub fn probe(path: &Path, ffprobe: &Path) -> AppResult<ProbeResult> {
    if !path.is_file() {
        return Err(AppError::InvalidInput(
            "The selected media file does not exist".into(),
        ));
    }
    let output = hidden_command(ffprobe)
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    if !output.status.success() {
        return Err(AppError::Media(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    let value: Value = serde_json::from_slice(&output.stdout)?;
    let streams = value["streams"]
        .as_array()
        .ok_or_else(|| AppError::Media("FFprobe returned no streams".into()))?;
    let video = streams
        .iter()
        .find(|stream| stream["codec_type"] == "video");
    let has_audio = streams.iter().any(|stream| stream["codec_type"] == "audio");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_image = matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tiff"
    );
    let kind = if is_image {
        "image"
    } else if video.is_some() {
        "video"
    } else if has_audio {
        "audio"
    } else {
        return Err(AppError::Media(
            "No supported media stream was found".into(),
        ));
    };
    let duration = value["format"]["duration"]
        .as_str()
        .and_then(|raw| raw.parse::<f64>().ok())
        .unwrap_or(if is_image { 5.0 } else { 0.0 });
    let stream = video.or_else(|| streams.first());
    Ok(ProbeResult {
        kind: kind.into(),
        duration_us: (duration * 1_000_000.0).round() as i64,
        width: stream.and_then(|v| v["width"].as_u64()).map(|v| v as u32),
        height: stream.and_then(|v| v["height"].as_u64()).map(|v| v as u32),
        codec: stream
            .and_then(|v| v["codec_name"].as_str())
            .map(str::to_owned),
        size_bytes: fs::metadata(path)?.len(),
        has_audio,
    })
}

pub fn media_binary(app: &tauri::AppHandle, program: &str) -> PathBuf {
    let executable = format!("{program}{}", std::env::consts::EXE_SUFFIX);
    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("ffmpeg").join(&executable);
        if bundled.is_file() {
            return bundled;
        }
    }
    let development = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("vendor")
        .join("ffmpeg")
        .join("bin")
        .join(&executable);
    if development.is_file() {
        return development;
    }
    PathBuf::from(executable)
}

pub fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}
fn persist_voice_recording(data: &[u8], extension: &str, directory: &Path) -> AppResult<PathBuf> {
    if data.is_empty() || data.len() > 512 * 1024 * 1024 {
        return Err(AppError::InvalidInput(
            "Voice recording data is empty or too large".into(),
        ));
    }
    let extension = extension.trim_start_matches('.').to_ascii_lowercase();
    if !matches!(extension.as_str(), "webm" | "ogg" | "wav" | "m4a") {
        return Err(AppError::InvalidInput(
            "Unsupported voice recording format".into(),
        ));
    }
    fs::create_dir_all(directory)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?
        .as_millis();
    let path = directory.join(format!("voice-over-{stamp}.{extension}"));
    fs::write(&path, data)?;
    Ok(path)
}

#[tauri::command]
pub fn save_voice_recording(
    data: Vec<u8>,
    extension: String,
    app: tauri::AppHandle,
) -> AppResult<String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Io(std::io::Error::other(error)))?
        .join("recordings");
    let path = persist_voice_recording(&data, &extension, &directory)?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| {
            AppError::Media(format!("Could not authorize recording preview: {error}"))
        })?;
    Ok(path.to_string_lossy().into_owned())
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysis {
    pub peaks: Vec<f32>,
    pub beats_us: Vec<i64>,
    pub bpm: Option<f32>,
}

#[tauri::command]
pub async fn analyze_audio(
    path: String,
    buckets: usize,
    app: tauri::AppHandle,
) -> AppResult<AudioAnalysis> {
    let source = PathBuf::from(path);
    let ffmpeg = media_binary(&app, "ffmpeg");
    tauri::async_runtime::spawn_blocking(move || analyze_audio_file(&source, &ffmpeg, buckets))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

pub fn analyze_audio_file(path: &Path, ffmpeg: &Path, buckets: usize) -> AppResult<AudioAnalysis> {
    if !path.is_file() {
        return Err(AppError::InvalidInput(
            "The selected media file does not exist".into(),
        ));
    }
    let output = hidden_command(ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(path)
        .args([
            "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "pipe:1",
        ])
        .output()
        .map_err(|_| AppError::MissingFfmpeg)?;
    if !output.status.success() {
        return Err(AppError::Media(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    let samples: Vec<f32> = output
        .stdout
        .chunks_exact(2)
        .map(|bytes| i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / i16::MAX as f32)
        .collect();
    if samples.is_empty() {
        return Err(AppError::Media(
            "The media file has no decodable audio samples".into(),
        ));
    }
    let count = buckets.clamp(32, 512);
    let chunk = samples.len().div_ceil(count);
    let peaks = (0..count)
        .map(|index| {
            samples
                .iter()
                .skip(index * chunk)
                .take(chunk)
                .fold(0.0f32, |peak, value| peak.max(value.abs()))
        })
        .collect();
    let energy: Vec<f32> = samples
        .chunks(40)
        .map(|values| values.iter().map(|value| value.abs()).sum::<f32>() / values.len() as f32)
        .collect();
    let mut beats = Vec::new();
    let mut last = -500_000i64;
    for index in 1..energy.len().saturating_sub(1) {
        let from = index.saturating_sub(25);
        let to = (index + 26).min(energy.len());
        let mean = energy[from..to].iter().sum::<f32>() / (to - from).max(1) as f32;
        let time = index as i64 * 20_000;
        if energy[index] > 0.035
            && energy[index] > mean * 1.65
            && energy[index] >= energy[index - 1]
            && energy[index] >= energy[index + 1]
            && time - last >= 220_000
        {
            beats.push(time);
            last = time;
        }
    }
    let mut intervals: Vec<i64> = beats
        .windows(2)
        .map(|pair| pair[1] - pair[0])
        .filter(|value| *value >= 250_000 && *value <= 1_500_000)
        .collect();
    intervals.sort();
    let bpm = intervals
        .get(intervals.len() / 2)
        .map(|value| 60_000_000.0f32 / *value as f32);
    Ok(AudioAnalysis {
        peaks,
        beats_us: beats,
        bpm,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;

    fn vendor_binary(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("vendor")
            .join("ffmpeg")
            .join("bin")
            .join(format!("{name}{}", std::env::consts::EXE_SUFFIX))
    }

    #[test]
    fn persists_bounded_voice_recordings() {
        let directory =
            std::env::temp_dir().join(format!("openframe-recording-{}", uuid::Uuid::new_v4()));
        let path = persist_voice_recording(b"voice-data", "webm", &directory).unwrap();
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("webm")
        );
        assert_eq!(fs::read(&path).unwrap(), b"voice-data");
        assert!(persist_voice_recording(b"voice-data", "exe", &directory).is_err());
        assert!(persist_voice_recording(&[], "webm", &directory).is_err());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn probes_generated_video_metadata() {
        let directory =
            std::env::temp_dir().join(format!("openframe-probe-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("probe.mp4");
        let status = hidden_command(vendor_binary("ffmpeg"))
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=0xB9F75A:s=320x180:r=30:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
            ])
            .arg(&source)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());

        let result = probe(&source, &vendor_binary("ffprobe")).unwrap();
        assert_eq!(result.kind, "video");
        assert_eq!(result.width, Some(320));
        assert_eq!(result.height, Some(180));
        assert_eq!(result.codec.as_deref(), Some("h264"));
        assert!(result.has_audio);
        assert!((900_000..=1_100_000).contains(&result.duration_us));
        assert!(result.size_bytes > 0);

        let analysis = analyze_audio_file(&source, &vendor_binary("ffmpeg"), 64).unwrap();
        assert_eq!(analysis.peaks.len(), 64);
        assert!(analysis.peaks.iter().copied().fold(0.0f32, f32::max) > 0.1);
        fs::remove_dir_all(directory).unwrap();
    }
}
