import type { DesignTemplate } from "./design";
import type { EffectType, TransitionType } from "./project";

export interface PluginManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  minimumOpenFrameVersion: string;
  runtime: "declarative-v1";
  permissions: Array<"project.read" | "media.read" | "models.download">;
  capabilities: string[];
  license: string;
  sourceUrl?: string;
}
export interface PluginEffect { id: string; name: string; kind: EffectType; defaultAmount: number; description: string }
export interface PluginTransition { id: string; name: string; kind: Exclude<TransitionType, "none">; defaultDurationMs: number; description: string }
export interface PluginTheme { id: string; name: string; tokens: Partial<Record<"background" | "panel" | "surface" | "border" | "text" | "muted" | "accent" | "accentSecondary", string>> }
export interface PluginAiModel { id: string; name: string; purpose: string; version: string; sizeBytes: number; license: string; sourceUrl: string; sha256: string; runtime: "whisper.cpp" | "onnx" }
export interface PluginExporter { id: string; name: string; description: string; container: "mp4"; videoCodec: "h264"; crf: number; audioBitrateKbps: number }
export interface PluginContributions {
  effects: PluginEffect[];
  transitions: PluginTransition[];
  templates: DesignTemplate[];
  themes: PluginTheme[];
  aiModels: PluginAiModel[];
  exporters: PluginExporter[];
}
export interface PluginPackage { manifest: PluginManifest; contributions: PluginContributions }
export interface InstalledPlugin { package: PluginPackage; enabled: boolean; packageSha256: string }
export interface PluginStatus { runtime: "declarative-v1"; sdkVersion: 1; directory: string; plugins: InstalledPlugin[]; securitySummary: string }
export interface PluginReference { pluginId: string; contributionId: string }
