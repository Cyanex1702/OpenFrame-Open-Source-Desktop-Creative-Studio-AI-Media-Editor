import type { OpenFrameProject, ProjectPreset } from "../types/project";
import type { DesignAdjustments, DesignDocument, DesignFilters, DesignObject, DesignObjectType, DesignPage, DesignTemplate } from "../types/design";
import { id, touch } from "./project";

export const designPresets: Array<{ id: string; label: string; width: number; height: number }> = [
  { id: "youtube-thumbnail", label: "YouTube thumbnail", width: 1280, height: 720 },
  { id: "instagram-square", label: "Square post", width: 1080, height: 1080 },
  { id: "story", label: "Story / Reel", width: 1080, height: 1920 },
  { id: "poster", label: "Poster", width: 1200, height: 1600 },
  { id: "presentation", label: "Presentation", width: 1920, height: 1080 },
];

export function defaultAdjustments(): DesignAdjustments {
  return { brightness: 0, contrast: 1, exposure: 0, saturation: 1, vibrance: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, sharpen: 0 };
}
export function defaultFilters(): DesignFilters {
  return { blur: 0, grayscale: 0, sepia: 0, vignette: 0, pixelate: 0, glow: 0 };
}
export function createDesignObject(type: DesignObjectType, page: DesignPage, patch: Partial<DesignObject> = {}): DesignObject {
  const size = Math.min(page.width, page.height);
  const base: DesignObject = {
    id: id("design"),
    type,
    name: ({ text: "Text", rectangle: "Rectangle", ellipse: "Ellipse", star: "Star", arrow: "Arrow", path: "Brush stroke", image: "Image", frame: "Frame" } as const)[type],
    x: page.width * .3,
    y: page.height * .3,
    width: type === "text" ? page.width * .4 : size * .28,
    height: type === "text" ? Math.max(80, page.height * .1) : size * .28,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: "normal",
    fill: type === "text" ? "#ffffff" : "#b9f75a",
    gradientAngle: 45,
    stroke: "#101418",
    strokeWidth: 0,
    cornerRadius: type === "rectangle" ? 24 : 0,
    text: type === "text" ? "Add your message" : undefined,
    fontFamily: "Arial",
    fontSize: 72,
    fontWeight: 700,
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: 1.08,
    textTransform: "none",
    textAlign: "center",
    flipHorizontal: false,
    flipVertical: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowX: 0,
    shadowY: 8,
    pathColor: "#b9f75a",
    pathWidth: 18,
    frameShape: "rounded",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    adjustments: defaultAdjustments(),
    filters: defaultFilters(),
  };
  return { ...base, ...patch, crop: { ...base.crop, ...(patch.crop ?? {}) }, adjustments: { ...base.adjustments, ...(patch.adjustments ?? {}) }, filters: { ...base.filters, ...(patch.filters ?? {}) } };
}
export function createDesignPage(width = 1280, height = 720, name = "Page 1"): DesignPage {
  return { id: id("page"), name, width, height, backgroundColor: "#14191f", gradientAngle: 45, objects: [] };
}
export function createDesignDocument(width = 1280, height = 720): DesignDocument {
  const page = createDesignPage(width, height);
  return {
    activePageId: page.id,
    pages: [page],
    textStyles: [
      { id: "style_heading", name: "Impact heading", fontFamily: "Arial", fontSize: 88, fontWeight: 800, fill: "#ffffff", textAlign: "center" },
      { id: "style_caption", name: "Clean caption", fontFamily: "Arial", fontSize: 42, fontWeight: 600, fill: "#d9dde2", textAlign: "left" },
    ],
    templates: [],
    communityPacks: [],
  };
}
export function normalizeDesign(document: DesignDocument | undefined, width = 1280, height = 720): DesignDocument {
  const fallback = createDesignDocument(width, height);
  if (!document?.pages?.length) return fallback;
  const pages = document.pages.map((page) => ({
    ...page,
    width: finite(page.width, width),
    height: finite(page.height, height),
    backgroundColor: page.backgroundColor || "#14191f",
    gradientAngle: finite(page.gradientAngle, 45),
    objects: (page.objects ?? []).map((object) => createDesignObject(object.type ?? "rectangle", page, object)),
  }));
  return {
    activePageId: pages.some((page) => page.id === document.activePageId) ? document.activePageId : pages[0].id,
    pages,
    textStyles: document.textStyles ?? fallback.textStyles,
    templates: document.templates ?? [],
    communityPacks: document.communityPacks ?? [],
  };
}
export function createDesignProject(name: string, preset: ProjectPreset): OpenFrameProject {
  const now = new Date().toISOString();
  const page = createDesignPage(preset.width, preset.height);
  const sequence = { id: id("sequence"), name: "Video interoperability", width: preset.width, height: preset.height, frameRate: preset.frameRate, tracks: [], captions: [], markers: [] };
  return {
    schemaVersion: 1,
    id: id("project"),
    name: name.trim() || "Untitled design",
    createdAt: now,
    modifiedAt: now,
    workspace: "design",
    assets: [],
    favoriteAssetIds: [],
    sequence,
    sequences: [sequence],
    activeSequenceId: sequence.id,
    design: { ...createDesignDocument(preset.width, preset.height), activePageId: page.id, pages: [page] },
    settings: { previewQuality: "full", hardwareEncoder: "software" },
  };
}
export function activeDesignPage(project: OpenFrameProject): DesignPage {
  const document = normalizeDesign(project.design, project.sequence.width, project.sequence.height);
  return document.pages.find((page) => page.id === document.activePageId) ?? document.pages[0];
}
export function updateDesignPage(project: OpenFrameProject, page: DesignPage): OpenFrameProject {
  const design = normalizeDesign(project.design);
  return touch({ ...project, design: { ...design, pages: design.pages.map((value) => value.id === page.id ? page : value) } });
}
export function templateFromPage(page: DesignPage, name: string, category = "User"): DesignTemplate {
  return { id: id("template"), name: name.trim() || "Untitled template", category, description: "Created locally in OpenFrame", source: "user", page: structuredClone(page) };
}
export function builtInTemplates(): DesignTemplate[] {
  const bold = createDesignPage(1280, 720, "Bold thumbnail");
  bold.backgroundColor = "#14191f"; bold.backgroundSecondary = "#33451f";
  bold.objects = [
    createDesignObject("rectangle", bold, { name: "Accent", x: 70, y: 70, width: 28, height: 580, fill: "#b9f75a", cornerRadius: 14 }),
    createDesignObject("text", bold, { name: "Headline", x: 145, y: 165, width: 780, height: 220, text: "MAKE IT\nUNMISSABLE", fontSize: 104, textAlign: "left" }),
    createDesignObject("ellipse", bold, { name: "Focus ring", x: 960, y: 210, width: 230, height: 230, fill: "#7a5cff", opacity: .8 }),
  ];
  const social = createDesignPage(1080, 1080, "Social launch");
  social.backgroundColor = "#ede7df"; social.objects = [
    createDesignObject("rectangle", social, { x: 90, y: 90, width: 900, height: 900, fill: "#171b20", cornerRadius: 64 }),
    createDesignObject("text", social, { x: 180, y: 330, width: 720, height: 260, text: "NEW\nDROP", fontSize: 148, fill: "#b9f75a" }),
  ];
  return [
    { id: "template_bold", name: "Bold thumbnail", category: "YouTube", description: "High-contrast thumbnail starter", source: "built-in", page: bold },
    { id: "template_social", name: "Social launch", category: "Social", description: "Square announcement graphic", source: "built-in", page: social },
  ];
}
function finite(value: number | undefined, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }