import { describe, expect, it } from "vitest";
import { activeAudibleItemsAt, activeItemAt, activeVisualItemsAt, addAssetToTimeline, addSequence, createCompoundClip, createProject, deleteItem, deleteItems, duplicateActiveSequence, duplicateItems, durationOf, evaluateTimelineItem, flattenCompoundProject, linkItems, moveItem, moveItems, normalizeProject, removeActiveSequence, presets, rippleDeleteItems, rollEdit, SECOND, slideItem, slipItem, sourceDistanceAt, sourceTimeAt, speedAt, splitItem, switchSequence, trimItem, unlinkItems } from "../src/lib/project";
import type { OpenFrameProject, TimelineItem } from "../src/types/project";

function projectWithClip() {
  const project = createProject("Test", presets[0]);
  const track = project.sequence.tracks.find((candidate) => candidate.name === "Main video")!;
  const item: TimelineItem = {
    id: "clip-1",
    assetId: "asset-1",
    trackId: track.id,
    name: "sample.mp4",
    kind: "video",
    startUs: SECOND,
    durationUs: 8 * SECOND,
    sourceInUs: 2 * SECOND,
    sourceOutUs: 10 * SECOND,
    volume: 1,
    opacity: 1,
    positionX: 0,
    positionY: 0,
    scale: 1,
    rotation: 0,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    flipHorizontal: false,
    flipVertical: false,
    brightness: 0,
    contrast: 1,
    saturation: 1,
    fadeInUs: 0,
    fadeOutUs: 0,
    playbackRate: 1,
    reversed: false,
    blendMode: "normal",
    mask: { type: "none", x: 0, y: 0, width: 1, height: 1, feather: 0, inverted: false },
    keyframes: [],
    effects: [],
    transitionIn: { type: "none", durationUs: 0 },
    transitionOut: { type: "none", durationUs: 0 },
    speedPoints: [],
    chromaKey: { enabled: false, keyColor: "#00ff00", tolerance: .25, softness: .08, spill: .35, opacity: 1, showMask: false, inverted: false },
    autoBackground: { enabled: false, sampledColor: "#00ff00", refinement: .3, temporalSmoothing: .5, mode: "fast-local" },
    advancedColor: { exposure: 0, vibrance: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, fade: 0 },
    lutIntensity: 1,
    stabilization: { enabled: false, strength: .5, smoothing: 15, zoom: 0 },
    motionTracking: { regionX: .5, regionY: .5, regionWidth: .2, regionHeight: .2, points: [], analyzed: false },
    linkedItemIds: [],
  };
  track.items.push(item);
  return project;
}

describe("timeline operations", () => {
  it("creates an explicit project timebase", () => {
    const project = createProject("Frame accurate", presets[0]);
    expect(project.schemaVersion).toBe(1);
    expect(project.sequence.frameRate).toEqual({ numerator: 30, denominator: 1 });
    expect(project.sequence.tracks.map((track) => track.kind)).toEqual(["graphic", "video", "video", "audio", "audio"]);
  });

  it("adds repeated imported videos sequentially to the timeline", () => {
    const project = createProject("Imports", presets[0]);
    const first = { id: "asset-1", name: "one.mp4", path: "one.mp4", kind: "video" as const, durationUs: 3 * SECOND };
    const second = { id: "asset-2", name: "two.mp4", path: "two.mp4", kind: "video" as const, durationUs: 2 * SECOND };
    const one = addAssetToTimeline(project, first);
    const two = addAssetToTimeline(one.project, second);

    expect(two.project.sequence.tracks.find((track) => track.name === "Main video")!.items).toHaveLength(2);
    expect(one.item.startUs).toBe(0);
    expect(two.item.startUs).toBe(3 * SECOND);
    expect(two.item.trackId).toBe(two.project.sequence.tracks.find((track) => track.name === "Main video")!.id);
  });

  it("creates an unlocked compatible track when all matching tracks are locked", () => {
    const project = createProject("Locked", presets[0]);
    project.sequence.tracks.filter((track) => track.kind === "video").forEach((track) => { track.locked = true; });
    const asset = { id: "asset-1", name: "clip.mp4", path: "clip.mp4", kind: "video" as const, durationUs: SECOND };
    const result = addAssetToTimeline(project, asset);

    expect(result.project.sequence.tracks.filter((track) => track.kind === "video")).toHaveLength(3);
    expect(result.project.sequence.tracks.find((track) => track.id === result.item.trackId)?.locked).toBe(false);
  });
  it("splits a clip while preserving source timing", () => {
    const result = splitItem(projectWithClip(), "clip-1", 4 * SECOND);
    const items = result.sequence.tracks.find((track) => track.name === "Main video")!.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ startUs: SECOND, durationUs: 3 * SECOND, sourceInUs: 2 * SECOND, sourceOutUs: 5 * SECOND });
    expect(items[1]).toMatchObject({ startUs: 4 * SECOND, durationUs: 5 * SECOND, sourceInUs: 5 * SECOND, sourceOutUs: 10 * SECOND });
  });

  it("does not split outside a clip", () => {
    const result = splitItem(projectWithClip(), "clip-1", 20 * SECOND);
    expect(result.sequence.tracks.find((track) => track.name === "Main video")!.items).toHaveLength(1);
  });

  it("trims the start without creating a negative source offset", () => {
    const result = trimItem(projectWithClip(), "clip-1", "start", -5 * SECOND);
    expect(result.sequence.tracks.find((track) => track.name === "Main video")!.items[0]).toMatchObject({ startUs: 0, sourceInUs: SECOND, durationUs: 9 * SECOND });
  });

  it("moves clips and clamps them to sequence zero", () => {
    const result = moveItem(projectWithClip(), "clip-1", -SECOND);
    expect(result.sequence.tracks.find((track) => track.name === "Main video")!.items[0].startUs).toBe(0);
  });

  it("respects locked tracks", () => {
    const project = projectWithClip();
    project.sequence.tracks.filter((track) => track.kind === "video").forEach((track) => { track.locked = true; });
    const result = moveItem(project, "clip-1", 4 * SECOND);
    expect(result.sequence.tracks.find((track) => track.name === "Main video")!.items[0].startUs).toBe(SECOND);
  });

  it("calculates sequence duration and deletes clips", () => {
    const project = projectWithClip();
    expect(durationOf(project)).toBe(9 * SECOND);
    expect(durationOf(deleteItem(project, "clip-1"))).toBe(0);
  });

  it("evaluates the program item at the playhead with an exclusive clip end", () => {
    const project = projectWithClip();
    expect(activeItemAt(project, SECOND)?.id).toBe("clip-1");
    expect(activeItemAt(project, 8_999_999)?.id).toBe("clip-1");
    expect(activeItemAt(project, 9 * SECOND)).toBeUndefined();
    expect(activeItemAt(project, SECOND - 1)).toBeUndefined();
  });

  it("ignores hidden visuals and muted audio when evaluating the program monitor", () => {
    const project = projectWithClip();
    const visualTrack = project.sequence.tracks.find((track) => track.name === "Main video")!;
    const audioTrack = project.sequence.tracks.find((track) => track.name === "Audio 1")!;
    visualTrack.visible = false;
    audioTrack.items.push({
      ...visualTrack.items[0],
      id: "audio-1",
      assetId: "audio-asset",
      trackId: audioTrack.id,
      name: "dialogue.wav",
      kind: "audio",
    });

    expect(activeItemAt(project, 2 * SECOND)?.id).toBe("audio-1");
    audioTrack.muted = true;
    expect(activeItemAt(project, 2 * SECOND)).toBeUndefined();
  });
  it("routes image overlays and mixes simultaneous audio lanes", () => {
    const project = createProject("Layered", presets[0]);
    const image = { id: "image", name: "logo.png", path: "logo.png", kind: "image" as const, durationUs: 0 };
    const music = { id: "music", name: "music.wav", path: "music.wav", kind: "audio" as const, durationUs: 5 * SECOND };
    const voice = { id: "voice", name: "voice.wav", path: "voice.wav", kind: "audio" as const, durationUs: 5 * SECOND };
    const withImage = addAssetToTimeline(project, image, 0);
    const audioOne = addAssetToTimeline(withImage.project, music, 0, project.sequence.tracks.find((track) => track.name === "Audio 1")!.id);
    const audioTwo = addAssetToTimeline(audioOne.project, voice, 0, project.sequence.tracks.find((track) => track.name === "Audio 2")!.id);

    expect(audioTwo.project.sequence.tracks.find((track) => track.kind === "graphic")!.items[0].kind).toBe("image");
    expect(activeVisualItemsAt(audioTwo.project, SECOND).map((item) => item.kind)).toEqual(["image"]);
    expect(activeAudibleItemsAt(audioTwo.project, SECOND).map((item) => item.id)).toEqual([audioOne.item.id, audioTwo.item.id]);
  });
  it("applies additive Creator Tools defaults to legacy projects", () => {
    const legacy = JSON.parse(JSON.stringify(projectWithClip()));
    const legacyItem = legacy.sequence.tracks.find((track: { name: string }) => track.name === "Main video")!.items[0] as Record<string, unknown>;
    for (const key of ["positionX", "positionY", "scale", "rotation", "brightness", "contrast", "saturation", "fadeInUs", "fadeOutUs", "playbackRate", "reversed", "blendMode", "mask", "keyframes", "effects", "transitionIn", "transitionOut", "speedPoints", "chromaKey", "autoBackground", "advancedColor", "lutIntensity", "stabilization", "motionTracking"]) delete legacyItem[key];
    const item = normalizeProject(legacy).sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    expect(item).toMatchObject({ positionX: 0, positionY: 0, scale: 1, rotation: 0, brightness: 0, contrast: 1, saturation: 1, fadeInUs: 0, fadeOutUs: 0, playbackRate: 1, reversed: false, blendMode: "normal", mask: { type: "none" }, keyframes: [], effects: [], transitionIn: { type: "none", durationUs: 0 }, transitionOut: { type: "none", durationUs: 0 } });
  });});


  it("returns every active visual in bottom-to-top compositor order", () => {
    const project = projectWithClip();
    const topTrack = { ...project.sequence.tracks.find((track) => track.name === "Main video")!, id: "top", name: "Video 2", items: [{ ...project.sequence.tracks.find((track) => track.name === "Main video")!.items[0], id: "top-clip", trackId: "top" }] };
    project.sequence.tracks.unshift(topTrack);
    expect(activeVisualItemsAt(project, 2 * SECOND).map((item) => item.id)).toEqual(["clip-1", "top-clip"]);
  });describe("animation and retiming", () => {
  it("interpolates transform keyframes with easing", () => {
    const item = projectWithClip().sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    item.keyframes = [
      { id: "a", timeUs: 0, easing: "linear", positionX: 0, positionY: 0, scale: 1, rotation: 0, opacity: 1, brightness: 0, contrast: 1, saturation: 1 },
      { id: "b", timeUs: 2 * SECOND, easing: "linear", positionX: 200, positionY: 100, scale: 2, rotation: 90, opacity: .5, brightness: .2, contrast: 1.2, saturation: .8 },
    ];
    const result = evaluateTimelineItem(item, item.startUs + SECOND);
    expect(result.positionX).toBe(100);
    expect(result.scale).toBe(1.5);
    expect(result.opacity).toBe(.75);
  });

  it("maps speed, reverse, and freeze frame source time", () => {
    const item = projectWithClip().sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    item.playbackRate = 2;
    expect(sourceTimeAt(item, item.startUs + SECOND)).toBe(4 * SECOND);
    item.reversed = true;
    expect(sourceTimeAt(item, item.startUs + SECOND)).toBe(8 * SECOND);
    item.freezeFrameUs = 3 * SECOND;
    expect(sourceTimeAt(item, item.startUs + 7 * SECOND)).toBe(3 * SECOND);
  });

  it("splits sped-up reverse clips into correct source ranges and local keyframes", () => {
    const project = projectWithClip();
    const item = project.sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    item.playbackRate = 2;
    item.reversed = true;
    item.durationUs = 4 * SECOND;
    item.keyframes = [{ id: "move", timeUs: 3 * SECOND, easing: "linear", positionX: 10, positionY: 0, scale: 1, rotation: 0, opacity: 1, brightness: 0, contrast: 1, saturation: 1 }];
    const result = splitItem(project, item.id, item.startUs + SECOND);
    const [left, right] = result.sequence.tracks.find((track) => track.name === "Main video")!.items;
    expect(left).toMatchObject({ sourceInUs: 8 * SECOND, sourceOutUs: 10 * SECOND, durationUs: SECOND });
    expect(right).toMatchObject({ sourceInUs: 2 * SECOND, sourceOutUs: 8 * SECOND, durationUs: 3 * SECOND });
    expect(right.keyframes.some((frame) => frame.timeUs === 2 * SECOND)).toBe(true);
  });

  it("trims reverse clips using playback-rate-aware source timing", () => {
    const project = projectWithClip();
    const item = project.sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    item.playbackRate = 2;
    item.reversed = true;
    item.durationUs = 4 * SECOND;
    const result = trimItem(project, item.id, "end", -SECOND);
    expect(result.sequence.tracks.find((track) => track.name === "Main video")!.items[0]).toMatchObject({ durationUs: 3 * SECOND, sourceInUs: 4 * SECOND, sourceOutUs: 10 * SECOND });
  });});
describe("Milestone 4 speed ramps", () => {
  it("interpolates ramp speed and integrates source distance", () => {
    const item = projectWithClip().sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    item.speedPoints = [
      { id: "slow", timeUs: SECOND, rate: 0.5, easing: "linear" },
      { id: "fast", timeUs: 3 * SECOND, rate: 2, easing: "linear" },
    ];
    expect(speedAt(item, SECOND)).toBeCloseTo(0.5, 5);
    expect(speedAt(item, 2 * SECOND)).toBeCloseTo(1.25, 5);
    expect(sourceDistanceAt(item, 3 * SECOND)).toBeGreaterThan(2.5 * SECOND);
    expect(sourceTimeAt(item, item.startUs + 3 * SECOND)).toBe(item.sourceInUs + sourceDistanceAt(item, 3 * SECOND));
  });
});
describe("functional multiselect timeline operations", () => {
  it("duplicates, moves, and deletes a selected clip group", () => {
    const project=projectWithClip(); const original=project.sequence.tracks.find((track)=>track.name==="Main video")!.items[0];
    const duplicated=duplicateItems(project,[original.id],SECOND); expect(duplicated.itemIds).toHaveLength(1);
    const overlay=duplicated.project.sequence.tracks.find((track)=>track.kind==="video"&&track.id!==original.trackId)!;
    const moved=moveItems(duplicated.project,[original.id,duplicated.itemIds[0]],original.id,3*SECOND,overlay.id);
    expect(moved.sequence.tracks.find((track)=>track.id===overlay.id)!.items.map((item)=>item.startUs).sort()).toEqual([3*SECOND,4*SECOND]);
    const deleted=deleteItems(moved,[original.id,...duplicated.itemIds]);
    expect(deleted.sequence.tracks.flatMap((track)=>track.items)).toHaveLength(0);
  });

  it("normalizes crop and flip defaults for legacy clips", () => {
    const legacy=projectWithClip() as unknown as {sequence:{tracks:Array<{items:Array<Record<string,unknown>>}>}};
    const item=legacy.sequence.tracks.flatMap((track)=>track.items)[0]; delete item.crop; delete item.flipHorizontal; delete item.flipVertical;
    const normalized=normalizeProject(legacy as unknown as ReturnType<typeof projectWithClip>).sequence.tracks.flatMap((track)=>track.items)[0];
    expect(normalized.crop).toEqual({x:0,y:0,width:1,height:1}); expect(normalized.flipHorizontal).toBe(false); expect(normalized.flipVertical).toBe(false);
  });
});
describe("linked clips and professional edits",()=>{
  function projectWithThreeClips(){const project=projectWithClip();project.assets.push({id:"asset-1",name:"sample.mp4",path:"sample.mp4",kind:"video",durationUs:20*SECOND});const track=project.sequence.tracks.find((value)=>value.name==="Main video")!,first=track.items[0],second={...structuredClone(first),id:"clip-2",name:"second",startUs:9*SECOND,sourceInUs:2*SECOND,sourceOutUs:10*SECOND},third={...structuredClone(first),id:"clip-3",name:"third",startUs:17*SECOND,sourceInUs:2*SECOND,sourceOutUs:10*SECOND};track.items=[first,second,third];return project;}
  it("moves, trims, splits, and unlinks a linked video/audio pair together",()=>{const project=projectWithClip(),video=project.sequence.tracks.find((track)=>track.name==="Main video")!.items[0],audioTrack=project.sequence.tracks.find((track)=>track.name==="Audio 1")!,audio={...structuredClone(video),id:"audio-linked",trackId:audioTrack.id,kind:"audio" as const,linkedItemIds:[]};audioTrack.items.push(audio);const linked=linkItems(project,[video.id,audio.id]);expect(linked.sequence.tracks.flatMap((track)=>track.items).filter((item)=>[video.id,audio.id].includes(item.id)).every((item)=>item.linkedItemIds.length===1)).toBe(true);const moved=moveItems(linked,[video.id],video.id,3*SECOND);expect(moved.sequence.tracks.flatMap((track)=>track.items).filter((item)=>[video.id,audio.id].includes(item.id)).map((item)=>item.startUs)).toEqual([3*SECOND,3*SECOND]);const trimmed=trimItem(moved,video.id,"start",SECOND);expect(trimmed.sequence.tracks.flatMap((track)=>track.items).filter((item)=>[video.id,audio.id].includes(item.id)).map((item)=>item.durationUs)).toEqual([7*SECOND,7*SECOND]);const split=splitItem(trimmed,video.id,5*SECOND);expect(split.sequence.tracks.flatMap((track)=>track.items).filter((item)=>item.linkedItemIds.length)).toHaveLength(4);const unlinked=unlinkItems(split,[video.id]);expect(unlinked.sequence.tracks.flatMap((track)=>track.items).find((item)=>item.id===video.id)!.linkedItemIds).toEqual([]);expect(unlinked.sequence.tracks.flatMap((track)=>track.items).filter((item)=>item.linkedItemIds.length)).toHaveLength(2);});
  it("ripple deletes and closes the exact removed gap",()=>{const project=projectWithThreeClips(),track=project.sequence.tracks.find((value)=>value.name==="Main video")!;const result=rippleDeleteItems(project,["clip-1"]),items=result.sequence.tracks.find((value)=>value.id===track.id)!.items;expect(items.map((item)=>[item.id,item.startUs])).toEqual([["clip-2",SECOND],["clip-3",9*SECOND]]);});
  it("performs roll, slip, and slide edits without changing unrelated tracks",()=>{const project=projectWithThreeClips();const rolled=rollEdit(project,"clip-1","end",SECOND),rolledItems=rolled.sequence.tracks.find((track)=>track.name==="Main video")!.items;expect(rolledItems.find((item)=>item.id==="clip-1")!.durationUs).toBe(9*SECOND);expect(rolledItems.find((item)=>item.id==="clip-2")!.startUs).toBe(10*SECOND);const slipped=slipItem(project,"clip-2",SECOND),slippedItem=slipped.sequence.tracks.flatMap((track)=>track.items).find((item)=>item.id==="clip-2")!;expect([slippedItem.sourceInUs,slippedItem.sourceOutUs]).toEqual([3*SECOND,11*SECOND]);const slid=slideItem(project,"clip-2",SECOND/2),slidItems=slid.sequence.tracks.find((track)=>track.name==="Main video")!.items;expect(slidItems.find((item)=>item.id==="clip-2")!.startUs).toBe(9.5*SECOND);expect(slidItems.find((item)=>item.id==="clip-1")!.durationUs).toBe(8.5*SECOND);expect(slidItems.find((item)=>item.id==="clip-3")!.startUs).toBe(17.5*SECOND);});
});
describe("multiple sequences and compound clips", () => {
  it("creates, switches, duplicates, and removes independent sequences", () => {
    const original = createProject("Sequences", presets[0]);
    const firstId = original.sequence.id;
    const added = addSequence(original);
    expect(added.sequences).toHaveLength(2);
    expect(added.activeSequenceId).toBe(added.sequence.id);
    const asset = { id: "second-asset", name: "second.mp4", path: "second.mp4", kind: "video" as const, durationUs: 2 * SECOND };
    const editedSecond = addAssetToTimeline({ ...added, assets: [asset] }, asset).project;
    const firstAgain = switchSequence(editedSecond, firstId);
    expect(durationOf(firstAgain)).toBe(0);
    const secondAgain = switchSequence(firstAgain, added.sequence.id);
    expect(durationOf(secondAgain)).toBe(2 * SECOND);
    const duplicated = duplicateActiveSequence(secondAgain);
    expect(duplicated.sequences).toHaveLength(3);
    expect(durationOf(duplicated)).toBe(2 * SECOND);
    const removed = removeActiveSequence(duplicated);
    expect(removed.sequences.filter((sequence) => !sequence.compound)).toHaveLength(2);
  });

  it("normalizes legacy single-sequence projects into the new collection", () => {
    const legacy = structuredClone(projectWithClip()) as unknown as Record<string, unknown>;
    delete legacy.sequences;
    delete legacy.activeSequenceId;
    const normalized = normalizeProject(legacy as unknown as OpenFrameProject);
    expect(normalized.sequences).toHaveLength(1);
    expect(normalized.activeSequenceId).toBe(normalized.sequence.id);
  });

  it("compounds selected clips and flattens nested media for preview/export", () => {
    const project = projectWithClip();
    project.assets.push({ id: "asset-1", name: "sample.mp4", path: "sample.mp4", kind: "video", durationUs: 12 * SECOND });
    const source = project.sequence.tracks.find((track) => track.name === "Main video")!.items[0];
    const audioTrack = project.sequence.tracks.find((track) => track.name === "Audio 1")!;
    const audio = { ...structuredClone(source), id: "compound-audio", assetId: "asset-1", trackId: audioTrack.id, kind: "audio" as const, name: "dialogue" };
    audioTrack.items.push(audio);
    const result = createCompoundClip(project, [source.id, audio.id]);
    expect(result.item?.compoundSequenceId).toBe(result.sequenceId);
    expect(result.project.sequences.find((sequence) => sequence.id === result.sequenceId)?.compound).toBe(true);
    expect(result.project.sequence.tracks.flatMap((track) => track.items)).toHaveLength(1);
    const flattened = flattenCompoundProject(result.project);
    expect(flattened.sequence.tracks.flatMap((track) => track.items).every((item) => !item.compoundSequenceId && item.assetId === "asset-1")).toBe(true);
    expect(activeVisualItemsAt(result.project, 2 * SECOND)).toHaveLength(1);
    expect(activeAudibleItemsAt(result.project, 2 * SECOND)).toHaveLength(2);
    const inside = switchSequence(result.project, result.sequenceId!);
    expect(inside.sequence.compound).toBe(true);
    expect(inside.sequence.tracks.flatMap((track) => track.items)).toHaveLength(2);
  });
});