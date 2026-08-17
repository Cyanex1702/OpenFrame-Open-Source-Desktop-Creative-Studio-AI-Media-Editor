// @vitest-environment jsdom

import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "../src/components/Editor";
import * as native from "../src/lib/native";
import { createProject, presets, SECOND } from "../src/lib/project";
import { EditorProvider, useEditor } from "../src/store/editor-store";
import type { OpenFrameProject } from "../src/types/project";

afterEach(cleanup);

function Harness({ project }: { project: OpenFrameProject }) {
  const editor = useEditor();
  useEffect(() => editor.open(project), [editor.open, project]);
  return <Editor onHome={vi.fn()} />;
}

function renderEditor() {
  const project = createProject("Interaction test", presets[0]);
  project.assets = [
    { id: "asset-one", name: "one.mp4", path: "C:\\media\\one.mp4", kind: "video", durationUs: 3 * SECOND },
    { id: "asset-two", name: "two.mp4", path: "C:\\media\\two.mp4", kind: "video", durationUs: 2 * SECOND },
  ];
  return render(<EditorProvider><Harness project={project} /></EditorProvider>);
}

describe("editor interactions", () => {
  it("adds two imported videos through visible buttons", async () => {
    const user = userEvent.setup();
    const view = renderEditor();

    await user.click(await screen.findByTitle("Add one.mp4 to timeline"));
    await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip")).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toContain("Added one.mp4");

    await user.click(screen.getByTitle("Add two.mp4 to timeline"));
    await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip")).toHaveLength(2));
    expect(screen.getByRole("status").textContent).toContain("Added two.mp4");
  });

  it("supports keyboard insertion, frame stepping, snapping, and deletion", async () => {
    const user = userEvent.setup();
    const view = renderEditor();
    const firstCard = await screen.findByRole("button", { name: /one\.mp4/i });

    fireEvent.keyDown(firstCard, { key: "Enter" });
    await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip")).toHaveLength(1));

    await user.click(screen.getByTitle("Next frame"));
    expect(screen.getByText("00:00:00:01")).toBeTruthy();

    const snapping = screen.getByRole("button", { name: /snapping/i });
    expect(snapping.getAttribute("aria-pressed")).toBe("true");
    await user.click(snapping);
    expect(snapping.getAttribute("aria-pressed")).toBe("false");

    await user.click(screen.getByTitle("Delete selected clip"));
    await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip")).toHaveLength(0));
  });

  it("keeps drag and drop as a working timeline shortcut", async () => {
    const view = renderEditor();
    const firstCard = await screen.findByRole("button", { name: /one\.mp4/i });
    const videoLane = view.container.querySelectorAll<HTMLElement>(".track-lane")[1];
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };

    fireEvent.dragStart(firstCard, { dataTransfer });
    fireEvent.dragOver(videoLane, { dataTransfer });
    fireEvent.drop(videoLane, { clientX: 108, dataTransfer });

    await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip")).toHaveLength(1));
    expect(screen.getByRole("status").textContent).toContain("Added one.mp4");
  });
  it("opens working File and View menus", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: /^file$/i }));
    expect(screen.getByRole("button", { name: /export mp4/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save as/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "View" }));
    const zoom = screen.getByRole("slider", { name: "" }) as HTMLInputElement;
    expect(zoom.value).toBe("1");
    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(zoom.value).toBe("1.25");
  });
  it("exposes the Milestone 4 tool rail and keeps later controls honest", async () => {
    renderEditor();
    expect((await screen.findByRole("button", { name: "Captions" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Cutout" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Advanced" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Models" }) as HTMLButtonElement).disabled).toBe(false);
    const microphone = screen.getByTitle("Record microphone voice-over at playhead") as HTMLButtonElement;
    expect(microphone.disabled).toBe(false);
    await userEvent.click(microphone);
    expect(screen.getByRole("status").textContent).toContain("Microphone recording is unavailable");
  });

  it("edits captions, chroma key, and speed ramps through visible controls", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole("button", { name: "Captions" }));
    await user.click(screen.getByRole("button", { name: "+ Manual" }));
    expect((screen.getByLabelText("Caption text") as HTMLTextAreaElement).value).toBe("New caption");

    await user.click(screen.getByRole("button", { name: "Media" }));
    await user.click(screen.getByTitle("Add one.mp4 to timeline"));
    await user.click(screen.getByRole("button", { name: "Cutout" }));
    await user.click(screen.getByLabelText("Enable chroma key"));
    expect((screen.getByLabelText("Enable chroma key") as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: /add speed point/i }));
    expect(screen.getByLabelText("Speed point rate")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Preview quality"), { target: { value: "quarter" } });
    expect((screen.getByLabelText("Preview quality") as HTMLSelectElement).value).toBe("quarter");
  });

  it("edits real transform and color properties from the inspector", async () => {
    const user = userEvent.setup();
    const view = renderEditor();
    await user.click(await screen.findByTitle("Add one.mp4 to timeline"));

    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "0.2" } });

    await waitFor(() => {
      const layer = view.container.querySelector<HTMLElement>(".preview-object-layer");
      expect(layer?.style.transform).toContain("6.25%");
      expect(layer?.style.transform).toContain("scale(1.25)");
      expect(layer?.style.filter).toContain("brightness(1.2)");
    });
  });
  it("edits animation, compositing, masks, effects, and retiming", async () => {
    const user = userEvent.setup();
    const view = renderEditor();
    await user.click(await screen.findByTitle("Add one.mp4 to timeline"));

    await user.click(screen.getByRole("button", { name: /add \/ update at/i }));
    expect(view.container.querySelectorAll(".keyframe-row")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Blend mode"), { target: { value: "screen" } });
    fireEvent.change(screen.getByLabelText("Mask type"), { target: { value: "ellipse" } });
    await user.click(screen.getByRole("button", { name: "+ blur" }));
    fireEvent.change(screen.getByLabelText("Playback speed"), { target: { value: "2" } });
    await user.click(screen.getByLabelText("Reverse clip"));
    fireEvent.change(screen.getByLabelText("Transition in"), { target: { value: "fade" } });
    fireEvent.change(screen.getByLabelText("transitionIn duration"), { target: { value: "0.5" } });

    await waitFor(() => {
      const layer = view.container.querySelector<HTMLElement>(".preview-object-layer");
      expect(layer?.style.mixBlendMode).toBe("screen");
      expect(layer?.style.maskImage).toContain("radial-gradient");
      expect(layer?.style.filter).toContain("blur(9px)");
      expect(view.container.querySelector(".clip-badge")?.textContent).toContain("◆1");
    });
  });
  it("creates and opens compound clips and manages multiple sequences", async () => {
    const user = userEvent.setup();
    const view = renderEditor();
    await user.click(await screen.findByTitle("Add one.mp4 to timeline"));
    await user.click(screen.getByTitle("Create compound clip from selection"));
    await waitFor(() => expect(view.container.querySelector(".clip-badge.compound")?.textContent).toBe("compound"));
    const compoundClip = view.container.querySelector<HTMLElement>(".timeline-clip")!;
    fireEvent.doubleClick(compoundClip);
    await waitFor(() => expect((screen.getByLabelText("Active sequence name") as HTMLInputElement).value).toContain("Compound"));
    await user.click(screen.getByTitle("Add sequence"));
    expect(view.container.querySelectorAll(".sequence-tabs button").length).toBe(3);
    await user.click(screen.getByTitle("Duplicate active sequence"));
    expect(view.container.querySelectorAll(".sequence-tabs button").length).toBe(4);
  });
  it("records microphone audio and inserts it on a voice-over track", async () => {
    const originalRecorder = globalThis.MediaRecorder;
    const originalDevices = navigator.mediaDevices;
    class FakeMediaRecorder {
      static isTypeSupported() { return true; }
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}
      start() {}
      stop() { this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: this.mimeType }) }); this.onstop?.(); }
    }
    const stop = vi.fn();
    Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const saved = vi.spyOn(native, "saveVoiceRecording").mockResolvedValue({ id: "voice-asset", name: "Voice over.webm", path: "voice.webm", kind: "audio", durationUs: SECOND });
    try {
      const user = userEvent.setup();
      const view = renderEditor();
      await user.click(await screen.findByTitle("Record microphone voice-over at playhead"));
      expect(screen.getByTitle("Stop voice-over recording")).toBeTruthy();
      await user.click(screen.getByTitle("Stop voice-over recording"));
      await waitFor(() => expect(view.container.querySelectorAll(".timeline-clip.audio")).toHaveLength(1));
      expect(screen.getByRole("status").textContent).toContain("Voice-over added");
      expect(stop).toHaveBeenCalled();
    } finally {
      saved.mockRestore();
      Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: originalRecorder });
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: originalDevices });
    }
  });});
