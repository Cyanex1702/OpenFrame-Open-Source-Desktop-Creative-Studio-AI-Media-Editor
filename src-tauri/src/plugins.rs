use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::Manager;

pub const PLUGIN_RUNTIME: &str = "declarative-v1";
const MAX_PACKAGE_BYTES: u64 = 5 * 1024 * 1024;
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub minimum_open_frame_version: String,
    pub runtime: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub license: String,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectContribution {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub default_amount: f32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionContribution {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub default_duration_ms: u32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeContribution {
    pub id: String,
    pub name: String,
    pub tokens: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiModelContribution {
    pub id: String,
    pub name: String,
    pub purpose: String,
    pub version: String,
    pub size_bytes: u64,
    pub license: String,
    pub source_url: String,
    pub sha256: String,
    pub runtime: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExporterContribution {
    pub id: String,
    pub name: String,
    pub description: String,
    pub container: String,
    pub video_codec: String,
    pub crf: u8,
    pub audio_bitrate_kbps: u16,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginContributions {
    #[serde(default)]
    pub effects: Vec<EffectContribution>,
    #[serde(default)]
    pub transitions: Vec<TransitionContribution>,
    #[serde(default)]
    pub templates: Vec<serde_json::Value>,
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
    #[serde(default)]
    pub ai_models: Vec<AiModelContribution>,
    #[serde(default)]
    pub exporters: Vec<ExporterContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginPackage {
    pub manifest: PluginManifest,
    #[serde(default)]
    pub contributions: PluginContributions,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub package: PluginPackage,
    pub enabled: bool,
    pub package_sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatus {
    pub runtime: String,
    pub sdk_version: u32,
    pub directory: String,
    pub plugins: Vec<InstalledPlugin>,
    pub security_summary: String,
}

#[tauri::command]
pub fn plugin_status(app: tauri::AppHandle) -> AppResult<PluginStatus> {
    let directory = plugin_directory(&app)?;
    fs::create_dir_all(&directory)?;
    Ok(PluginStatus {
        runtime: PLUGIN_RUNTIME.into(),
        sdk_version: 1,
        directory: directory.to_string_lossy().into_owned(),
        plugins: read_plugins(&directory)?,
        security_summary: "Declarative packages only. Executable entrypoints, scripts, dynamic libraries, shell commands, and raw FFmpeg fragments are rejected.".into(),
    })
}

#[tauri::command]
pub fn install_plugin(path: String, app: tauri::AppHandle) -> AppResult<InstalledPlugin> {
    let source = PathBuf::from(path);
    if !source.is_file() {
        return Err(AppError::InvalidInput(
            "The plugin package does not exist".into(),
        ));
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "of-plugin" | "json") {
        return Err(AppError::InvalidInput(
            "Choose an .of-plugin package".into(),
        ));
    }
    if fs::metadata(&source)?.len() > MAX_PACKAGE_BYTES {
        return Err(AppError::InvalidInput(
            "The plugin package is larger than 5 MB".into(),
        ));
    }
    let bytes = fs::read(&source)?;
    let package: PluginPackage = serde_json::from_slice(&bytes)?;
    validate_package(&package)?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let directory = plugin_directory(&app)?;
    fs::create_dir_all(&directory)?;
    let target = directory.join(format!("{}.of-plugin", package.manifest.id));
    let temporary = target.with_extension("tmp");
    fs::write(&temporary, &bytes)?;
    let backup = target.with_extension("of-plugin.bak");
    if target.is_file() {
        if backup.is_file() {
            fs::remove_file(&backup)?;
        }
        fs::rename(&target, &backup)?;
    }
    if let Err(error) = fs::rename(&temporary, &target) {
        if backup.is_file() {
            let _ = fs::rename(&backup, &target);
        }
        return Err(AppError::Io(error));
    }
    if backup.is_file() {
        fs::remove_file(backup)?;
    }
    let disabled = disabled_path(&directory, &package.manifest.id);
    if disabled.is_file() {
        fs::remove_file(disabled)?;
    }
    Ok(InstalledPlugin {
        package,
        enabled: true,
        package_sha256: hash,
    })
}

#[tauri::command]
pub fn remove_plugin(plugin_id: String, app: tauri::AppHandle) -> AppResult<()> {
    validate_id(&plugin_id)?;
    let directory = plugin_directory(&app)?;
    let target = directory.join(format!("{plugin_id}.of-plugin"));
    if target.is_file() {
        fs::remove_file(target)?;
    }
    let disabled = disabled_path(&directory, &plugin_id);
    if disabled.is_file() {
        fs::remove_file(disabled)?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_plugin_enabled(
    plugin_id: String,
    enabled: bool,
    app: tauri::AppHandle,
) -> AppResult<()> {
    validate_id(&plugin_id)?;
    let directory = plugin_directory(&app)?;
    let package = directory.join(format!("{plugin_id}.of-plugin"));
    if !package.is_file() {
        return Err(AppError::InvalidInput("The plugin is not installed".into()));
    }
    let marker = disabled_path(&directory, &plugin_id);
    if enabled {
        if marker.is_file() {
            fs::remove_file(marker)?;
        }
    } else {
        fs::write(marker, b"disabled")?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_plugins_folder(app: tauri::AppHandle) -> AppResult<()> {
    let directory = plugin_directory(&app)?;
    fs::create_dir_all(&directory)?;
    std::process::Command::new("explorer.exe")
        .arg(&directory)
        .spawn()
        .map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn open_plugin_source(plugin_id: String, app: tauri::AppHandle) -> AppResult<()> {
    let package = installed_package(&app, &plugin_id)?;
    let url = package.manifest.source_url.ok_or_else(|| {
        AppError::InvalidInput("This plugin does not publish a source URL".into())
    })?;
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub async fn download_plugin_model(
    plugin_id: String,
    model_id: String,
    app: tauri::AppHandle,
) -> AppResult<String> {
    let plugin = enabled_plugin(&app, &plugin_id)?;
    if !plugin
        .manifest
        .permissions
        .iter()
        .any(|value| value == "models.download")
    {
        return Err(AppError::InvalidInput(
            "The plugin was not granted models.download permission".into(),
        ));
    }
    let model = plugin
        .contributions
        .ai_models
        .into_iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| AppError::InvalidInput("Unknown model extension".into()))?;
    tauri::async_runtime::spawn_blocking(move || download_model_file(&app, &plugin_id, &model))
        .await
        .map_err(|error| AppError::Media(error.to_string()))?
}

pub fn resolve_exporter(
    app: &tauri::AppHandle,
    plugin_id: &str,
    exporter_id: &str,
) -> AppResult<ExporterContribution> {
    enabled_plugin(app, plugin_id)?
        .contributions
        .exporters
        .into_iter()
        .find(|exporter| exporter.id == exporter_id)
        .ok_or_else(|| AppError::InvalidInput("Unknown exporter extension".into()))
}

pub fn installed_plugin_count(app: &tauri::AppHandle) -> AppResult<usize> {
    Ok(read_plugins(&plugin_directory(app)?)?.len())
}

fn enabled_plugin(app: &tauri::AppHandle, plugin_id: &str) -> AppResult<PluginPackage> {
    validate_id(plugin_id)?;
    let directory = plugin_directory(app)?;
    if disabled_path(&directory, plugin_id).is_file() {
        return Err(AppError::InvalidInput("The plugin is disabled".into()));
    }
    installed_package(app, plugin_id)
}

fn installed_package(app: &tauri::AppHandle, plugin_id: &str) -> AppResult<PluginPackage> {
    validate_id(plugin_id)?;
    let bytes = fs::read(plugin_directory(app)?.join(format!("{plugin_id}.of-plugin")))?;
    let package: PluginPackage = serde_json::from_slice(&bytes)?;
    validate_package(&package)?;
    Ok(package)
}

fn read_plugins(directory: &Path) -> AppResult<Vec<InstalledPlugin>> {
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut plugins = Vec::new();
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("of-plugin") {
            continue;
        }
        let bytes = fs::read(&path)?;
        let Ok(package) = serde_json::from_slice::<PluginPackage>(&bytes) else {
            continue;
        };
        if validate_package(&package).is_err() {
            continue;
        }
        let enabled = !disabled_path(directory, &package.manifest.id).is_file();
        plugins.push(InstalledPlugin {
            package,
            enabled,
            package_sha256: format!("{:x}", Sha256::digest(&bytes)),
        });
    }
    plugins.sort_by(|a, b| a.package.manifest.name.cmp(&b.package.manifest.name));
    Ok(plugins)
}

fn validate_package(package: &PluginPackage) -> AppResult<()> {
    let manifest = &package.manifest;
    if manifest.schema_version != 1 || manifest.runtime != PLUGIN_RUNTIME {
        return invalid("Only schema 1 declarative-v1 plugins are supported");
    }
    validate_id(&manifest.id)?;
    if !valid_version(&manifest.version)
        || !valid_version(&manifest.minimum_open_frame_version)
        || version_tuple(&manifest.minimum_open_frame_version) > version_tuple(CURRENT_VERSION)
    {
        return invalid("Plugin version or minimum OpenFrame version is invalid");
    }
    if manifest.name.trim().is_empty()
        || manifest.name.len() > 80
        || manifest.author.trim().is_empty()
        || manifest.license.trim().is_empty()
        || manifest.description.len() > 500
    {
        return invalid("Plugin identity metadata is incomplete or too long");
    }
    if manifest
        .source_url
        .as_ref()
        .is_some_and(|url| !valid_https(url))
    {
        return invalid("Plugin source URLs must use HTTPS");
    }
    let allowed_permissions = ["project.read", "media.read", "models.download"];
    if manifest
        .permissions
        .iter()
        .any(|value| !allowed_permissions.contains(&value.as_str()))
    {
        return invalid("Plugin requests an unsupported permission");
    }
    if !package.contributions.ai_models.is_empty()
        && !manifest
            .permissions
            .iter()
            .any(|value| value == "models.download")
    {
        return invalid("AI model extensions require models.download permission");
    }
    let mut ids = HashSet::new();
    for effect in &package.contributions.effects {
        contribution_id(&mut ids, &effect.id)?;
        if !matches!(
            effect.kind.as_str(),
            "blur" | "sharpen" | "grayscale" | "vignette"
        ) || !effect.default_amount.is_finite()
            || !(0.0..=1.0).contains(&effect.default_amount)
        {
            return invalid("Effect contributions must map to an allow-listed operation");
        }
    }
    for transition in &package.contributions.transitions {
        contribution_id(&mut ids, &transition.id)?;
        if !matches!(
            transition.kind.as_str(),
            "fade" | "wipe-left" | "slide-left"
        ) || !(0..=10_000).contains(&transition.default_duration_ms)
        {
            return invalid("Transition contribution is invalid");
        }
    }
    for theme in &package.contributions.themes {
        contribution_id(&mut ids, &theme.id)?;
        let allowed = [
            "background",
            "panel",
            "surface",
            "border",
            "text",
            "muted",
            "accent",
            "accentSecondary",
        ];
        if theme.tokens.is_empty()
            || theme
                .tokens
                .iter()
                .any(|(key, value)| !allowed.contains(&key.as_str()) || !valid_color(value))
        {
            return invalid("Theme tokens must use allow-listed names and six-digit colors");
        }
    }
    for model in &package.contributions.ai_models {
        contribution_id(&mut ids, &model.id)?;
        if !valid_https(&model.source_url)
            || model.sha256.len() != 64
            || !model.sha256.chars().all(|value| value.is_ascii_hexdigit())
            || model.size_bytes == 0
            || model.size_bytes > 20 * 1024 * 1024 * 1024
            || model.license.trim().is_empty()
            || !matches!(model.runtime.as_str(), "whisper.cpp" | "onnx")
        {
            return invalid("AI model contribution metadata is invalid");
        }
    }
    for exporter in &package.contributions.exporters {
        contribution_id(&mut ids, &exporter.id)?;
        if exporter.container != "mp4"
            || exporter.video_codec != "h264"
            || exporter.crf > 51
            || !(64..=512).contains(&exporter.audio_bitrate_kbps)
        {
            return invalid("Exporter contributions must use bounded MP4/H.264 settings");
        }
    }
    for template in &package.contributions.templates {
        let valid = template
            .get("id")
            .and_then(serde_json::Value::as_str)
            .is_some()
            && template
                .get("name")
                .and_then(serde_json::Value::as_str)
                .is_some()
            && template
                .get("page")
                .and_then(serde_json::Value::as_object)
                .is_some();
        if !valid {
            return invalid("Template contribution is missing id, name, or page");
        }
    }
    Ok(())
}

fn download_model_file(
    app: &tauri::AppHandle,
    plugin_id: &str,
    model: &AiModelContribution,
) -> AppResult<String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Media(error.to_string()))?
        .join("models")
        .join("extensions")
        .join(plugin_id);
    fs::create_dir_all(&directory)?;
    let extension = Path::new(&model.source_url)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| matches!(*value, "bin" | "gguf" | "onnx"))
        .unwrap_or("bin");
    let target = directory.join(format!("{}.{}", model.id, extension));
    let temporary = target.with_extension("download");
    let mut response = reqwest::blocking::Client::builder()
        .user_agent(format!("OpenFrame/{CURRENT_VERSION}"))
        .build()
        .map_err(|error| AppError::Media(error.to_string()))?
        .get(&model.source_url)
        .send()
        .map_err(|error| AppError::Media(format!("Model download failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::Media(format!(
            "Model download returned HTTP {}",
            response.status()
        )));
    }
    let mut file = fs::File::create(&temporary)?;
    let mut hasher = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 128 * 1024];
    loop {
        let count = response
            .read(&mut buffer)
            .map_err(|error| AppError::Media(error.to_string()))?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > model.size_bytes.saturating_add(1024 * 1024) {
            let _ = fs::remove_file(&temporary);
            return Err(AppError::Media(
                "Model download exceeded its declared size".into(),
            ));
        }
        hasher.update(&buffer[..count]);
        file.write_all(&buffer[..count])?;
    }
    file.sync_all()?;
    let hash = format!("{:x}", hasher.finalize());
    if !hash.eq_ignore_ascii_case(&model.sha256) {
        let _ = fs::remove_file(&temporary);
        return Err(AppError::Media(
            "Downloaded extension model checksum mismatch".into(),
        ));
    }
    if target.is_file() {
        fs::remove_file(&target)?;
    }
    fs::rename(&temporary, &target)?;
    Ok(target.to_string_lossy().into_owned())
}

fn plugin_directory(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Media(error.to_string()))?
        .join("plugins"))
}
fn disabled_path(directory: &Path, id: &str) -> PathBuf {
    directory.join(format!("{id}.disabled"))
}
fn contribution_id(ids: &mut HashSet<String>, id: &str) -> AppResult<()> {
    validate_id(id)?;
    if !ids.insert(id.into()) {
        return invalid("Contribution IDs must be unique within a plugin");
    }
    Ok(())
}
fn validate_id(value: &str) -> AppResult<()> {
    if value.len() < 3
        || value.len() > 80
        || !value.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || matches!(character, '.' | '-' | '_')
        })
    {
        return invalid("Plugin and contribution IDs must be lowercase ASCII identifiers");
    }
    Ok(())
}
fn valid_version(value: &str) -> bool {
    value.split('.').count() == 3 && value.split('.').all(|part| part.parse::<u32>().is_ok())
}
fn version_tuple(value: &str) -> (u32, u32, u32) {
    let mut parts = value.split('.').map(|part| part.parse().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}
fn valid_https(value: &str) -> bool {
    value.starts_with("https://") && !value.contains(char::is_whitespace)
}
fn valid_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}
fn invalid<T>(message: &str) -> AppResult<T> {
    Err(AppError::InvalidInput(message.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_package() -> PluginPackage {
        serde_json::from_value(serde_json::json!({
            "manifest": {
                "schemaVersion": 1,
                "id": "org.openframe.test",
                "name": "Test plugin",
                "version": "1.0.0",
                "author": "OpenFrame",
                "description": "Safe declarative test",
                "minimumOpenFrameVersion": "0.6.0",
                "runtime": "declarative-v1",
                "permissions": [],
                "capabilities": ["effects"],
                "license": "MIT",
                "sourceUrl": "https://example.com/plugin"
            },
            "contributions": {
                "effects": [{"id":"soft-focus","name":"Soft focus","kind":"blur","defaultAmount":0.3,"description":"Blur preset"}],
                "transitions": [{"id":"gentle-fade","name":"Gentle fade","kind":"fade","defaultDurationMs":500,"description":"Fade preset"}],
                "themes": [{"id":"night","name":"Night","tokens":{"background":"#090b0e","accent":"#b9f75a"}}],
                "exporters": [{"id":"web-mp4","name":"Web MP4","description":"Compact","container":"mp4","videoCodec":"h264","crf":23,"audioBitrateKbps":160}]
            }
        })).unwrap()
    }

    #[test]
    fn accepts_safe_declarative_package() {
        assert!(validate_package(&valid_package()).is_ok());
    }

    #[test]
    fn validates_the_published_starter_package() {
        let package: PluginPackage =
            serde_json::from_str(include_str!("../../examples/community-starter.of-plugin"))
                .unwrap();
        assert!(validate_package(&package).is_ok());
    }

    #[test]
    fn rejects_unknown_fields_and_unsafe_effects() {
        let mut package = valid_package();
        package.contributions.effects[0].kind = "raw-ffmpeg".into();
        assert!(validate_package(&package).is_err());
        let unsafe_json = serde_json::json!({
            "manifest": {
                "schemaVersion":1,"id":"org.test.bad","name":"Bad","version":"1.0.0","author":"X",
                "description":"","minimumOpenFrameVersion":"0.6.0","runtime":"declarative-v1",
                "permissions":[],"capabilities":[],"license":"MIT","entrypoint":"evil.exe"
            },"contributions":{}
        });
        assert!(serde_json::from_value::<PluginPackage>(unsafe_json).is_err());
    }
}
