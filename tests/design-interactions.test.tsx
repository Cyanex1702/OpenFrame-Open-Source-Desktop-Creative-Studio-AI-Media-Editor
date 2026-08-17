// @vitest-environment jsdom

import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignWorkspace } from "../src/components/DesignWorkspace";
import { createDesignProject } from "../src/lib/design";
import { presets } from "../src/lib/project";
import { EditorProvider, useEditor } from "../src/store/editor-store";

afterEach(cleanup);

function Harness() {
  const editor = useEditor();
  useEffect(() => editor.open(createDesignProject("Design interaction", presets[0])), [editor.open]);
  return <DesignWorkspace onHome={vi.fn()} />;
}
function renderDesign() { return render(<EditorProvider><Harness /></EditorProvider>); }

describe("design workspace interactions", () => {
  it("adds text and edits it through the real inspector", async () => {
    const user = userEvent.setup();
    const view = renderDesign();
    await user.click(await screen.findByRole("button", { name: "Text" }));
    const text = await screen.findByLabelText("Design text") as HTMLTextAreaElement;
    expect(text.value).toContain("Add your");
    await user.clear(text);
    await user.type(text, "Local design");
    await waitFor(() => expect(view.container.querySelector("svg text")?.textContent).toBe("Local design"));
  });

  it("organizes pages and opens the optional model center", async () => {
    const user = userEvent.setup();
    renderDesign();
    await user.click(await screen.findByRole("button", { name: "Models" }));
    expect(await screen.findByRole("dialog", { name: /models & dependencies/i })).toBeTruthy();
    expect(screen.getByText(/nothing is fetched without your click/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close model center" }));
    await user.click(screen.getByRole("button", { name: /Page$/ }));
    await waitFor(() => expect(screen.getByText(/2 pages/)).toBeTruthy());
  });

  it("exposes the milestone toolset and export choices", async () => {
    renderDesign();
    for (const name of ["Image", "Rectangle", "Ellipse", "Star", "Arrow", "Frame", "Brush", "Eraser"]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /save current as template/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^export$/i })).toBeTruthy();
    expect(screen.getByLabelText("Design export format")).toBeTruthy();
  });
});
