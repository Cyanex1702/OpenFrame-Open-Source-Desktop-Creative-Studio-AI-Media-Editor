mod advanced;
mod design;
mod diagnostics;
mod error;
mod export;
mod media;
mod models;
mod plugins;
mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            diagnostics::initialize(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            advanced::detect_media_capabilities,
            advanced::generate_proxy,
            advanced::analyze_motion,
            advanced::transcribe_local,
            design::save_design_file,
            design::read_design_text,
            design::remove_image_background,
            diagnostics::diagnostics_status,
            diagnostics::write_app_log,
            diagnostics::export_diagnostics,
            diagnostics::open_logs_folder,
            diagnostics::check_for_updates,
            models::model_center_status,
            models::download_model,
            models::remove_model,
            models::install_whisper_runtime,
            models::open_external_url,
            plugins::plugin_status,
            plugins::install_plugin,
            plugins::remove_plugin,
            plugins::set_plugin_enabled,
            plugins::open_plugins_folder,
            plugins::open_plugin_source,
            plugins::download_plugin_model,
            project::save_project,
            project::autosave_project,
            project::list_recoveries,
            project::discard_recovery,
            project::load_project,
            media::probe_media,
            media::save_voice_recording,
            media::analyze_audio,
            export::export_project,
            export::export_project_with_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run OpenFrame");
}
