use crate::{
    error::{AppError, AppResult},
    media::{hidden_command, media_binary},
};
use std::{fs, path::PathBuf};

#[tauri::command]
pub async fn save_design_file(path: String, bytes: Vec<u8>) -> AppResult<String> {
    let target = PathBuf::from(&path);
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "of-template" | "json"
    ) {
        return Err(AppError::InvalidInput(
            "Design exports must be PNG, JPEG, WebP, or OpenFrame template JSON".into(),
        ));
    }
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 {
        return Err(AppError::InvalidInput(
            "The design export payload is empty or too large".into(),
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&target, bytes)?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_design_text(path: String) -> AppResult<String> {
    let target = PathBuf::from(path);
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "json" | "of-template" | "of-pack") {
        return Err(AppError::InvalidInput(
            "Choose an OpenFrame template or community-pack JSON file".into(),
        ));
    }
    let metadata = fs::metadata(&target)?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err(AppError::InvalidInput(
            "The design manifest is too large".into(),
        ));
    }
    Ok(fs::read_to_string(target)?)
}

#[tauri::command]
pub async fn remove_image_background(
    path: String,
    key_color: String,
    tolerance: f32,
    softness: f32,
    app: tauri::AppHandle,
) -> AppResult<String> {
    if !valid_color(&key_color)
        || !(0.0..=1.0).contains(&tolerance)
        || !(0.0..=1.0).contains(&softness)
    {
        return Err(AppError::InvalidInput(
            "Background-removal controls are invalid".into(),
        ));
    }
    let source = PathBuf::from(path);
    if !source.is_file() {
        return Err(AppError::InvalidInput(
            "The source image does not exist".into(),
        ));
    }
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let target = source.with_file_name(format!("{stem}.openframe-cutout.png"));
    let ffmpeg = media_binary(&app, "ffmpeg");
    let color = key_color[1..].to_owned();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let output = hidden_command(&ffmpeg)
            .args(["-y", "-i"])
            .arg(&source)
            .args([
                "-vf",
                &format!("format=rgba,colorkey=0x{color}:{tolerance:.4}:{softness:.4}"),
                "-frames:v",
                "1",
            ])
            .arg(&target)
            .output()
            .map_err(|_| AppError::MissingFfmpeg)?;
        Ok::<_, AppError>((output, target))
    })
    .await
    .map_err(|error| AppError::Media(error.to_string()))??;
    if !result.0.status.success() {
        return Err(AppError::Media(
            String::from_utf8_lossy(&result.0.stderr)
                .lines()
                .rev()
                .take(10)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n"),
        ));
    }
    Ok(result.1.to_string_lossy().into_owned())
}

fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{path::Path, process::Stdio};
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
    fn ffmpeg_keying_creates_transparent_png_without_touching_source() {
        let directory =
            std::env::temp_dir().join(format!("openframe-design-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("green.png");
        let output = directory.join("cutout.png");
        let status = hidden_command(vendor("ffmpeg"))
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=0x00ff00:s=128x128:d=1",
                "-vf",
                "drawbox=x=40:y=30:w=50:h=70:color=red:t=fill",
                "-frames:v",
                "1",
            ])
            .arg(&source)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let original = fs::metadata(&source).unwrap().len();
        let result = hidden_command(vendor("ffmpeg"))
            .args(["-y", "-i"])
            .arg(&source)
            .args([
                "-vf",
                "format=rgba,colorkey=0x00ff00:0.2:0.08",
                "-frames:v",
                "1",
            ])
            .arg(&output)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(result.success());
        assert!(output.is_file());
        assert_eq!(fs::metadata(&source).unwrap().len(), original);
        fs::remove_dir_all(directory).unwrap();
    }
}
