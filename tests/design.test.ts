import { describe, expect, it } from "vitest";
import { activeDesignPage, builtInTemplates, createDesignObject, createDesignProject, normalizeDesign, templateFromPage, updateDesignPage } from "../src/lib/design";
import { normalizeProject, presets } from "../src/lib/project";

describe("design document operations", () => {
  it("creates a separate, persistable design workspace", () => {
    const project = createDesignProject("Launch art", presets[0]);
    expect(project.workspace).toBe("design");
    expect(project.design?.pages).toHaveLength(1);
    expect(activeDesignPage(project)).toMatchObject({ width: 1920, height: 1080 });
    expect(project.favoriteAssetIds).toEqual([]);
  });

  it("normalizes additive design fields for legacy projects", () => {
    const legacy = createDesignProject("Legacy", presets[0]) as any;
    delete legacy.workspace;
    delete legacy.favoriteAssetIds;
    delete legacy.design;
    const normalized = normalizeProject(legacy);
    expect(normalized.workspace).toBe("video");
    expect(normalized.favoriteAssetIds).toEqual([]);
    expect(normalized.design?.pages).toHaveLength(1);
  });

  it("adds and updates editable objects with safe defaults", () => {
    const project = createDesignProject("Objects", presets[0]);
    const page = activeDesignPage(project);
    const text = createDesignObject("text", page, { text: "OpenFrame", opacity: .8 });
    const updated = updateDesignPage(project, { ...page, objects: [text] });
    expect(activeDesignPage(updated).objects[0]).toMatchObject({
      type: "text",
      text: "OpenFrame",
      visible: true,
      locked: false,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
  });

  it("ships templates and round-trips reusable user templates", () => {
    const templates = builtInTemplates();
    expect(templates.map((template) => template.category)).toContain("YouTube");
    const saved = templateFromPage(templates[0].page, "Reusable hero");
    expect(saved).toMatchObject({ name: "Reusable hero", source: "user" });
    const normalized = normalizeDesign({ ...createDesignProject("T", presets[0]).design!, templates: [saved] });
    expect(normalized.templates[0].page.objects.length).toBeGreaterThan(0);
  });
});
