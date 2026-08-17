use crate::error::{AppError, AppResult};
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};
use tauri::Manager;

#[derive(Clone, Copy)]
struct CatalogModel {
    id: &'static str,
    name: &'static str,
    purpose: &'static str,
    version: &'static str,
    size_bytes: u64,
    license: &'static str,
    url: &'static str,
    file_name: &'static str,
    sha1: &'static str,
    language: &'static str,
    quality: &'static str,
}

const MODELS: &[CatalogModel] = &[
    CatalogModel {
        id: "whisper-tiny-en",
        name: "Whisper Tiny English",
        purpose: "Fast automatic captions on modest CPUs",
        version: "ggml current",
        size_bytes: 77_691_713,
        license: "MIT model card",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        file_name: "ggml-tiny.en.bin",
        sha1: "c78c86eb1a8faa21b369bcd33207cc90d64ae9df",
        language: "English",
        quality: "Fast",
    },
    CatalogModel {
        id: "whisper-base-en",
        name: "Whisper Base English",
        purpose: "More accurate English automatic captions",
        version: "ggml current",
        size_bytes: 147_964_211,
        license: "MIT model card",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        file_name: "ggml-base.en.bin",
        sha1: "137c40403d78fd54d454da0f9bd998f78703390c",
        language: "English",
        quality: "Balanced",
    },
    CatalogModel {
        id: "whisper-tiny",
        name: "Whisper Tiny Multilingual",
        purpose: "Fast captions and translation across languages",
        version: "ggml current",
        size_bytes: 77_691_713,
        license: "MIT model card",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        file_name: "ggml-tiny.bin",
        sha1: "bd577a113a864445d4c299885e0cb97d4ba92b5f",
        language: "Multilingual",
        quality: "Fast",
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    id: String,
    name: String,
    purpose: String,
    version: String,
    size_bytes: u64,
    license: String,
    source_url: String,
    sha1: String,
    language: String,
    quality: String,
    installed: bool,
    installed_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    ffmpeg_bundled: bool,
    whisper_runtime_installed: bool,
    whisper_runtime_path: Option<String>,
    whisper_release_page: String,
    models_page: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCenterStatus {
    models: Vec<ModelInfo>,
    dependencies: DependencyStatus,
}

#[tauri::command]
pub fn model_center_status(app: tauri::AppHandle) -> AppResult<ModelCenterStatus> {
    let directory = model_directory(&app)?;
    let models = MODELS
        .iter()
        .map(|model| {
            let path = directory.join(model.file_name);
            ModelInfo {
                id: model.id.into(),
                name: model.name.into(),
                purpose: model.purpose.into(),
                version: model.version.into(),
                size_bytes: model.size_bytes,
                license: model.license.into(),
                source_url: model.url.into(),
                sha1: model.sha1.into(),
                language: model.language.into(),
                quality: model.quality.into(),
                installed: path.is_file(),
                installed_path: path.is_file().then(|| path.to_string_lossy().into_owned()),
            }
        })
        .collect();
    let runtime = runtime_path(&app)?;
    Ok(ModelCenterStatus {
        models,
        dependencies: DependencyStatus {
            ffmpeg_bundled: true,
            whisper_runtime_installed: runtime.is_file(),
            whisper_runtime_path: runtime
                .is_file()
                .then(|| runtime.to_string_lossy().into_owned()),
            whisper_release_page: "https://github.com/ggml-org/whisper.cpp/releases".into(),
            models_page: "https://huggingface.co/ggerganov/whisper.cpp".into(),
        },
    })
}

#[tauri::command]
pub async fn download_model(model_id: String, app: tauri::AppHandle) -> AppResult<String> {
    let model = MODELS
        .iter()
        .find(|model| model.id == model_id)
        .copied()
        .ok_or_else(|| AppError::InvalidInput("Unknown model".into()))?;
    tauri::async_runtime::spawn_blocking(move || download_catalog_model(model, &app))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

#[tauri::command]
pub fn remove_model(model_id: String, app: tauri::AppHandle) -> AppResult<()> {
    let model = MODELS
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| AppError::InvalidInput("Unknown model".into()))?;
    let path = model_directory(&app)?.join(model.file_name);
    if path.is_file() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn install_whisper_runtime(path: String, app: tauri::AppHandle) -> AppResult<String> {
    let source = PathBuf::from(path);
    if !source.is_file()
        || source
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| !value.eq_ignore_ascii_case("exe"))
            .unwrap_or(true)
    {
        return Err(AppError::InvalidInput(
            "Choose whisper-cli.exe from an official whisper.cpp Windows release".into(),
        ));
    }
    let target = runtime_path(&app)?;
    fs::create_dir_all(target.parent().expect("runtime parent"))?;
    fs::copy(source, &target)?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_external_url(url: String) -> AppResult<()> {
    let allowed = [
        "https://github.com/ggml-org/whisper.cpp",
        "https://huggingface.co/ggerganov/whisper.cpp",
    ];
    if !allowed.iter().any(|prefix| url.starts_with(prefix)) {
        return Err(AppError::InvalidInput(
            "This external URL is not in OpenFrame's dependency allow-list".into(),
        ));
    }
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map_err(|error| AppError::Media(format!("Could not open the default browser: {error}")))?;
    Ok(())
}

fn download_catalog_model(model: CatalogModel, app: &tauri::AppHandle) -> AppResult<String> {
    let directory = model_directory(app)?;
    fs::create_dir_all(&directory)?;
    let target = directory.join(model.file_name);
    let temporary = target.with_extension("download");
    let mut response = reqwest::blocking::Client::builder()
        .user_agent("OpenFrame/0.6.0")
        .build()
        .map_err(|error| AppError::Media(error.to_string()))?
        .get(model.url)
        .send()
        .map_err(|error| AppError::Media(format!("Model download failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Media(format!(
            "Model download returned HTTP {}",
            response.status()
        )));
    }
    let mut file = fs::File::create(&temporary)?;
    let mut hasher = Sha1::new();
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let count = response
            .read(&mut buffer)
            .map_err(|error| AppError::Media(error.to_string()))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        file.write_all(&buffer[..count])?;
    }
    file.sync_all()?;
    let hash = format!("{:x}", hasher.finalize());
    if hash != model.sha1 {
        let _ = fs::remove_file(&temporary);
        return Err(AppError::Media(format!(
            "Downloaded model checksum mismatch. Expected {}, received {hash}",
            model.sha1
        )));
    }
    fs::rename(&temporary, &target)?;
    Ok(target.to_string_lossy().into_owned())
}

fn model_directory(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Media(error.to_string()))?
        .join("models")
        .join("whisper"))
}
fn runtime_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(model_directory(app)?.join(format!("whisper-cli{}", std::env::consts::EXE_SUFFIX)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_has_unique_ids_and_pinned_checksums() {
        for (index, model) in MODELS.iter().enumerate() {
            assert_eq!(model.sha1.len(), 40);
            assert!(model
                .url
                .starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"));
            assert!(!MODELS
                .iter()
                .skip(index + 1)
                .any(|other| other.id == model.id));
        }
    }
}
