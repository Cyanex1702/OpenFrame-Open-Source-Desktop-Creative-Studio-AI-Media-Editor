import type { DesignDocument } from "./design";

export type MediaKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "text" | "graphic";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "addition";
export type MaskType = "none" | "rectangle" | "ellipse";
export type TransitionType = "none" | "fade" | "wipe-left" | "slide-left";
export type EffectType = "blur" | "sharpen" | "grayscale" | "vignette";

export interface Keyframe {
  id: string;
  timeUs: number;
  easing: Easing;
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskSettings {
  type: MaskType;
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  inverted: boolean;
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  amount: number;
  plugin?: { pluginId: string; contributionId: string; label: string };
}

export interface TransitionSettings {
  type: TransitionType;
  durationUs: number;
  plugin?: { pluginId: string; contributionId: string; label: string };
}

export interface SpeedPoint {
  id: string;
  timeUs: number;
  rate: number;
  easing: Easing;
}

export interface ChromaKeySettings {
  enabled: boolean;
  keyColor: string;
  tolerance: number;
  softness: number;
  spill: number;
  opacity: number;
  showMask: boolean;
  inverted: boolean;
}

export interface AutoBackgroundSettings {
  enabled: boolean;
  sampledColor: string;
  refinement: number;
  temporalSmoothing: number;
  mode: "fast-local" | "semantic-model";
}

export interface AdvancedColorSettings {
  exposure: number;
  vibrance: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  fade: number;
}

export interface StabilizationSettings {
  enabled: boolean;
  strength: number;
  smoothing: number;
  zoom: number;
}

export interface TrackingPoint {
  timeUs: number;
  x: number;
  y: number;
  confidence: number;
}

export interface MotionTrackingSettings {
  regionX: number;
  regionY: number;
  regionWidth: number;
  regionHeight: number;
  points: TrackingPoint[];
  analyzed: boolean;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  shadow: boolean;
  alignment: "left" | "center" | "right";
  positionY: number;
  wordHighlightColor: string;
}

export interface Caption {
  id: string;
  startUs: number;
  endUs: number;
  text: string;
  words: Array<{ text: string; startUs: number; endUs: number }>;
  style: CaptionStyle;
}

export interface ProjectSettings {
  previewQuality: "full" | "half" | "quarter" | "proxy";
  hardwareEncoder: "software" | "h264_nvenc" | "h264_qsv" | "h264_amf";
  transcriptionModelPath?: string;
}
export interface Rational {
  numerator: number;
  denominator: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  kind: MediaKind;
  durationUs: number;
  width?: number;
  height?: number;
  codec?: string;
  sizeBytes?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  missing?: boolean;
  proxyPath?: string;
  proxyEnabled?: boolean;
  proxyStatus?: "none" | "generating" | "ready" | "error";
  favorite?: boolean;
  hasAudio?: boolean;
}

export interface TimelineMarker {
  id: string;
  timeUs: number;
  label: string;
  color: string;
  kind: "manual" | "beat";
}
export interface TimelineItem {
  id: string;
  assetId: string;
  trackId: string;
  name: string;
  kind: MediaKind;
  startUs: number;
  durationUs: number;
  sourceInUs: number;
  sourceOutUs: number;
  volume: number;
  opacity: number;
  positionX: number;
  positionY: number;
  scale: number;
  rotation: number;
  crop: CropSettings;
  flipHorizontal: boolean;
  flipVertical: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  fadeInUs: number;
  fadeOutUs: number;
  playbackRate: number;
  reversed: boolean;
  freezeFrameUs?: number;
  blendMode: BlendMode;
  mask: MaskSettings;
  keyframes: Keyframe[];
  effects: EffectInstance[];
  transitionIn: TransitionSettings;
  transitionOut: TransitionSettings;
  speedPoints: SpeedPoint[];
  chromaKey: ChromaKeySettings;
  autoBackground: AutoBackgroundSettings;
  advancedColor: AdvancedColorSettings;
  lutPath?: string;
  lutIntensity: number;
  stabilization: StabilizationSettings;
  motionTracking: MotionTrackingSettings;
  linkedItemIds: string[];
  compoundSequenceId?: string;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  locked: boolean;
  muted: boolean;
  visible: boolean;
  gain: number;
  pan: number;
  solo: boolean;
  items: TimelineItem[];
}

export interface Sequence {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: Rational;
  tracks: Track[];
  captions: Caption[];
  markers: TimelineMarker[];
  compound?: boolean;
  parentSequenceId?: string;
}

export interface OpenFrameProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  projectPath?: string;
  workspace: "video" | "design";
  assets: MediaAsset[];
  favoriteAssetIds: string[];
  design?: DesignDocument;
  sequence: Sequence;
  sequences: Sequence[];
  activeSequenceId: string;
  settings: ProjectSettings;
}

export interface ProjectPreset {
  name: string;
  label: string;
  width: number;
  height: number;
  frameRate: Rational;
}

export interface RecentProject {
  id: string;
  name: string;
  path?: string;
  modifiedAt: string;
  width: number;
  height: number;
}

