// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { autosaveProject, discardRecovery, recoverableProjects } from "../src/lib/native";
import { createProject, presets, SECOND } from "../src/lib/project";

afterEach(() => localStorage.clear());

describe("autosave and crash recovery", () => {
  it("stores, lists, and discards a recoverable project locally", async () => {
    const project = createProject("Recovery test", presets[0]);
    project.sequence.markers.push({ id: "recovered-marker", timeUs: SECOND, label: "Recovered", color: "#b9f75a", kind: "manual" });
    project.modifiedAt = "2026-08-17T12:34:56.000Z";
    await autosaveProject(project);
    const recoveries = await recoverableProjects();
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].sequence.markers[0].label).toBe("Recovered");
    expect(recoveries[0].activeSequenceId).toBe(project.sequence.id);
    await discardRecovery(project.id);
    expect(await recoverableProjects()).toEqual([]);
  });
});