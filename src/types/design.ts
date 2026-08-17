export type DesignObjectType = "image" | "text" | "rectangle" | "ellipse" | "star" | "arrow" | "path" | "frame";
export type DesignBlendMode = "normal" | "multiply" | "screen" | "overlay";
export type DesignFrameShape = "rectangle" | "rounded" | "circle";
export type DesignPresetId = "youtube-thumbnail" | "instagram-square" | "story" | "poster" | "presentation";

export interface DesignAdjustments {
  brightness: number;
  contrast: number;
  exposure: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  sharpen: number;
}

export interface DesignFilters {
  blur: number;
  grayscale: number;
  sepia: number;
  vignette: number;
  pixelate: number;
  glow: number;
}

export interface DesignCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignObject {
  id: string;
  type: DesignObjectType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode: DesignBlendMode;
  fill: string;
  fillSecondary?: string;
  gradientAngle: number;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textAlign?: "left" | "center" | "right";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowX?: number;
  shadowY?: number;
  assetId?: string;
  path?: string;
  pathColor?: string;
  pathWidth?: number;
  frameShape?: DesignFrameShape;
  crop: DesignCrop;
  adjustments: DesignAdjustments;
  filters: DesignFilters;
}

export interface DesignPage {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  backgroundSecondary?: string;
  gradientAngle: number;
  objects: DesignObject[];
}

export interface DesignTextStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
  textAlign: "left" | "center" | "right";
}

export interface DesignTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  page: DesignPage;
  source: "built-in" | "user" | "community";
}

export interface CommunityAssetItem {
  id: string;
  name: string;
  kind: "template" | "graphic" | "text-style";
  data: DesignTemplate | DesignObject | DesignTextStyle;
}

export interface CommunityAssetPack {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  sourceUrl?: string;
  items: CommunityAssetItem[];
}

export interface DesignDocument {
  activePageId: string;
  pages: DesignPage[];
  textStyles: DesignTextStyle[];
  templates: DesignTemplate[];
  communityPacks: CommunityAssetPack[];
}