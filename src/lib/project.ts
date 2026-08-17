import type { CaptionStyle, Easing, Keyframe, MediaAsset, MediaKind, OpenFrameProject, ProjectPreset, SpeedPoint, TimelineItem, Track, TrackKind, Sequence } from "../types/project";
import { createDesignDocument, normalizeDesign } from "./design";

export const SECOND = 1_000_000;

export const presets: ProjectPreset[] = [
  { name: "youtube", label: "YouTube", width: 1920, height: 1080, frameRate: { numerator: 30, denominator: 1 } },
  { name: "shorts", label: "Shorts / Reels", width: 1080, height: 1920, frameRate: { numerator: 30, denominator: 1 } },
  { name: "square", label: "Square post", width: 1080, height: 1080, frameRate: { numerator: 30, denominator: 1 } },
  { name: "portrait", label: "Portrait", width: 1080, height: 1350, frameRate: { numerator: 30, denominator: 1 } },
];

export const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function createSequence(name: string, preset: Pick<ProjectPreset, "width" | "height" | "frameRate">): Sequence {
  const makeTrack = (trackName: string, kind: TrackKind): Track => ({ id: id("track"), name: trackName, kind, locked: false, muted: false, visible: true, gain: 1, pan: 0, solo: false, items: [] });
  return {
    id: id("sequence"),
    name,
    width: preset.width,
    height: preset.height,
    frameRate: structuredClone(preset.frameRate),
    tracks: [makeTrack("Image overlays", "graphic"), makeTrack("Video overlay 1", "video"), makeTrack("Main video", "video"), makeTrack("Audio 1", "audio"), makeTrack("Audio 2", "audio")],
    captions: [],
    markers: [],
  };
}

export function createProject(name: string, preset: ProjectPreset): OpenFrameProject {
  const now = new Date().toISOString();
  const sequence = createSequence("Main sequence", preset);
  return {
    schemaVersion: 1,
    id: id("project"),
    name: name.trim() || "Untitled project",
    createdAt: now,
    modifiedAt: now,
    workspace: "video",
    assets: [],
    favoriteAssetIds: [],
    design: createDesignDocument(preset.width, preset.height),
    sequence,
    sequences: [sequence],
    activeSequenceId: sequence.id,
    settings: { previewQuality: "full", hardwareEncoder: "software" },
  };
}
export function durationOf(project: OpenFrameProject): number {
  return project.sequence.tracks.reduce((max, track) =>
    Math.max(max, ...track.items.map((item) => item.startUs + item.durationUs), 0), 0);
}

/**
 * Evaluates the item that should drive the program monitor at a sequence time.
 * Visual tracks win over audio tracks and earlier visual tracks are treated as
 * being above later tracks. A clip's end is exclusive so adjacent clips switch
 * without displaying the outgoing frame for an extra tick.
 */
export function activeItemAt(project: OpenFrameProject, positionUs: number): TimelineItem | undefined {
  project = flattenCompoundProject(project);
  const covers = (item: TimelineItem) =>
    item.startUs <= positionUs && positionUs < item.startUs + item.durationUs;

  for (const track of project.sequence.tracks) {
    if (!isVisualTrack(track.kind) || !track.visible) continue;
    const item = track.items.find((candidate) => candidate.kind !== "audio" && covers(candidate));
    if (item) return item;
  }

  for (const track of project.sequence.tracks) {
    if (track.kind !== "audio" || track.muted) continue;
    const item = track.items.find((candidate) => candidate.kind === "audio" && covers(candidate));
    if (item) return item;
  }

  return undefined;
}
export function addAssetToTimeline(
  project: OpenFrameProject,
  asset: MediaAsset,
  requestedStartUs?: number,
  requestedTrackId?: string,
): { project: OpenFrameProject; item: TimelineItem } {
  const trackKind: TrackKind = asset.kind === "audio" ? "audio" : asset.kind === "image" ? "graphic" : "video";
  let tracks = project.sequence.tracks.map((track) => ({ ...track, items: [...track.items] }));
  let target = tracks.find((track) => track.id === requestedTrackId && trackAcceptsAsset(track.kind, asset.kind) && !track.locked);
  if (!target && requestedTrackId === undefined) {
    if (asset.kind === "video") {
      target = tracks.find((track) => track.kind === "video" && track.name.toLowerCase() === "main video" && !track.locked)
        ?? [...tracks].reverse().find((track) => track.kind === "video" && !track.locked);
    } else {
      target = tracks.find((track) => track.kind === trackKind && !track.locked);
    }
  }

  if (!target) {
    const number = tracks.filter((track) => track.kind === trackKind).length + 1;
    target = {
      id: id("track"),
      name: `${trackKind === "audio" ? "Audio" : trackKind === "graphic" ? "Images" : "Video overlay"} ${number}`,
      kind: trackKind,
      locked: false,
      muted: false,
      visible: true,
      gain: 1,
      pan: 0,
      solo: false,
      items: [],
    };
    tracks = [...tracks, target];
  }

  const durationUs = Math.max(100_000, asset.durationUs || (asset.kind === "image" ? 5 * SECOND : 10 * SECOND));
  const startUs = Math.max(0, requestedStartUs ?? target.items.reduce((end, item) => Math.max(end, item.startUs + item.durationUs), 0));
  const item: TimelineItem = {
    id: id("item"),
    assetId: asset.id,
    trackId: target.id,
    name: asset.name,
    kind: asset.kind,
    startUs,
    durationUs,
    sourceInUs: 0,
    sourceOutUs: durationUs,
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
    mask: defaultMask(),
    keyframes: [],
    effects: [],
    transitionIn: defaultTransition(),
    transitionOut: defaultTransition(),
    speedPoints: [],
    chromaKey: defaultChromaKey(),
    autoBackground: defaultAutoBackground(),
    advancedColor: defaultAdvancedColor(),
    lutIntensity: 1,
    stabilization: defaultStabilization(),
    motionTracking: defaultMotionTracking(),
    linkedItemIds: [],
  };
  target.items.push(item);

  return {
    project: touch({ ...project, sequence: { ...project.sequence, tracks } }),
    item,
  };
}
export function addTrack(project: OpenFrameProject, kind: "video" | "audio" | "graphic"): OpenFrameProject {
  const number = project.sequence.tracks.filter((track) => track.kind === kind).length + 1;
  const track: Track = {
    id: id("track"),
    name: `${kind === "audio" ? "Audio" : kind === "graphic" ? "Images" : "Video overlay"} ${number}`,
    kind,
    locked: false,
    muted: false,
    visible: true,
    gain: 1,
    pan: 0,
    solo: false,
    items: [],
  };
  const tracks = kind === "audio" ? [...project.sequence.tracks, track] : [track, ...project.sequence.tracks];
  return touch({ ...project, sequence: { ...project.sequence, tracks } });
}

export function trackAcceptsAsset(trackKind: TrackKind, assetKind: MediaKind): boolean {
  if (trackKind === "audio") return assetKind === "audio";
  if (trackKind === "graphic") return assetKind === "image";
  return trackKind === "video" && assetKind !== "audio";
}

export function moveTrack(project: OpenFrameProject, trackId: string, direction: -1 | 1): OpenFrameProject {
  const tracks = [...project.sequence.tracks];
  const index = tracks.findIndex((track) => track.id === trackId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= tracks.length) return project;
  [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  return touch({ ...project, sequence: { ...project.sequence, tracks } });
}

export function removeTrack(project: OpenFrameProject, trackId: string): OpenFrameProject {
  if (project.sequence.tracks.length <= 1) return project;
  return touch({ ...project, sequence: { ...project.sequence, tracks: project.sequence.tracks.filter((track) => track.id !== trackId) } });
}

export function linkedSelection(project: OpenFrameProject, itemIds: string[]): string[] {
  const selected=new Set(itemIds); let changed=true;
  while(changed){changed=false;for(const item of project.sequence.tracks.flatMap((track)=>track.items)){if(selected.has(item.id)||item.linkedItemIds.some((id)=>selected.has(id))){if(!selected.has(item.id)){selected.add(item.id);changed=true;}for(const idValue of item.linkedItemIds)if(!selected.has(idValue)){selected.add(idValue);changed=true;}}}}
  return [...selected];
}

export function linkItems(project: OpenFrameProject, itemIds: string[]): OpenFrameProject {
  const ids=[...new Set(itemIds)]; if(ids.length<2)return project;
  return touch({...project,sequence:{...project.sequence,tracks:project.sequence.tracks.map((track)=>({...track,items:track.items.map((item)=>ids.includes(item.id)?{...item,linkedItemIds:ids.filter((value)=>value!==item.id)}:item)}))}});
}

export function unlinkItems(project: OpenFrameProject, itemIds: string[]): OpenFrameProject {
  const selected=new Set(linkedSelection(project,itemIds)); if(!selected.size)return project;
  return touch({...project,sequence:{...project.sequence,tracks:project.sequence.tracks.map((track)=>({...track,items:track.items.map((item)=>selected.has(item.id)?{...item,linkedItemIds:[]}:{...item,linkedItemIds:item.linkedItemIds.filter((idValue)=>!selected.has(idValue))})}))}});
}

export function splitItem(project: OpenFrameProject, itemId: string, playheadUs: number): OpenFrameProject {
  const ids=new Set(linkedSelection(project,[itemId])); const splittable=project.sequence.tracks.flatMap((track)=>track.items).filter((item)=>ids.has(item.id)&&playheadUs>item.startUs&&playheadUs<item.startUs+item.durationUs);
  if(!splittable.length)return project; const rightIds=new Map(splittable.map((item)=>[item.id,id("item")])); const leftIds=splittable.map((item)=>item.id),newRightIds=[...rightIds.values()];
  const tracks=project.sequence.tracks.map((track)=>({...track,items:track.locked?track.items:track.items.flatMap((item)=>{if(!rightIds.has(item.id))return[item];const [left,right]=splitOne(item,playheadUs,rightIds.get(item.id)!);return[{...left,linkedItemIds:leftIds.filter((value)=>value!==left.id)},{...right,linkedItemIds:newRightIds.filter((value)=>value!==right.id)}];})}));
  return touch({...project,sequence:{...project.sequence,tracks}});
}

function splitOne(item:TimelineItem,playheadUs:number,rightId:string):[TimelineItem,TimelineItem]{
  const offset=playheadUs-item.startUs,sourceOffset=Math.round(offset*item.playbackRate),splitSource=item.reversed?item.sourceOutUs-sourceOffset:item.sourceInUs+sourceOffset,boundary=keyframeAt(item,playheadUs);
  const leftFrames=[...item.keyframes.filter((frame)=>frame.timeUs<offset),{...boundary,id:id("keyframe"),timeUs:offset}],rightFrames=[{...boundary,id:id("keyframe"),timeUs:0},...item.keyframes.filter((frame)=>frame.timeUs>offset).map((frame)=>({...frame,timeUs:frame.timeUs-offset}))];
  return [{...item,durationUs:offset,sourceInUs:item.reversed?splitSource:item.sourceInUs,sourceOutUs:item.reversed?item.sourceOutUs:splitSource,fadeOutUs:0,transitionOut:defaultTransition(),keyframes:leftFrames},{...item,id:rightId,startUs:playheadUs,durationUs:item.durationUs-offset,sourceInUs:item.reversed?item.sourceInUs:splitSource,sourceOutUs:item.reversed?splitSource:item.sourceOutUs,fadeInUs:0,transitionIn:defaultTransition(),keyframes:rightFrames}];
}

export function trimItem(project: OpenFrameProject, itemId: string, edge: "start" | "end", deltaUs: number): OpenFrameProject {
  const ids=new Set(linkedSelection(project,[itemId]));let changed=false;
  const tracks=project.sequence.tracks.map((track)=>({...track,items:track.locked?track.items:track.items.map((item)=>{if(!ids.has(item.id))return item;changed=true;return trimOne(project,item,edge,deltaUs);})}));
  return changed?touch({...project,sequence:{...project.sequence,tracks}}):project;
}

function trimOne(project:OpenFrameProject,item:TimelineItem,edge:"start"|"end",deltaUs:number):TimelineItem{
  const minDuration=100_000;
  if(edge==="start"){
    const earliest=item.kind==="image"?-item.startUs:item.reversed?Math.max(-item.startUs,-((project.assets.find((value)=>value.id===item.assetId)?.durationUs??item.sourceOutUs)-item.sourceOutUs)/item.playbackRate):Math.max(-item.startUs,-item.sourceInUs/item.playbackRate);
    const applied=Math.max(earliest,Math.min(deltaUs,item.durationUs-minDuration)),sourceDelta=Math.round(applied*item.playbackRate),durationUs=item.durationUs-applied;
    return{...item,startUs:Math.max(0,item.startUs+applied),durationUs,sourceInUs:item.kind==="image"?item.sourceInUs:item.reversed?item.sourceInUs:item.sourceInUs+sourceDelta,sourceOutUs:item.kind==="image"?item.sourceOutUs:item.reversed?item.sourceOutUs-sourceDelta:item.sourceOutUs,fadeInUs:Math.min(item.fadeInUs,durationUs/2),fadeOutUs:Math.min(item.fadeOutUs,durationUs/2),transitionIn:{...item.transitionIn,durationUs:Math.min(item.transitionIn.durationUs,durationUs/2)},transitionOut:{...item.transitionOut,durationUs:Math.min(item.transitionOut.durationUs,durationUs/2)},keyframes:item.keyframes.map((frame)=>({...frame,timeUs:frame.timeUs-applied})).filter((frame)=>frame.timeUs>=0&&frame.timeUs<=durationUs)};
  }
  const asset=project.assets.find((value)=>value.id===item.assetId),available=item.kind==="image"?24*60*60*SECOND:item.reversed?item.sourceInUs/item.playbackRate:Math.max(0,((asset?.durationUs??item.sourceOutUs)-item.sourceOutUs)/item.playbackRate),applied=Math.max(-(item.durationUs-minDuration),Math.min(deltaUs,available)),sourceDelta=Math.round(applied*item.playbackRate),durationUs=item.durationUs+applied;
  return{...item,durationUs,sourceInUs:item.kind==="image"?item.sourceInUs:item.reversed?item.sourceInUs-sourceDelta:item.sourceInUs,sourceOutUs:item.kind==="image"?item.sourceOutUs:item.reversed?item.sourceOutUs:item.sourceOutUs+sourceDelta,fadeInUs:Math.min(item.fadeInUs,durationUs/2),fadeOutUs:Math.min(item.fadeOutUs,durationUs/2),transitionIn:{...item.transitionIn,durationUs:Math.min(item.transitionIn.durationUs,durationUs/2)},transitionOut:{...item.transitionOut,durationUs:Math.min(item.transitionOut.durationUs,durationUs/2)},keyframes:item.keyframes.filter((frame)=>frame.timeUs<=durationUs)};
}

export function rippleDeleteItems(project:OpenFrameProject,itemIds:string[]):OpenFrameProject{
  const selected=new Set(linkedSelection(project,itemIds));if(!selected.size)return project;
  const tracks=project.sequence.tracks.map((track)=>{if(track.locked)return track;const removed=track.items.filter((item)=>selected.has(item.id)).sort((a,b)=>a.startUs-b.startUs);if(!removed.length)return track;const ranges=mergeRanges(removed.map((item)=>[item.startUs,item.startUs+item.durationUs] as [number,number]));return{...track,items:track.items.filter((item)=>!selected.has(item.id)).map((item)=>({...item,startUs:Math.max(0,item.startUs-ranges.filter(([,end])=>item.startUs>=end).reduce((sum,[start,end])=>sum+end-start,0))}))};});
  return touch({...project,sequence:{...project.sequence,tracks}});
}

export function slipItem(project:OpenFrameProject,itemId:string,deltaUs:number):OpenFrameProject{
  const ids=new Set(linkedSelection(project,[itemId]));const tracks=project.sequence.tracks.map((track)=>({...track,items:track.locked?track.items:track.items.map((item)=>{if(!ids.has(item.id)||item.kind==="image")return item;const asset=project.assets.find((value)=>value.id===item.assetId),sourceDelta=Math.round(deltaUs*item.playbackRate),bounded=Math.max(-item.sourceInUs,Math.min(sourceDelta,(asset?.durationUs??item.sourceOutUs)-item.sourceOutUs));return{...item,sourceInUs:item.sourceInUs+bounded,sourceOutUs:item.sourceOutUs+bounded};})}));return touch({...project,sequence:{...project.sequence,tracks}});
}

export function rollEdit(project:OpenFrameProject,itemId:string,edge:"start"|"end",deltaUs:number):OpenFrameProject{
  const location=locateItem(project,itemId);if(!location||location.track.locked)return project;const ordered=[...location.track.items].sort((a,b)=>a.startUs-b.startUs),at=ordered.findIndex((item)=>item.id===itemId),neighbor=edge==="end"?ordered[at+1]:ordered[at-1];if(!neighbor)return project;
  const primary=trimOne(project,location.item,edge,deltaUs),actual=edge==="end"?primary.durationUs-location.item.durationUs:primary.startUs-location.item.startUs,other=trimOne(project,neighbor,edge==="end"?"start":"end",actual);
  return replaceItems(project,new Map([[primary.id,primary],[other.id,other]]));
}

export function slideItem(project:OpenFrameProject,itemId:string,deltaUs:number):OpenFrameProject{
  const location=locateItem(project,itemId);if(!location||location.track.locked)return project;const ordered=[...location.track.items].sort((a,b)=>a.startUs-b.startUs),at=ordered.findIndex((item)=>item.id===itemId),previous=ordered[at-1],next=ordered[at+1];if(!previous||!next)return project;
  const previousTrial=trimOne(project,previous,"end",deltaUs),nextTrial=trimOne(project,next,"start",deltaUs),previousApplied=previousTrial.durationUs-previous.durationUs,nextApplied=nextTrial.startUs-next.startUs,actual=deltaUs>=0?Math.min(deltaUs,previousApplied,nextApplied):Math.max(deltaUs,previousApplied,nextApplied),moved={...location.item,startUs:Math.max(0,location.item.startUs+actual)};
  return replaceItems(project,new Map([[previous.id,trimOne(project,previous,"end",actual)],[moved.id,moved],[next.id,trimOne(project,next,"start",actual)]]));
}

function locateItem(project:OpenFrameProject,itemId:string){for(const track of project.sequence.tracks){const item=track.items.find((value)=>value.id===itemId);if(item)return{track,item};}return undefined;}
function replaceItems(project:OpenFrameProject,replacements:Map<string,TimelineItem>){return touch({...project,sequence:{...project.sequence,tracks:project.sequence.tracks.map((track)=>({...track,items:track.items.map((item)=>replacements.get(item.id)??item)}))}});}
function mergeRanges(ranges:Array<[number,number]>){const merged:Array<[number,number]>=[];for(const range of ranges.sort((a,b)=>a[0]-b[0])){const last=merged[merged.length-1];if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}return merged;}
export function moveItem(project: OpenFrameProject, itemId: string, startUs: number, trackId?: string): OpenFrameProject {
  let moving: TimelineItem | undefined;
  const tracks = project.sequence.tracks.map((track) => ({
    ...track,
    items: track.items.filter((item) => {
      if (item.id === itemId) { moving = item; return false; }
      return true;
    }),
  }));
  if (!moving) return project;
  const targetId = trackId ?? moving.trackId;
  const target = tracks.find((track) => track.id === targetId && !track.locked && trackAcceptsAsset(track.kind, moving!.kind));
  if (!target) return project;
  target.items = [...target.items, { ...moving, startUs: Math.max(0, startUs), trackId: target.id }];
  return touch({ ...project, sequence: { ...project.sequence, tracks } });
}

export function deleteItem(project: OpenFrameProject, itemId: string): OpenFrameProject {
  return touch({ ...project, sequence: { ...project.sequence, tracks: project.sequence.tracks.map((track) => ({ ...track, items: track.items.filter((item) => item.id !== itemId) })) } });
}
export function deleteItems(project: OpenFrameProject, itemIds: string[]): OpenFrameProject {
  const selected = new Set(itemIds);
  if (!selected.size) return project;
  return touch({ ...project, sequence: { ...project.sequence, tracks: project.sequence.tracks.map((track) => ({ ...track, items: track.locked ? track.items : track.items.filter((item) => !selected.has(item.id)) })) } });
}

export function duplicateItems(project: OpenFrameProject, itemIds: string[], offsetUs = SECOND / 4): { project: OpenFrameProject; itemIds: string[] } {
  const selected=new Set(linkedSelection(project,itemIds)),idMap=new Map<string,string>();for(const idValue of selected)idMap.set(idValue,id("item"));const created:string[]=[];
  const tracks=project.sequence.tracks.map((track)=>({...track,items:track.locked?track.items:track.items.flatMap((item)=>{if(!selected.has(item.id))return[item];const copy={...structuredClone(item),id:idMap.get(item.id)!,name:item.name+" copy",startUs:item.startUs+offsetUs,linkedItemIds:item.linkedItemIds.filter((value)=>selected.has(value)).map((value)=>idMap.get(value)!)};created.push(copy.id);return[item,copy];})}));
  return{project:created.length?touch({...project,sequence:{...project.sequence,tracks}}):project,itemIds:created};
}
export function moveItems(project: OpenFrameProject, itemIds: string[], primaryId: string, primaryStartUs: number, targetTrackId?: string): OpenFrameProject {
  const selected = new Set(linkedSelection(project,itemIds.length ? itemIds : [primaryId]));
  const located = project.sequence.tracks.flatMap((track, trackIndex) => track.items.filter((item) => selected.has(item.id)).map((item) => ({ item, trackIndex })));
  const primary = located.find(({ item }) => item.id === primaryId); if (!primary) return project;
  const minimumStart = Math.min(...located.map(({ item }) => item.startUs));
  const deltaUs = Math.max(-minimumStart, primaryStartUs - primary.item.startUs);
  const primaryTargetIndex = targetTrackId ? project.sequence.tracks.findIndex((track) => track.id === targetTrackId) : primary.trackIndex;
  if (primaryTargetIndex < 0) return project;
  const tracks = project.sequence.tracks.map((track) => ({ ...track, items: track.items.filter((item) => !selected.has(item.id)) }));
  for (const entry of located) {
    const shiftedIndex = primaryTargetIndex + (entry.trackIndex - primary.trackIndex);
    const candidate = tracks[shiftedIndex];
    const destination = candidate && !candidate.locked && trackAcceptsAsset(candidate.kind, entry.item.kind) ? candidate : tracks[entry.trackIndex];
    if (!destination || destination.locked) { tracks[entry.trackIndex].items.push(entry.item); continue; }
    destination.items.push({ ...entry.item, startUs: Math.max(0, entry.item.startUs + deltaUs), trackId: destination.id });
  }
  return touch({ ...project, sequence: { ...project.sequence, tracks } });
}

export function syncProjectSequences(project: OpenFrameProject): OpenFrameProject {
  const current = project.sequence;
  const existing = project.sequences?.length ? project.sequences : [current];
  const sequences = existing.some((sequence) => sequence.id === current.id)
    ? existing.map((sequence) => sequence.id === current.id ? current : sequence)
    : [...existing, current];
  return { ...project, sequence: current, sequences, activeSequenceId: current.id };
}

export function touch(project: OpenFrameProject): OpenFrameProject {
  return { ...syncProjectSequences(project), modifiedAt: new Date().toISOString() };
}

export function switchSequence(project: OpenFrameProject, sequenceId: string): OpenFrameProject {
  const synced = syncProjectSequences(project);
  const target = synced.sequences.find((sequence) => sequence.id === sequenceId);
  return target ? touch({ ...synced, sequence: target, activeSequenceId: target.id }) : project;
}

export function addSequence(project: OpenFrameProject): OpenFrameProject {
  const synced = syncProjectSequences(project);
  const number = synced.sequences.filter((sequence) => !sequence.compound).length + 1;
  const sequence = createSequence(`Sequence ${number}`, synced.sequence);
  return touch({ ...synced, sequence, activeSequenceId: sequence.id, sequences: [...synced.sequences, sequence] });
}

export function duplicateActiveSequence(project: OpenFrameProject): OpenFrameProject {
  const synced = syncProjectSequences(project);
  const sequence = cloneSequence(synced.sequence, `${synced.sequence.name} copy`);
  sequence.compound = false;
  sequence.parentSequenceId = undefined;
  return touch({ ...synced, sequence, activeSequenceId: sequence.id, sequences: [...synced.sequences, sequence] });
}

export function renameActiveSequence(project: OpenFrameProject, name: string): OpenFrameProject {
  const trimmed = name.trim().slice(0, 60);
  return trimmed ? touch({ ...project, sequence: { ...project.sequence, name: trimmed } }) : project;
}

export function removeActiveSequence(project: OpenFrameProject): OpenFrameProject {
  const synced = syncProjectSequences(project);
  if (synced.sequence.compound || synced.sequences.filter((sequence) => !sequence.compound).length <= 1) return project;
  const sequences = synced.sequences.filter((sequence) => sequence.id !== synced.sequence.id);
  const target = sequences.find((sequence) => !sequence.compound) ?? sequences[0];
  return target ? touch({ ...synced, sequence: target, activeSequenceId: target.id, sequences }) : project;
}

function cloneSequence(sequence: Sequence, name: string): Sequence {
  const trackIds = new Map(sequence.tracks.map((track) => [track.id, id("track")]));
  const itemIds = new Map(sequence.tracks.flatMap((track) => track.items.map((item) => [item.id, id("item")] as const)));
  return {
    ...structuredClone(sequence),
    id: id("sequence"),
    name,
    tracks: sequence.tracks.map((track) => ({ ...structuredClone(track), id: trackIds.get(track.id)!, items: track.items.map((item) => ({ ...structuredClone(item), id: itemIds.get(item.id)!, trackId: trackIds.get(track.id)!, linkedItemIds: item.linkedItemIds.flatMap((linked) => itemIds.get(linked) ?? []) })) })),
    captions: sequence.captions.map((caption) => ({ ...structuredClone(caption), id: id("caption") })),
    markers: sequence.markers.map((marker) => ({ ...structuredClone(marker), id: id("marker") })),
  };
}

export function createCompoundClip(project: OpenFrameProject, itemIds: string[]): { project: OpenFrameProject; item?: TimelineItem; sequenceId?: string } {
  const synced = syncProjectSequences(project);
  const selected = new Set(linkedSelection(synced, itemIds));
  const located = synced.sequence.tracks.flatMap((track, trackIndex) => track.items.filter((item) => selected.has(item.id) && !track.locked).map((item) => ({ item, track, trackIndex })));
  if (!located.length) return { project };
  const startUs = Math.min(...located.map(({ item }) => item.startUs));
  const endUs = Math.max(...located.map(({ item }) => item.startUs + item.durationUs));
  const durationUs = Math.max(100_000, endUs - startUs);
  const compoundId = id("sequence");
  const nestedTracks = synced.sequence.tracks.flatMap((track) => {
    const items = track.items.filter((item) => selected.has(item.id)).map((item) => ({ ...structuredClone(item), startUs: item.startUs - startUs }));
    return items.length ? [{ ...structuredClone(track), id: id("track"), items: items.map((item) => ({ ...item, trackId: "" })) }] : [];
  }).map((track) => ({ ...track, items: track.items.map((item) => ({ ...item, trackId: track.id })) }));
  const compoundSequence: Sequence = { id: compoundId, name: `Compound ${synced.sequences.filter((sequence) => sequence.compound).length + 1}`, width: synced.sequence.width, height: synced.sequence.height, frameRate: structuredClone(synced.sequence.frameRate), tracks: nestedTracks, captions: [], markers: [], compound: true, parentSequenceId: synced.sequence.id };
  const visual = located.find(({ item }) => item.kind === "video") ?? located.find(({ item }) => item.kind === "image");
  const primary = visual ?? located[0];
  const kind: MediaKind = visual?.item.kind ?? "audio";
  const compoundItem: TimelineItem = { ...structuredClone(primary.item), id: id("item"), assetId: "", trackId: primary.track.id, name: compoundSequence.name, kind, startUs, durationUs, sourceInUs: 0, sourceOutUs: durationUs, volume: 1, opacity: 1, positionX: 0, positionY: 0, scale: 1, rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, flipHorizontal: false, flipVertical: false, brightness: 0, contrast: 1, saturation: 1, fadeInUs: 0, fadeOutUs: 0, playbackRate: 1, reversed: false, freezeFrameUs: undefined, blendMode: "normal", mask: defaultMask(), keyframes: [], effects: [], transitionIn: defaultTransition(), transitionOut: defaultTransition(), speedPoints: [], chromaKey: defaultChromaKey(), autoBackground: defaultAutoBackground(), advancedColor: defaultAdvancedColor(), lutPath: undefined, lutIntensity: 1, stabilization: defaultStabilization(), motionTracking: defaultMotionTracking(), linkedItemIds: [], compoundSequenceId: compoundId };
  const tracks = synced.sequence.tracks.map((track) => ({ ...track, items: [...track.items.filter((item) => !selected.has(item.id)), ...(track.id === primary.track.id ? [compoundItem] : [])] }));
  const next = touch({ ...synced, sequence: { ...synced.sequence, tracks }, sequences: [...synced.sequences, compoundSequence] });
  return { project: next, item: compoundItem, sequenceId: compoundId };
}

export function flattenCompoundProject(project: OpenFrameProject): OpenFrameProject {
  const synced = syncProjectSequences(project);
  const flattenSequence = (sequence: Sequence, visiting: Set<string>): Sequence => {
    if (visiting.has(sequence.id)) return { ...sequence, tracks: sequence.tracks.map((track) => ({ ...track, items: track.items.filter((item) => !item.compoundSequenceId) })) };
    const nextVisiting = new Set(visiting).add(sequence.id);
    const tracks = sequence.tracks.flatMap((outerTrack) => {
      const base: Track = { ...outerTrack, items: outerTrack.items.filter((item) => !item.compoundSequenceId) };
      const expanded = outerTrack.items.flatMap((compound) => {
        if (!compound.compoundSequenceId) return [];
        const nested = synced.sequences.find((candidate) => candidate.id === compound.compoundSequenceId);
        if (!nested) return [];
        const flat = flattenSequence(nested, nextVisiting);
        const windowStart = compound.sourceInUs;
        const windowEnd = windowStart + compound.durationUs * compound.playbackRate;
        return flat.tracks.flatMap((track) => {
          const mapped = track.items.flatMap((item) => {
            const overlapStart = Math.max(item.startUs, windowStart);
            const overlapEnd = Math.min(item.startUs + item.durationUs, windowEnd);
            if (overlapEnd <= overlapStart) return [];
            const leftTrim = overlapStart - item.startUs;
            const durationUs = Math.max(1, Math.round((overlapEnd - overlapStart) / compound.playbackRate));
            const sourceShift = Math.round(leftTrim * item.playbackRate);
            return [{ ...structuredClone(item), id: `flat_${compound.id}_${item.id}`, trackId: `flat_${compound.id}_${track.id}`, startUs: compound.startUs + Math.round((overlapStart - windowStart) / compound.playbackRate), durationUs, sourceInUs: item.reversed ? item.sourceInUs : item.sourceInUs + sourceShift, sourceOutUs: item.reversed ? item.sourceOutUs - sourceShift : item.sourceInUs + sourceShift + Math.round((overlapEnd - overlapStart) * item.playbackRate), playbackRate: item.playbackRate * compound.playbackRate, volume: item.volume * compound.volume, opacity: item.opacity * compound.opacity, linkedItemIds: [], compoundSequenceId: undefined }];
          });
          return mapped.length ? [{ ...structuredClone(track), id: `flat_${compound.id}_${track.id}`, name: `${compound.name} / ${track.name}`, gain: track.gain * outerTrack.gain, pan: Math.max(-1, Math.min(1, track.pan + outerTrack.pan)), solo: track.solo || outerTrack.solo, muted: track.muted || outerTrack.muted, visible: track.visible && outerTrack.visible, items: mapped }] : [];
        });
      });
      return [...expanded, ...(base.items.length ? [base] : [])];
    });
    return { ...sequence, tracks };
  };
  return { ...synced, sequence: flattenSequence(synced.sequence, new Set()) };
}

function mapItem(project: OpenFrameProject, itemId: string, mapper: (item: TimelineItem) => TimelineItem[]): OpenFrameProject {
  let changed = false;
  const tracks = project.sequence.tracks.map((track) => ({
    ...track,
    items: track.items.flatMap((item) => {
      if (item.id !== itemId || track.locked) return [item];
      changed = true;
      return mapper(item);
    }),
  }));
  return changed ? touch({ ...project, sequence: { ...project.sequence, tracks } }) : project;
}

function normalizeSequence(sequence: Sequence): Sequence {
  const sourceTracks = sequence.compound ? sequence.tracks : ensureFunctionalTracks(sequence.tracks);
  return {
    ...sequence,
    compound: sequence.compound === true,
    parentSequenceId: sequence.parentSequenceId || undefined,
    markers: sequence.markers ?? [],
    captions: (sequence.captions ?? []).map((caption) => ({ ...caption, words: caption.words ?? [], style: { ...defaultCaptionStyle(), ...(caption.style ?? {}) } })),
    tracks: sourceTracks.map((track) => ({
      ...track,
      gain: finiteOr(track.gain, 1),
      pan: finiteOr(track.pan, 0),
      solo: track.solo === true,
      items: track.items.map((item) => ({
        ...item,
        positionX: finiteOr(item.positionX, 0),
        positionY: finiteOr(item.positionY, 0),
        scale: finiteOr(item.scale, 1),
        rotation: finiteOr(item.rotation, 0),
        crop: { ...(item.crop ?? { x: 0, y: 0, width: 1, height: 1 }) },
        flipHorizontal: item.flipHorizontal === true,
        flipVertical: item.flipVertical === true,
        brightness: finiteOr(item.brightness, 0),
        contrast: finiteOr(item.contrast, 1),
        saturation: finiteOr(item.saturation, 1),
        fadeInUs: finiteOr(item.fadeInUs, 0),
        fadeOutUs: finiteOr(item.fadeOutUs, 0),
        playbackRate: finiteOr(item.playbackRate, 1),
        reversed: item.reversed === true,
        freezeFrameUs: Number.isFinite(item.freezeFrameUs) ? item.freezeFrameUs : undefined,
        blendMode: item.blendMode ?? "normal",
        mask: { ...defaultMask(), ...(item.mask ?? {}) },
        keyframes: (item.keyframes ?? []).map(normalizeKeyframe).sort((a, b) => a.timeUs - b.timeUs),
        effects: item.effects ?? [],
        transitionIn: { ...defaultTransition(), ...(item.transitionIn ?? {}) },
        transitionOut: { ...defaultTransition(), ...(item.transitionOut ?? {}) },
        speedPoints: (item.speedPoints ?? []).map(normalizeSpeedPoint).sort((a, b) => a.timeUs - b.timeUs),
        chromaKey: { ...defaultChromaKey(), ...(item.chromaKey ?? {}) },
        autoBackground: { ...defaultAutoBackground(), ...(item.autoBackground ?? {}) },
        advancedColor: { ...defaultAdvancedColor(), ...(item.advancedColor ?? {}) },
        lutPath: item.lutPath || undefined,
        lutIntensity: finiteOr(item.lutIntensity, 1),
        stabilization: { ...defaultStabilization(), ...(item.stabilization ?? {}) },
        motionTracking: { ...defaultMotionTracking(), ...(item.motionTracking ?? {}), points: item.motionTracking?.points ?? [] },
        linkedItemIds: item.linkedItemIds ?? [],
        compoundSequenceId: item.compoundSequenceId || undefined,
      })),
    })),
  };
}

export function normalizeProject(project: OpenFrameProject): OpenFrameProject {
  const rawSequences = project.sequences?.length ? project.sequences : [project.sequence];
  const synchronized = rawSequences.some((sequence) => sequence.id === project.sequence.id)
    ? rawSequences.map((sequence) => sequence.id === project.sequence.id ? project.sequence : sequence)
    : [...rawSequences, project.sequence];
  const sequences = synchronized.map(normalizeSequence);
  const activeSequenceId = project.activeSequenceId ?? project.sequence.id;
  const sequence = sequences.find((candidate) => candidate.id === activeSequenceId) ?? sequences.find((candidate) => candidate.id === project.sequence.id) ?? sequences[0];
  return {
    ...project,
    workspace: project.workspace ?? "video",
    favoriteAssetIds: project.favoriteAssetIds ?? project.assets.filter((asset) => asset.favorite).map((asset) => asset.id),
    design: normalizeDesign(project.design, sequence.width, sequence.height),
    settings: project.settings ?? { previewQuality: "full", hardwareEncoder: "software" },
    sequence,
    sequences: sequences.map((candidate) => candidate.id === sequence.id ? sequence : candidate),
    activeSequenceId: sequence.id,
  };
}
function ensureFunctionalTracks(tracks: Track[]): Track[] {
  const next = [...tracks];
  const make = (name: string, kind: TrackKind): Track => ({ id: id("track"), name, kind, locked: false, muted: false, visible: true, gain: 1, pan: 0, solo: false, items: [] });
  if (!next.some((track) => track.kind === "video")) next.unshift(make("Main video", "video"));
  if (next.filter((track) => track.kind === "video").length < 2) next.unshift(make("Video overlay 1", "video"));
  if (!next.some((track) => track.kind === "graphic")) next.unshift(make("Image overlays", "graphic"));
  while (next.filter((track) => track.kind === "audio").length < 2) {
    next.push(make("Audio " + (next.filter((track) => track.kind === "audio").length + 1), "audio"));
  }
  return next;
}
export function activeVisualItemsAt(project: OpenFrameProject, positionUs: number): TimelineItem[] {
  project = flattenCompoundProject(project);
  const covers = (item: TimelineItem) => item.startUs <= positionUs && positionUs < item.startUs + item.durationUs;
  return project.sequence.tracks
    .filter((track) => isVisualTrack(track.kind) && track.visible)
    .flatMap((track, trackIndex) => track.items.filter((item) => item.kind !== "audio" && covers(item)).map((item) => ({ item, trackIndex })))
    .sort((a, b) => b.trackIndex - a.trackIndex)
    .map(({ item }) => item);
}

export function activeAudibleItemsAt(project: OpenFrameProject, positionUs: number): TimelineItem[] {
  project = flattenCompoundProject(project);
  const covers=(item:TimelineItem)=>item.startUs<=positionUs&&positionUs<item.startUs+item.durationUs,solo=project.sequence.tracks.some((track)=>track.solo&&!track.muted&&track.kind!=="graphic");
  return project.sequence.tracks.filter((track)=>!track.muted&&(!solo||track.solo)).flatMap((track)=>track.items.filter((item)=>item.kind!=="image"&&covers(item)));
}

function isVisualTrack(kind: TrackKind): boolean {
  return kind === "video" || kind === "graphic";
}

export function evaluateTimelineItem(item: TimelineItem, positionUs: number): TimelineItem {
  if (!item.keyframes.length) return item;
  const localUs = Math.max(0, Math.min(item.durationUs, positionUs - item.startUs));
  const frames = item.keyframes;
  const nextIndex = frames.findIndex((frame) => frame.timeUs >= localUs);
  if (nextIndex < 0) return { ...item, ...animatedValues(frames[frames.length - 1]) };
  const next = frames[nextIndex];
  if (nextIndex === 0) {
    if (next.timeUs <= 0) return { ...item, ...animatedValues(next) };
    return interpolateItem(item, next, ease(localUs / next.timeUs, next.easing));
  }
  const previous = frames[nextIndex - 1];
  const span = Math.max(1, next.timeUs - previous.timeUs);
  return interpolateItem(previous, next, ease((localUs - previous.timeUs) / span, next.easing), item);
}

export function sourceTimeAt(item: TimelineItem, positionUs: number): number {
  if (item.freezeFrameUs !== undefined) return item.freezeFrameUs;
  const localUs = Math.max(0, Math.min(item.durationUs, positionUs - item.startUs));
  const advanced = sourceDistanceAt(item, localUs);
  return item.reversed ? Math.max(item.sourceInUs, item.sourceOutUs - advanced) : Math.min(item.sourceOutUs, item.sourceInUs + advanced);
}

export function keyframeAt(item: TimelineItem, positionUs: number): Keyframe {
  const evaluated = evaluateTimelineItem(item, positionUs);
  return {
    id: id("keyframe"),
    timeUs: Math.max(0, Math.min(item.durationUs, positionUs - item.startUs)),
    easing: "ease-in-out",
    ...animatedValues(evaluated),
  };
}

function interpolateItem(from: TimelineItem | Keyframe, to: Keyframe, progress: number, base?: TimelineItem): TimelineItem {
  const target = (base ?? from) as TimelineItem;
  return { ...target,
    positionX: lerp(from.positionX, to.positionX, progress), positionY: lerp(from.positionY, to.positionY, progress),
    scale: lerp(from.scale, to.scale, progress), rotation: lerp(from.rotation, to.rotation, progress),
    opacity: lerp(from.opacity, to.opacity, progress), brightness: lerp(from.brightness, to.brightness, progress),
    contrast: lerp(from.contrast, to.contrast, progress), saturation: lerp(from.saturation, to.saturation, progress),
  };
}
function animatedValues(value: TimelineItem | Keyframe) {
  return { positionX: value.positionX, positionY: value.positionY, scale: value.scale, rotation: value.rotation, opacity: value.opacity, brightness: value.brightness, contrast: value.contrast, saturation: value.saturation };
}
function normalizeKeyframe(frame: Keyframe): Keyframe { return { ...frame, timeUs: finiteOr(frame.timeUs, 0), easing: frame.easing ?? "linear", ...animatedValues({ ...frame, positionX: finiteOr(frame.positionX, 0), positionY: finiteOr(frame.positionY, 0), scale: finiteOr(frame.scale, 1), rotation: finiteOr(frame.rotation, 0), opacity: finiteOr(frame.opacity, 1), brightness: finiteOr(frame.brightness, 0), contrast: finiteOr(frame.contrast, 1), saturation: finiteOr(frame.saturation, 1) } as Keyframe) }; }
export function speedAt(item: TimelineItem, localUs: number): number {
  const points = normalizedSpeedPoints(item);
  const nextIndex = points.findIndex((point) => point.timeUs >= localUs);
  if (nextIndex < 0) return points.at(-1)?.rate ?? item.playbackRate;
  if (nextIndex === 0) return interpolateRate(item.playbackRate, points[0], localUs / Math.max(1, points[0].timeUs));
  const previous = points[nextIndex - 1], next = points[nextIndex];
  return interpolateRate(previous.rate, next, (localUs - previous.timeUs) / Math.max(1, next.timeUs - previous.timeUs));
}

export function sourceDistanceAt(item: TimelineItem, localUs: number): number {
  if (!item.speedPoints.length) return localUs * item.playbackRate;
  const steps = Math.max(1, Math.ceil(localUs / 50_000));
  const stepUs = localUs / steps;
  let distance = 0;
  for (let index = 0; index < steps; index += 1) {
    const midpoint = (index + .5) * stepUs;
    distance += stepUs * speedAt(item, midpoint);
  }
  return distance;
}

export function defaultCaptionStyle(): CaptionStyle { return { fontFamily: "Arial", fontSize: 54, fontWeight: 700, color: "#ffffff", strokeColor: "#000000", strokeWidth: 3, backgroundColor: "#000000", backgroundOpacity: .55, shadow: true, alignment: "center", positionY: .82, wordHighlightColor: "#b9f75a" }; }
function normalizedSpeedPoints(item: TimelineItem) { return item.speedPoints.filter((point) => point.timeUs >= 0 && point.timeUs <= item.durationUs).sort((a, b) => a.timeUs - b.timeUs); }
function interpolateRate(from: number, next: SpeedPoint, progress: number) { return lerp(from, next.rate, ease(progress, next.easing)); }
function normalizeSpeedPoint(point: SpeedPoint): SpeedPoint { return { ...point, timeUs: finiteOr(point.timeUs, 0), rate: finiteOr(point.rate, 1), easing: point.easing ?? "linear" }; }
function defaultChromaKey() { return { enabled: false, keyColor: "#00ff00", tolerance: .25, softness: .08, spill: .35, opacity: 1, showMask: false, inverted: false }; }
function defaultAutoBackground() { return { enabled: false, sampledColor: "#00ff00", refinement: .3, temporalSmoothing: .5, mode: "fast-local" as const }; }
function defaultAdvancedColor() { return { exposure: 0, vibrance: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, fade: 0 }; }
function defaultStabilization() { return { enabled: false, strength: .5, smoothing: 15, zoom: 0 }; }
function defaultMotionTracking() { return { regionX: .5, regionY: .5, regionWidth: .2, regionHeight: .2, points: [], analyzed: false }; }
function defaultMask() { return { type: "none" as const, x: 0, y: 0, width: 1, height: 1, feather: 0, inverted: false }; }
function defaultTransition() { return { type: "none" as const, durationUs: 0 }; }
function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress; }
function ease(progress: number, easing: Easing) { const t = Math.max(0, Math.min(1, progress)); if (easing === "ease-in") return t * t; if (easing === "ease-out") return 1 - (1 - t) * (1 - t); if (easing === "ease-in-out") return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; return t; }
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function formatTime(us: number, fps = 30): string {
  const totalFrames = Math.max(0, Math.round((us / SECOND) * fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, "0")).join(":");
}

