import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { MediaAsset, OpenFrameProject } from "../types/project";
import { flattenCompoundProject, id, normalizeProject, SECOND } from "./project";

interface ProbeResult {
  kind: "video" | "audio" | "image";
  durationUs: number;
  width?: number;
  height?: number;
  codec?: string;
  sizeBytes?: number;
  hasAudio?: boolean;
}

export interface AudioAnalysis { peaks: number[]; beatsUs: number[]; bpm?: number; }

export function assetPreviewUrl(asset: MediaAsset): string {
  if (asset.proxyEnabled && asset.proxyPath && isTauri()) return convertFileSrc(asset.proxyPath);
  if (asset.previewUrl) return asset.previewUrl;
  return isTauri() && asset.path ? convertFileSrc(asset.path) : "";
}

export async function pickAndProbeMedia(): Promise<MediaAsset[]> {
  if (!isTauri()) throw new Error("Use the browser import control in preview mode.");
  const paths = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Media", extensions: ["mp4", "mov", "mkv", "webm", "mp3", "wav", "m4a", "aac", "flac", "png", "jpg", "jpeg", "webp", "gif"] }],
  });
  if (!paths) return [];
  const results = await Promise.allSettled(paths.map(async (path) => {
    const probe = await invoke<ProbeResult>("probe_media", { path });
    return { id: id("asset"), name: fileName(path), path, ...probe };
  }));
  const assets = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!assets.length && results.length) {
    const firstError = results.find((result) => result.status === "rejected");
    throw firstError && firstError.status === "rejected" ? firstError.reason : new Error("No supported media could be imported");
  }
  return assets;
}

export async function browserFilesToAssets(files: File[]): Promise<MediaAsset[]> {
  return Promise.all(files.map(async (file) => {
    const kind = inferKind(file.type, file.name);
    const previewUrl = URL.createObjectURL(file);
    const metadata = await browserMetadata(previewUrl, kind);
    return {
      id: id("asset"), name: file.name, path: file.name, kind,
      durationUs: metadata.durationUs, width: metadata.width, height: metadata.height,
      sizeBytes: file.size, previewUrl,
    };
  }));
}

export async function saveProject(project: OpenFrameProject, saveAs = false): Promise<OpenFrameProject | null> {
  project = normalizeProject(project);
  if (isTauri()) {
    let path = project.projectPath;
    if (!path || saveAs) {
      path = await save({ defaultPath: `${safeFileName(project.name)}.ofp`, filters: [{ name: "OpenFrame Project", extensions: ["ofp"] }] }) ?? undefined;
    }
    if (!path) return null;
    const persisted = { ...project, projectPath: path, modifiedAt: new Date().toISOString() };
    await invoke("save_project", { path, project: persisted });
    await discardRecovery(persisted.id).catch(() => undefined);
    rememberProject(persisted);
    return persisted;
  }
  const persisted = { ...project, modifiedAt: new Date().toISOString() };
  localStorage.setItem(`openframe.project.${project.id}`, JSON.stringify(withoutBlobUrls(persisted)));
  await discardRecovery(persisted.id).catch(() => undefined);
  rememberProject(persisted);
  return persisted;
}

export async function openProject(): Promise<OpenFrameProject | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: "OpenFrame Project", extensions: ["ofp"] }] });
    if (!path) return null;
    const project = normalizeProject(await invoke<OpenFrameProject>("load_project", { path }));
    rememberProject(project);
    return project;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".ofp,application/json";
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  if (!file) return null;
  return normalizeProject(JSON.parse(await file.text()) as OpenFrameProject);
}

export async function openRecent(projectId: string, path?: string): Promise<OpenFrameProject | null> {
  if (isTauri() && path) return normalizeProject(await invoke<OpenFrameProject>("load_project", { path }));
  const raw = localStorage.getItem(`openframe.project.${projectId}`);
  return raw ? normalizeProject(JSON.parse(raw) as OpenFrameProject) : null;
}

export async function exportProject(project: OpenFrameProject): Promise<string | null> {
  if (!isTauri()) throw new Error("MP4 export requires the desktop app and FFmpeg.");
  const path = await save({ defaultPath: `${safeFileName(project.name)}.mp4`, filters: [{ name: "MP4 Video", extensions: ["mp4"] }] });
  if (!path) return null;
  return invoke<string>("export_project", { project: flattenCompoundProject(project), outputPath: path });
}

export interface MediaCapabilities { filters: string[]; hardwareEncoders: string[]; semanticBackgroundModelInstalled: boolean; transcriptionModelInstalled: boolean; }
export interface MotionPoint { timeUs: number; x: number; y: number; confidence: number; }
export async function analyzeAudio(path: string, buckets = 128): Promise<AudioAnalysis> { if (!isTauri()) return { peaks: [], beatsUs: [] }; return invoke("analyze_audio", { path, buckets }); }

export async function saveVoiceRecording(blob: Blob): Promise<MediaAsset> {
  const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") || blob.type.includes("m4a") ? "m4a" : "webm";
  if (!isTauri()) {
    const [asset] = await browserFilesToAssets([new File([blob], `Voice over.${extension}`, { type: blob.type || `audio/${extension}` })]);
    return { ...asset, name: "Voice over", previewUrl: URL.createObjectURL(blob) };
  }
  const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
  const path = await invoke<string>("save_voice_recording", { data, extension });
  const probe = await invoke<ProbeResult>("probe_media", { path });
  return { id: id("asset"), name: `Voice over ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.${extension}`, path, ...probe };
}

export async function autosaveProject(project: OpenFrameProject): Promise<void> {
  const persisted = withoutBlobUrls(normalizeProject(project));
  if (isTauri()) { await invoke("autosave_project", { project: persisted }); return; }
  localStorage.setItem(`openframe.recovery.${project.id}`, JSON.stringify(persisted));
}

export async function recoverableProjects(): Promise<OpenFrameProject[]> {
  if (isTauri()) return (await invoke<OpenFrameProject[]>("list_recoveries")).map(normalizeProject);
  return Object.keys(localStorage).filter((key) => key.startsWith("openframe.recovery.")).flatMap((key) => {
    try { return [normalizeProject(JSON.parse(localStorage.getItem(key) ?? "") as OpenFrameProject)]; } catch { return []; }
  }).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export async function discardRecovery(projectId: string): Promise<void> {
  if (isTauri()) { await invoke("discard_recovery", { projectId }); return; }
  localStorage.removeItem(`openframe.recovery.${projectId}`);
}
export async function detectMediaCapabilities(): Promise<MediaCapabilities> { if (!isTauri()) return { filters: [], hardwareEncoders: [], semanticBackgroundModelInstalled: false, transcriptionModelInstalled: false }; return invoke("detect_media_capabilities"); }
export async function generateProxy(path: string): Promise<string> { if (!isTauri()) throw new Error("Proxy generation requires the desktop app."); return invoke("generate_proxy", { path }); }
export async function analyzeMotion(path: string): Promise<MotionPoint[]> { if (!isTauri()) throw new Error("Motion analysis requires the desktop app."); return invoke("analyze_motion", { path }); }
export async function pickLutFile(): Promise<string | undefined> { if (!isTauri()) return undefined; return await open({ multiple: false, directory: false, filters: [{ name: "3D LUT", extensions: ["cube", "3dl"] }] }) ?? undefined; }
export async function pickTranscriptionModel(): Promise<string | undefined> { if (!isTauri()) return undefined; return await open({ multiple: false, directory: false, filters: [{ name: "Whisper model", extensions: ["bin", "gguf"] }] }) ?? undefined; }
export async function transcribeLocal(path: string, modelPath: string): Promise<string> { if (!isTauri()) throw new Error("Local transcription requires the desktop app."); return invoke("transcribe_local", { path, modelPath }); }
export function recentProjects() {
  try { return JSON.parse(localStorage.getItem("openframe.recents") ?? "[]") as Array<{ id: string; name: string; path?: string; modifiedAt: string; width: number; height: number }>; }
  catch { return []; }
}

function rememberProject(project: OpenFrameProject) {
  const current = recentProjects().filter((item) => item.id !== project.id);
  current.unshift({ id: project.id, name: project.name, path: project.projectPath, modifiedAt: project.modifiedAt, width: project.sequence.width, height: project.sequence.height });
  localStorage.setItem("openframe.recents", JSON.stringify(current.slice(0, 12)));
}

function withoutBlobUrls(project: OpenFrameProject): OpenFrameProject {
  return { ...project, assets: project.assets.map(({ previewUrl: _previewUrl, ...asset }) => asset) };
}

function browserMetadata(url: string, kind: MediaAsset["kind"]): Promise<{ durationUs: number; width?: number; height?: number }> {
  if (kind === "image") return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ durationUs: 5 * SECOND, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ durationUs: 5 * SECOND });
    image.src = url;
  });
  return new Promise((resolve) => {
    const element = document.createElement(kind === "video" ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => resolve({
      durationUs: Number.isFinite(element.duration) ? Math.round(element.duration * SECOND) : 10 * SECOND,
      width: element instanceof HTMLVideoElement ? element.videoWidth : undefined,
      height: element instanceof HTMLVideoElement ? element.videoHeight : undefined,
    });
    element.onerror = () => resolve({ durationUs: 10 * SECOND });
    element.src = url;
  });
}

function inferKind(mime: string, name: string): MediaAsset["kind"] {
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac)$/i.test(name)) return "audio";
  return "video";
}

function fileName(path: string) { return path.split(/[\\/]/).at(-1) ?? path; }
function safeFileName(name: string) { return name.replace(/[<>:"/\\|?*]+/g, "-").trim() || "OpenFrame project"; }



export interface ModelInfo {
  id: string;
  name: string;
  purpose: string;
  version: string;
  sizeBytes: number;
  license: string;
  sourceUrl: string;
  sha1: string;
  language: string;
  quality: string;
  installed: boolean;
  installedPath?: string;
}
export interface ModelCenterStatus {
  models: ModelInfo[];
  dependencies: {
    ffmpegBundled: boolean;
    whisperRuntimeInstalled: boolean;
    whisperRuntimePath?: string;
    whisperReleasePage: string;
    modelsPage: string;
  };
}
export async function getModelCenterStatus(): Promise<ModelCenterStatus> {
  if (!isTauri()) return { models: [], dependencies: { ffmpegBundled: false, whisperRuntimeInstalled: false, whisperReleasePage: "https://github.com/ggml-org/whisper.cpp/releases", modelsPage: "https://huggingface.co/ggerganov/whisper.cpp" } };
  return invoke("model_center_status");
}
export async function downloadModel(modelId: string): Promise<string> {
  if (!isTauri()) throw new Error("Model installation requires the desktop app.");
  return invoke("download_model", { modelId });
}
export async function removeModel(modelId: string): Promise<void> {
  if (!isTauri()) throw new Error("Model removal requires the desktop app.");
  return invoke("remove_model", { modelId });
}
export async function pickAndInstallWhisperRuntime(): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const path = await open({ multiple: false, directory: false, filters: [{ name: "whisper.cpp runtime", extensions: ["exe"] }] }) ?? undefined;
  return path ? invoke<string>("install_whisper_runtime", { path }) : undefined;
}
export async function openDependencyPage(url: string): Promise<void> {
  if (isTauri()) await invoke("open_external_url", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}
export async function removeImageBackground(path: string, keyColor: string, tolerance: number, softness: number): Promise<string> {
  if (!isTauri()) throw new Error("Background removal requires the desktop app.");
  return invoke("remove_image_background", { path, keyColor, tolerance, softness });
}
export async function saveDesignRaster(svg: SVGSVGElement, format: "png" | "jpeg" | "webp", name: string): Promise<string | undefined> {
  const bytes = await rasterizeSvg(svg, format);
  const extension = format === "jpeg" ? "jpg" : format;
  if (isTauri()) {
    const path = await save({ defaultPath: `${safeFileName(name)}.${extension}`, filters: [{ name: format.toUpperCase(), extensions: [extension] }] }) ?? undefined;
    return path ? invoke<string>("save_design_file", { path, bytes: Array.from(bytes) }) : undefined;
  }
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: `image/${format}` }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${safeFileName(name)}.${extension}`; anchor.click(); URL.revokeObjectURL(url);
  return anchor.download;
}
export async function saveDesignManifest(value: unknown, name: string, extension: "of-template" | "of-pack"): Promise<string | undefined> {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
  if (isTauri()) {
    const path = await save({ defaultPath: `${safeFileName(name)}.${extension}`, filters: [{ name: "OpenFrame design manifest", extensions: [extension, "json"] }] }) ?? undefined;
    return path ? invoke<string>("save_design_file", { path, bytes: Array.from(bytes) }) : undefined;
  }
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${safeFileName(name)}.${extension}`; anchor.click(); URL.revokeObjectURL(url);
  return anchor.download;
}
export async function pickDesignManifest(): Promise<string | undefined> {
  if (isTauri()) {
    const path = await open({ multiple: false, directory: false, filters: [{ name: "OpenFrame designs", extensions: ["of-template", "of-pack", "json"] }] }) ?? undefined;
    return path ? invoke<string>("read_design_text", { path }) : undefined;
  }
  const input = document.createElement("input"); input.type = "file"; input.accept = ".of-template,.of-pack,.json";
  const file = await new Promise<File | undefined>((resolve) => { input.onchange = () => resolve(input.files?.[0]); input.click(); });
  return file?.text();
}
async function rasterizeSvg(svg: SVGSVGElement, format: "png" | "jpeg" | "webp"): Promise<Uint8Array> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const source = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Could not rasterize the design. Check for offline image layers.")); image.src = source; });
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(svg.viewBox.baseVal.width)); canvas.height = Math.max(1, Math.round(svg.viewBox.baseVal.height));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas export is unavailable.");
    if (format === "jpeg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed.")), `image/${format}`, .92));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(source); }
}

export interface DiagnosticsStatus {
  appVersion: string;
  buildProfile: string;
  target: string;
  operatingSystem: string;
  architecture: string;
  logPath: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  installedPlugins: number;
  installedModelFiles: number;
  updateChannelConfigured: boolean;
  updateMessage: string;
}
export async function getPluginStatus(): Promise<import("../types/plugins").PluginStatus> {
  const empty: import("../types/plugins").PluginStatus = { runtime: "declarative-v1", sdkVersion: 1, directory: "", plugins: [], securitySummary: "Declarative packages only." };
  if (!isTauri()) return empty;
  return invoke("plugin_status");
}
export async function pickAndInstallPlugin(): Promise<import("../types/plugins").InstalledPlugin | undefined> {
  if (!isTauri()) return undefined;
  const path = await open({ multiple: false, directory: false, filters: [{ name: "OpenFrame Plugin", extensions: ["of-plugin", "json"] }] }) ?? undefined;
  return path ? invoke("install_plugin", { path }) : undefined;
}
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  if (!isTauri()) throw new Error("Plugin management requires the desktop app.");
  return invoke("set_plugin_enabled", { pluginId, enabled });
}
export async function removePlugin(pluginId: string): Promise<void> {
  if (!isTauri()) throw new Error("Plugin management requires the desktop app.");
  return invoke("remove_plugin", { pluginId });
}
export async function openPluginsFolder(): Promise<void> {
  if (!isTauri()) throw new Error("Plugin management requires the desktop app.");
  return invoke("open_plugins_folder");
}
export async function openPluginSource(pluginId: string): Promise<void> {
  if (!isTauri()) return;
  return invoke("open_plugin_source", { pluginId });
}
export async function downloadPluginModel(pluginId: string, modelId: string): Promise<string> {
  if (!isTauri()) throw new Error("Extension model downloads require the desktop app.");
  return invoke("download_plugin_model", { pluginId, modelId });
}
export async function diagnosticsStatus(): Promise<DiagnosticsStatus> {
  if (!isTauri()) return { appVersion: "0.8.0-web", buildProfile: "browser", target: "web", operatingSystem: "browser", architecture: "unknown", logPath: "", ffmpegAvailable: false, ffprobeAvailable: false, installedPlugins: 0, installedModelFiles: 0, updateChannelConfigured: false, updateMessage: "Browser preview has no signed update channel." };
  return invoke("diagnostics_status");
}
export async function writeAppLog(level: "info" | "warning" | "error", event: string, message: string): Promise<void> {
  if (isTauri()) await invoke("write_app_log", { level, event, message });
}
export async function openLogsFolder(): Promise<void> {
  if (!isTauri()) throw new Error("Log files are available in the desktop app.");
  return invoke("open_logs_folder");
}
export async function exportDiagnostics(): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  const path = await save({ defaultPath: "OpenFrame-diagnostics.json", filters: [{ name: "JSON", extensions: ["json"] }] }) ?? undefined;
  return path ? invoke<string>("export_diagnostics", { path }) : undefined;
}
export async function checkForUpdates(): Promise<DiagnosticsStatus> {
  if (!isTauri()) return diagnosticsStatus();
  return invoke("check_for_updates");
}
export async function exportProjectWithPlugin(project: OpenFrameProject, pluginId: string, exporterId: string, label: string): Promise<string | null> {
  if (!isTauri()) throw new Error("Plugin export requires the desktop app.");
  const path = await save({ defaultPath: `${safeFileName(project.name)}-${safeFileName(label)}.mp4`, filters: [{ name: "MP4 Video", extensions: ["mp4"] }] });
  if (!path) return null;
  return invoke<string>("export_project_with_plugin", { project: flattenCompoundProject(project), outputPath: path, pluginId, exporterId });
}
