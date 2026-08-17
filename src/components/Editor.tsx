import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Eye, Film, FolderOpen,
  Image as ImageIcon, Layers3, Link2, Lock, MapPin, Menu, Mic2, MousePointer2, Music2, Pause, Play,
  Palette, Plus, Redo2, Save, Scissors, Search, Settings2, SkipBack, SkipForward, Sparkles,
  Split, Text, Trash2, Undo2, Unlink, Unlock, Upload, Volume2, VolumeX, WandSparkles, ZoomIn, ZoomOut,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEditor } from "../store/editor-store";
import { analyzeAudio, assetPreviewUrl, browserFilesToAssets, exportProject, exportProjectWithPlugin, pickAndProbeMedia, saveProject, saveVoiceRecording, writeAppLog } from "../lib/native";
import { pluginSnapshot, subscribePlugins } from "../lib/plugins";
import { activeDesignPage, createDesignObject, normalizeDesign, updateDesignPage } from "../lib/design";
import { activeAudibleItemsAt, activeItemAt, activeVisualItemsAt, addAssetToTimeline, addSequence, addTrack, createCompoundClip, deleteItems, duplicateActiveSequence, duplicateItems, durationOf, evaluateTimelineItem, formatTime, id, keyframeAt, linkItems, moveItem, moveItems, moveTrack, removeActiveSequence, removeTrack, renameActiveSequence, rippleDeleteItems, rollEdit, SECOND, slideItem, slipItem, sourceTimeAt, speedAt, splitItem, switchSequence, touch, trackAcceptsAsset, trimItem, unlinkItems } from "../lib/project";
import type { EffectType, Easing, MediaAsset, OpenFrameProject, TimelineItem, TimelineMarker, Track } from "../types/project";
import type { AudioAnalysis } from "../lib/native";
import { Logo } from "./Logo";
import { AdvancedToolPanel } from "./AdvancedToolPanel";
import { ModelCenter } from "./ModelCenter";
import { EcosystemCenter } from "./EcosystemCenter";

const PIXELS_PER_SECOND = 72;
const DEFAULT_DURATION = 20 * SECOND;
type TimelineTool = "select" | "roll" | "slip" | "slide";

export function Editor({ onHome }: { onHome: () => void }) {
  const { present: project, past, future, commit, open, dispatch } = useEditor();
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [playheadUs, setPlayheadUs] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image" | "audio">("all");
  const [mediaQuery, setMediaQuery] = useState("");
  const [status, setStatus] = useState("Ready");
  const [activeTool, setActiveTool] = useState("media");
  const [snapping, setSnapping] = useState(true);
  const [timelineTool, setTimelineTool] = useState<TimelineTool>("select");
  const [mixerOpen, setMixerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedUs, setRecordingElapsedUs] = useState(0);
  const [audioAnalyses, setAudioAnalyses] = useState<Record<string, AudioAnalysis>>({});
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "view">();
  const [modelsOpen, setModelsOpen] = useState(false);
  const [ecosystemOpen, setEcosystemOpen] = useState(false);
  const [, refreshPlugins] = useState(0);
  useEffect(() => subscribePlugins(() => refreshPlugins((value) => value + 1)), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackLabelsRef = useRef<HTMLDivElement>(null);
  const analysisRequested = useRef(new Set<string>());
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const recordingStreamRef = useRef<MediaStream | undefined>(undefined);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartUsRef = useRef(0);
  const projectRef = useRef<OpenFrameProject | null>(project);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { if (!recording) return; const started = performance.now(); const timer = window.setInterval(() => setRecordingElapsedUs(Math.round((performance.now() - started) * 1000)), 100); return () => window.clearInterval(timer); }, [recording]);

  useEffect(() => {
    if (!project || !isTauri()) return;
    for (const asset of project.assets.filter((value)=>value.kind!=="image")) {
      if (analysisRequested.current.has(asset.id)) continue; analysisRequested.current.add(asset.id);
      void analyzeAudio(asset.path,160).then((analysis)=>setAudioAnalyses((current)=>({...current,[asset.id]:analysis}))).catch(()=>analysisRequested.current.delete(asset.id));
    }
  }, [project?.assets]);
  const selectedItem = useMemo(() => project?.sequence.tracks.flatMap((track) => track.items).find((item) => item.id === selectedItemId), [project, selectedItemId]);

  const selectedLibraryAsset = project?.assets.find((asset) => asset.id === selectedAssetId);
  const sequenceDuration = project ? durationOf(project) : 0;
  const projectDuration = Math.max(sequenceDuration, DEFAULT_DURATION);
  const previewItem = useMemo(() => project ? activeItemAt(project, playheadUs) : undefined, [project, playheadUs]);
  const visualItems = useMemo(() => project ? activeVisualItemsAt(project, playheadUs) : [], [project, playheadUs]);
  const audibleItems = useMemo(() => project ? activeAudibleItemsAt(project, playheadUs) : [], [project, playheadUs]);
  const previewAsset = project?.assets.find((asset) => asset.id === previewItem?.assetId);
  const activeCaption = project?.sequence.captions.find((caption) => playheadUs >= caption.startUs && playheadUs < caption.endUs);

  const commitProject = useCallback((next: OpenFrameProject) => commit(next), [commit]);

  const saveCurrent = useCallback(async (saveAs = false) => {
    if (!project) return;
    setStatus("Saving…");
    try { const saved = await saveProject(project, saveAs); if (saved) { open(saved); setStatus("Saved locally"); } else setStatus("Save cancelled"); }
    catch (error) { setStatus(`Save failed: ${message(error)}`); }
  }, [project, open]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("input, textarea")) return;
      if (event.code === "Space") { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key === "Delete" && selectedItemId && project) { commitProject(deleteItems(project, selectedItemIds.length ? selectedItemIds : [selectedItemId])); setSelectedItemId(undefined); setSelectedItemIds([]); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveCurrent(event.shiftKey); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedItemId && project) { event.preventDefault(); duplicateSelected(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "redo" }); }
      if (event.key.toLowerCase() === "s" && selectedItemId && project) commitProject(splitItem(project, selectedItemId, playheadUs));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItemId, selectedItemIds, project, playheadUs, dispatch, commitProject, saveCurrent]);

  useEffect(() => {
    if (!playing) return;
    if (sequenceDuration <= 0) { setPlaying(false); return; }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) * 1000;
      last = now;
      setPlayheadUs((current) => {
        const next = current + delta;
        if (next >= sequenceDuration) {
          setPlaying(false);
          return sequenceDuration;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, sequenceDuration]);

  useEffect(() => {
    const media = previewRef.current;
    if (!media || !previewAsset || previewAsset.kind === "image") return;
    const item = previewItem;
    if (item && playheadUs >= item.startUs && playheadUs <= item.startUs + item.durationUs) {
      const target = sourceTimeAt(item, playheadUs) / SECOND;
      if (Math.abs(media.currentTime - target) > 0.15) media.currentTime = target;
    }
    const localUs = item ? Math.max(0, playheadUs - item.startUs) : 0;
    const remainingUs = item ? Math.max(0, item.durationUs - localUs) : 0;
    const fadeInGain = item?.fadeInUs ? Math.min(1, localUs / item.fadeInUs) : 1;
    const fadeOutGain = item?.fadeOutUs ? Math.min(1, remainingUs / item.fadeOutUs) : 1;
    media.volume = clamp((item?.volume ?? 1) * Math.min(fadeInGain, fadeOutGain), 0, 1);
    media.playbackRate = item ? speedAt(item, Math.max(0, playheadUs - item.startUs)) : 1;
    if (playing && item?.freezeFrameUs === undefined) void media.play().catch(() => undefined); else media.pause();
  }, [playing, playheadUs, previewAsset, previewItem]);

  if (!project) return null;

  async function toggleVoiceRecording() {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setStatus("Microphone recording is unavailable in this environment"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder; recordingStreamRef.current = stream; recordingChunksRef.current = []; recordingStartUsRef.current = playheadUs;
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => { setStatus("Voice-over recording failed"); setRecording(false); stream.getTracks().forEach((track) => track.stop()); };
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current; recordingChunksRef.current = []; recorderRef.current = undefined; recordingStreamRef.current = undefined; stream.getTracks().forEach((track) => track.stop()); setRecording(false); setPlaying(false);
        if (chunks.length) void persistVoiceRecording(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })); else setStatus("No microphone audio was captured");
      };
      recorder.start(250); setRecordingElapsedUs(0); setRecording(true); if (sequenceDuration > playheadUs) setPlaying(true); setStatus("Recording voice-over — click the microphone again to stop");
    } catch (error) { setStatus(`Microphone permission or recording failed: ${message(error)}`); recordingStreamRef.current?.getTracks().forEach((track) => track.stop()); }
  }

  async function persistVoiceRecording(blob: Blob) {
    if (blob.size < 32) { setStatus("The voice-over recording was empty"); return; }
    setStatus("Saving voice-over locally…");
    try {
      const asset = await saveVoiceRecording(blob);
      const current = projectRef.current;
      if (!current) return;
      let next = touch({ ...current, assets: [...current.assets, asset] });
      let track = next.sequence.tracks.find((candidate) => candidate.kind === "audio" && candidate.name.toLowerCase().includes("voice over") && !candidate.locked);
      if (!track) {
        next = addTrack(next, "audio");
        track = [...next.sequence.tracks].reverse().find((candidate) => candidate.kind === "audio" && !candidate.locked);
        if (track) next = touch({ ...next, sequence: { ...next.sequence, tracks: next.sequence.tracks.map((candidate) => candidate.id === track!.id ? { ...candidate, name: "Voice over" } : candidate) } });
      }
      const result = addAssetToTimeline(next, asset, recordingStartUsRef.current, track?.id);
      commitProject(result.project); setSelectedAssetId(asset.id); setSelectedItemId(result.item.id); setSelectedItemIds([result.item.id]); setPlayheadUs(result.item.startUs + result.item.durationUs); setAudioAnalyses((currentAnalyses) => ({ ...currentAnalyses, [asset.id]: { peaks: [], beatsUs: [] } }));
      setStatus(`Voice-over added to ${result.project.sequence.tracks.find((candidate) => candidate.id === result.item.trackId)?.name ?? "audio track"}`);
    } catch (error) { setStatus(`Could not save voice-over: ${message(error)}`); }
  }

  function activateSequence(sequenceId: string) {
    if (recording) { setStatus("Stop voice-over recording before changing sequences"); return; }
    commitProject(switchSequence(project!, sequenceId)); setPlayheadUs(0); setPlaying(false); setSelectedItemId(undefined); setSelectedItemIds([]); setStatus("Sequence opened");
  }
  function makeOrOpenCompound() {
    if (selectedItem?.compoundSequenceId) { activateSequence(selectedItem.compoundSequenceId); return; }
    if (!selectedItemId) { setStatus("Select one or more clips to create a compound clip"); return; }
    const result = createCompoundClip(project!, selectedItemIds.length ? selectedItemIds : [selectedItemId]);
    if (!result.item) { setStatus("The selected clips could not be compounded"); return; }
    commitProject(result.project); setSelectedItemId(result.item.id); setSelectedItemIds([result.item.id]); setStatus(`Created ${result.item.name}; double-click it or use Open compound to edit inside`);
  }
  async function importDesktop() {
    try { const assets = await pickAndProbeMedia(); addAssets(assets); }
    catch (error) { setStatus(`Import failed: ${message(error)}`); }
  }
  async function importBrowser(files: File[]) { try { addAssets(await browserFilesToAssets(files)); } catch (error) { setStatus(`Import failed: ${message(error)}`); } }
  function addAssets(assets: MediaAsset[]) {
    if (!assets.length) return;
    commitProject(touch({ ...project!, assets: [...project!.assets, ...assets] }));
    setSelectedAssetId(assets[0].id); setStatus(`Imported ${assets.length} file${assets.length === 1 ? "" : "s"}`);
  }
  function addToTimeline(asset: MediaAsset, requestedStartUs?: number, requestedTrackId?: string) {
    const startUs = requestedStartUs === undefined ? undefined : snapTime(requestedStartUs, snapping, project!, playheadUs);
    const result = addAssetToTimeline(project!, asset, startUs, requestedTrackId);
    commitProject(result.project);
    setSelectedItemId(result.item.id); setSelectedItemIds([result.item.id]);
    setSelectedAssetId(asset.id);
    setPlayheadUs(result.item.startUs);
    setStatus(`Added ${asset.name} to ${result.project.sequence.tracks.find((track) => track.id === result.item.trackId)?.name ?? "timeline"}`);
    requestAnimationFrame(() => document.querySelector(`[data-item-id="${result.item.id}"]`)?.scrollIntoView?.({ block: "nearest", inline: "center" }));
  }
  function updateTimelineItem(updated: TimelineItem) {
    commitProject(touch({
      ...project!,
      sequence: {
        ...project!.sequence,
        tracks: project!.sequence.tracks.map((track) => ({
          ...track,
          items: track.items.map((item) => item.id === updated.id ? updated : item),
        })),
      },
    }));
  }
  function selectTimelineItem(item: TimelineItem, additive = false) {
    setSelectedAssetId(item.assetId); setSelectedItemId(item.id);
    setSelectedItemIds((current) => additive ? (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]) : [item.id]);
  }
  function deleteSelected() {
    if (!selectedItemId) { setStatus("Select a timeline clip first"); return; }
    const ids=selectedItemIds.length ? selectedItemIds : [selectedItemId]; commitProject(deleteItems(project!, ids));
    setSelectedItemId(undefined); setSelectedItemIds([]); setStatus(`Deleted ${ids.length} timeline clip${ids.length===1?"":"s"}`);
  }
  function duplicateSelected() {
    if (!selectedItemId) { setStatus("Select one or more timeline clips first"); return; }
    const result=duplicateItems(project!, selectedItemIds.length?selectedItemIds:[selectedItemId]); commitProject(result.project);
    setSelectedItemIds(result.itemIds); setSelectedItemId(result.itemIds[0]); setStatus(`Duplicated ${result.itemIds.length} clip${result.itemIds.length===1?"":"s"}`);
  }
  function rippleDeleteSelected() {
    if(!selectedItemId){setStatus("Select one or more clips to ripple delete");return;}const ids=selectedItemIds.length?selectedItemIds:[selectedItemId];commitProject(rippleDeleteItems(project!,ids));setSelectedItemId(undefined);setSelectedItemIds([]);setStatus(`Ripple deleted ${ids.length} clip${ids.length===1?"":"s"} and closed the gap`);
  }
  function toggleLinkSelected() {
    if(!selectedItemId)return;const ids=selectedItemIds.length?selectedItemIds:[selectedItemId],linked=ids.some((idValue)=>project!.sequence.tracks.some((track)=>track.items.some((item)=>item.id===idValue&&item.linkedItemIds.length)));
    if(linked){commitProject(unlinkItems(project!,ids));setStatus("Unlinked clip group");}else if(ids.length>1){commitProject(linkItems(project!,ids));setStatus(`Linked ${ids.length} clips`);}else setStatus("Select at least two clips with Shift or Ctrl to link them");
  }
  function professionalEdit(tool:TimelineTool,itemId:string,edge:"start"|"end",deltaUs:number){
    if(tool==="roll")commitProject(rollEdit(project!,itemId,edge,deltaUs));else if(tool==="slip")commitProject(slipItem(project!,itemId,deltaUs));else if(tool==="slide")commitProject(slideItem(project!,itemId,deltaUs));
    setStatus(tool[0].toUpperCase()+tool.slice(1)+" edit applied");
  }
  function addTimelineMarker(timeUs=playheadUs,label="Marker",kind:TimelineMarker["kind"]="manual"){
    const marker:TimelineMarker={id:id("marker"),timeUs:Math.max(0,timeUs),label,color:kind==="beat"?"#ffb45c":"#b9f75a",kind};commitProject(touch({...project!,sequence:{...project!.sequence,markers:[...project!.sequence.markers,marker].sort((a,b)=>a.timeUs-b.timeUs)}}));
  }
  async function detectBeatsForSelected(){
    if(!selectedItem||selectedItem.kind==="image"){setStatus("Select an audio or video clip first");return;}const asset=project!.assets.find((value)=>value.id===selectedItem.assetId);if(!asset)return;setStatus("Analyzing beats from real audio…");
    try{const analysis=audioAnalyses[asset.id]??await analyzeAudio(asset.path,160);setAudioAnalyses((current)=>({...current,[asset.id]:analysis}));const markers=analysis.beatsUs.filter((beat)=>beat>=selectedItem.sourceInUs&&beat<=selectedItem.sourceOutUs).map((beat,index)=>({id:id("marker"),timeUs:Math.round(selectedItem.startUs+(selectedItem.reversed?selectedItem.sourceOutUs-beat:beat-selectedItem.sourceInUs)/selectedItem.playbackRate),label:`Beat ${index+1}`,color:"#ffb45c",kind:"beat" as const})).filter((marker)=>marker.timeUs>=selectedItem.startUs&&marker.timeUs<=selectedItem.startUs+selectedItem.durationUs);commitProject(touch({...project!,sequence:{...project!.sequence,markers:[...project!.sequence.markers.filter((marker)=>marker.kind!=="beat"),...markers].sort((a,b)=>a.timeUs-b.timeUs)}}));setStatus(`Added ${markers.length} beat markers${analysis.bpm?` · ${Math.round(analysis.bpm)} BPM`:""}`);}catch(error){setStatus("Beat analysis failed: "+message(error));}
  }
  function updateTrackMix(trackId:string,patch:Partial<Pick<Track,"gain"|"pan"|"solo"|"muted">>){commitProject(touch({...project!,sequence:{...project!.sequence,tracks:project!.sequence.tracks.map((track)=>track.id===trackId?{...track,...patch}:track)}}));}
  function detachSelectedAudio() {
    if (!selectedItem || selectedItem.kind !== "video") { setStatus("Select a video clip to detach its audio"); return; }
    let next=project!, audioTrack=next.sequence.tracks.find((track)=>track.kind==="audio"&&!track.locked); if(!audioTrack){next=addTrack(next,"audio");audioTrack=next.sequence.tracks.find((track)=>track.kind==="audio"&&!track.locked);}
    if(!audioTrack)return; const audioItem:TimelineItem={...structuredClone(selectedItem),id:id("item"),trackId:audioTrack.id,kind:"audio",name:selectedItem.name+" audio",positionX:0,positionY:0,scale:1,rotation:0,crop:{x:0,y:0,width:1,height:1},flipHorizontal:false,flipVertical:false,opacity:1,keyframes:[],effects:[],linkedItemIds:[selectedItem.id]};
    next=touch({...next,sequence:{...next.sequence,tracks:next.sequence.tracks.map((track)=>({...track,items:track.id===audioTrack!.id?[...track.items,audioItem]:track.items.map((item)=>item.id===selectedItem.id?{...item,volume:0,linkedItemIds:[...new Set([...item.linkedItemIds,audioItem.id])]}:item)}))}});commitProject(next);setSelectedItemId(audioItem.id);setSelectedItemIds([audioItem.id]);setStatus("Detached audio to "+audioTrack.name);
  }  function stepFrames(frames: number) {
    setPlaying(false);
    setPlayheadUs((current) => Math.max(0, Math.min(projectDuration, current + (frames * SECOND) / fps)));
  }
  function addNewTrack(kind: "video" | "graphic" | "audio") {
    commitProject(addTrack(project!, kind));
    setStatus(`Added ${kind === "graphic" ? "image overlay" : kind} track`);
  }
  function splitSelected() {
    if (!selectedItemId) { setStatus("Select a clip to split"); return; }
    commitProject(splitItem(project!, selectedItemId, playheadUs)); setStatus("Clip split");
  }
  function openDesignWorkspace() {
    const document = normalizeDesign(project!.design, project!.sequence.width, project!.sequence.height);
    let next: OpenFrameProject = { ...project!, workspace: "design", design: document };
    const source = selectedLibraryAsset ?? project!.assets.find((asset) => asset.id === selectedItem?.assetId);
    if (source?.kind === "image") {
      const page = activeDesignPage(next);
      if (!page.objects.some((object) => object.assetId === source.id)) {
        const object = createDesignObject("image", page, {
          name: source.name,
          assetId: source.id,
          x: page.width * .15,
          y: page.height * .15,
          width: page.width * .7,
          height: page.height * .7,
        });
        next = updateDesignPage(next, { ...page, objects: [...page.objects, object] });
      }
    }
    commitProject(touch(next));
  }
  const pluginExporters = pluginSnapshot().plugins.filter((value) => value.enabled).flatMap((plugin) => plugin.package.contributions.exporters.map((exporter) => ({ pluginId: plugin.package.manifest.id, pluginName: plugin.package.manifest.name, exporter })));
  async function handlePluginExport(pluginId: string, exporterId: string, label: string) { setStatus("Preparing "+label+"…"); try { const output = await exportProjectWithPlugin(project!, pluginId, exporterId, label); setStatus(output ? "Exported to "+output : "Export cancelled"); await writeAppLog("info","export.plugin",output ? "Plugin export completed" : "Plugin export cancelled"); } catch (error) { setStatus("Plugin export failed: "+error); await writeAppLog("error","export.plugin","Plugin export failed"); } }
  async function handleExport() {
    setStatus("Preparing export…");
    try { const output = await exportProject(project!); setStatus(output ? `Exported to ${output}` : "Export cancelled"); }
    catch (error) { setStatus(`Export unavailable: ${message(error)}`); }
  }

  const filteredAssets = project.assets.filter((asset) => (mediaFilter === "all" || asset.kind === mediaFilter) && asset.name.toLowerCase().includes(mediaQuery.toLowerCase()));
  const fps = project.sequence.frameRate.numerator / project.sequence.frameRate.denominator;

  return <div className="editor-shell">
    <header className="editor-topbar">
      <div className="topbar-left"><button className="icon-button" onClick={onHome} title="Back to Home"><ArrowLeft size={17} /></button><Logo /><span className="divider" /><span className="menu-wrap"><button className="menu-button" aria-expanded={openMenu === "file"} onClick={() => setOpenMenu(openMenu === "file" ? undefined : "file")}><Menu size={16} /> File</button>{openMenu === "file" && <div className="top-menu-popup"><button onClick={() => { setOpenMenu(undefined); void saveCurrent(); }}><Save size={14} /> Save <kbd>Ctrl+S</kbd></button><button onClick={() => { setOpenMenu(undefined); void saveCurrent(true); }}>Save As… <kbd>Ctrl+Shift+S</kbd></button><button onClick={() => { setOpenMenu(undefined); void handleExport(); }}><Download size={14} /> Export MP4</button><button onClick={() => { setOpenMenu(undefined); onHome(); }}><ArrowLeft size={14} /> Back to Home</button>{pluginExporters.map(({pluginId,pluginName,exporter})=><button key={pluginId+exporter.id} onClick={()=>{setOpenMenu(undefined);void handlePluginExport(pluginId,exporter.id,exporter.name)}}><Sparkles size={14}/> {exporter.name}<small>{pluginName}</small></button>)}</div>}</span><span className="menu-wrap"><button className="menu-button" aria-expanded={openMenu === "edit"} onClick={() => setOpenMenu(openMenu === "edit" ? undefined : "edit")}>Edit</button>{openMenu === "edit" && <div className="top-menu-popup"><button disabled={!past.length} onClick={() => { dispatch({ type: "undo" }); setOpenMenu(undefined); }}>Undo <kbd>Ctrl+Z</kbd></button><button disabled={!future.length} onClick={() => { dispatch({ type: "redo" }); setOpenMenu(undefined); }}>Redo <kbd>Ctrl+Y</kbd></button><button disabled={!selectedItemId} onClick={() => { deleteSelected(); setOpenMenu(undefined); }}><Trash2 size={14} /> Delete clip <kbd>Del</kbd></button></div>}</span><span className="menu-wrap"><button className="menu-button" aria-expanded={openMenu === "view"} onClick={() => setOpenMenu(openMenu === "view" ? undefined : "view")}>View</button>{openMenu === "view" && <div className="top-menu-popup"><button onClick={() => { setZoom(Math.min(2.5, zoom + .25)); setOpenMenu(undefined); }}><ZoomIn size={14} /> Zoom in</button><button onClick={() => { setZoom(Math.max(.5, zoom - .25)); setOpenMenu(undefined); }}><ZoomOut size={14} /> Zoom out</button><button onClick={() => { setZoom(1); setOpenMenu(undefined); }}>Reset timeline zoom</button></div>}</span></div>
      <button className="project-title" onClick={() => setStatus("Double-click the project name to Save As")} onDoubleClick={() => void saveCurrent(true)} title="Double-click to Save As"><strong>{project.name}</strong><small>{project.sequence.width} × {project.sequence.height} • {fps.toFixed(fps % 1 ? 2 : 0)} fps</small></button>
      <div className="topbar-actions"><button className="button ghost compact" onClick={openDesignWorkspace}><Palette size={15} /> Design</button><button className="icon-button" disabled={!past.length} onClick={() => dispatch({ type: "undo" })} title="Undo"><Undo2 size={17} /></button><button className="icon-button" disabled={!future.length} onClick={() => dispatch({ type: "redo" })} title="Redo"><Redo2 size={17} /></button><button className="button ghost compact" onClick={() => void saveCurrent()}><Save size={15} /> Save</button><button className="button primary compact" onClick={handleExport}><Download size={15} /> Export</button></div>
    </header>
    <div className="editor-workspace">
      <nav className="tool-rail">
        <button className={activeTool === "media" ? "active" : ""} onClick={() => { setActiveTool("media"); setMediaFilter("all"); setStatus("Showing all project media"); }}><FolderOpen size={20} /><span>Media</span></button>
        <button className={activeTool === "audio" ? "active" : ""} onClick={() => { setActiveTool("audio"); setMediaFilter("audio"); setStatus("Showing imported audio"); }}><Music2 size={20} /><span>Audio</span></button>
        <button className={activeTool === "captions" ? "active" : ""} onClick={() => { setActiveTool("captions"); setStatus("Caption editor opened"); }}><Text size={20} /><span>Captions</span></button>
        <button className={activeTool === "cutout" ? "active" : ""} onClick={() => { setActiveTool("cutout"); setStatus("Background removal controls opened"); }}><WandSparkles size={20} /><span>Cutout</span></button>
        <button className={activeTool === "advanced" ? "active" : ""} onClick={() => { setActiveTool("advanced"); setStatus("Advanced video controls opened"); }}><Scissors size={20} /><span>Advanced</span></button><span className="rail-spacer" /><button onClick={() => setModelsOpen(true)} title="Install optional local models and dependencies"><Settings2 size={20} /><span>Models</span></button><button onClick={() => setEcosystemOpen(true)} title="Plugins, themes, diagnostics, and About"><Sparkles size={20} /><span>Extend</span></button>
      </nav>
      <aside className="media-panel">{["captions", "cutout", "advanced"].includes(activeTool) ? <AdvancedToolPanel tool={activeTool} project={project} item={selectedItem} playheadUs={playheadUs} onProject={commitProject} onItem={updateTimelineItem} onStatus={setStatus} /> : <>
        <div className="panel-heading"><div><span className="eyebrow">PROJECT ASSETS</span><h2>Media</h2></div><button className="icon-button" onClick={() => isTauri() ? void importDesktop() : fileInput.current?.click()} title="Import media"><Plus size={18} /></button></div>
        <button className="import-drop" onClick={() => isTauri() ? void importDesktop() : fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importBrowser(Array.from(event.dataTransfer.files)); }}><span><Upload size={18} /></span><strong>Import media</strong><small>or drop files here</small></button>
        <input ref={fileInput} hidden type="file" multiple accept="video/*,audio/*,image/*" onChange={(event) => void importBrowser(Array.from(event.target.files ?? []))} />
        <label className="panel-search"><Search size={15} /><input placeholder="Search media" value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} /></label>
        <div className="filter-tabs">{(["all", "video", "image", "audio"] as const).map((filter) => <button key={filter} className={mediaFilter === filter ? "active" : ""} onClick={() => setMediaFilter(filter)}>{filter}</button>)}</div>
        <div className="asset-grid">{filteredAssets.map((asset) => <article draggable className={`asset-card ${selectedAssetId === asset.id ? "selected" : ""}`} key={asset.id} role="button" tabIndex={0} onClick={() => setSelectedAssetId(asset.id)} onDoubleClick={() => addToTimeline(asset)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addToTimeline(asset); } }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/openframe-asset", asset.id); event.dataTransfer.setData("text/plain", asset.id); }}>
          <AssetThumbnail asset={asset} /><span className="asset-info"><strong title={asset.name}>{asset.name}</strong><small>{asset.kind} • {asset.durationUs ? formatTime(asset.durationUs, Math.round(fps)) : `${asset.width}×${asset.height}`}</small></span>
          <button className="asset-add" onClick={(event) => { event.stopPropagation(); addToTimeline(asset); }} title={`Add ${asset.name} to timeline`}><Plus size={12} /> Timeline</button>
        </article>)}</div>
        {!!project.assets.length && <div className="media-actions"><button className="button primary compact" disabled={!selectedLibraryAsset} onClick={() => selectedLibraryAsset && addToTimeline(selectedLibraryAsset)}><Plus size={14} /> Add selected to timeline</button><small>Double-click, press Enter, or drag a media card onto a matching track.</small></div>}
        {!project.assets.length && <div className="panel-empty"><Film size={30} /><strong>Your media lives here</strong><small>Import video, images, or audio. Files stay where they are.</small></div>}
      </>}</aside>
      <section className="preview-area">
        <div className="viewer-toolbar"><span>Program</span><button disabled title="Preview automatically fits the available area">Fit <ChevronDown size={13} /></button></div>
        <div className="viewer-stage"><div className="canvas-frame" style={{ aspectRatio: `${project.sequence.width}/${project.sequence.height}` }}>
          {visualItems.length ? visualItems.map((item) => { const asset = project.assets.find((candidate) => candidate.id === item.assetId); return asset ? <PreviewObject key={item.id} asset={asset} item={item} playheadUs={playheadUs} playing={playing} frameWidth={project.sequence.width} frameHeight={project.sequence.height} selected={selectedItem?.id === item.id} onCommit={updateTimelineItem} /> : null; }) : previewAsset && previewItem ? <Preview asset={previewAsset} item={previewItem} ref={previewRef} /> : <div className="viewer-empty"><div className="empty-frame-icon"><Film size={28} /></div><strong>{sequenceDuration ? "No visual at the playhead" : "Your story starts on the timeline"}</strong><small>{sequenceDuration ? "Move the playhead onto a visible video or image layer." : "Import media and place it on one of the layered tracks below."}</small></div>}
          <AudioMixerPreview items={audibleItems} assets={project.assets} tracks={project.sequence.tracks} playheadUs={playheadUs} playing={playing} />
          {activeCaption && <CaptionOverlay caption={activeCaption} />}
        </div></div>
        <div className="transport"><div className="transport-left"><button className={`icon-button record-button ${recording?"recording":""}`} aria-pressed={recording} onClick={()=>void toggleVoiceRecording()} title={recording?"Stop voice-over recording":"Record microphone voice-over at playhead"}><Mic2 size={16} /></button>{recording&&<span className="recording-time"><i/>{formatTime(recordingElapsedUs)}</span>}</div><div className="transport-center"><button className="icon-button" onClick={() => { setPlaying(false); setPlayheadUs(0); }} title="Go to start"><SkipBack size={16} /></button><button className="icon-button" onClick={() => stepFrames(-1)} title="Previous frame"><ChevronLeft size={17} /></button><button className="play-button" onClick={() => setPlaying(!playing)} title={playing ? "Pause" : "Play"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="icon-button" onClick={() => stepFrames(1)} title="Next frame"><ChevronRight size={17} /></button><button className="icon-button" onClick={() => { setPlaying(false); setPlayheadUs(durationOf(project)); }} title="Go to end"><SkipForward size={16} /></button></div><code>{formatTime(playheadUs, Math.round(fps))}</code></div>
      </section>
      <aside className="inspector-panel"><div className="panel-heading"><div><span className="eyebrow">INSPECTOR</span><h2>{selectedItem ? "Clip" : "Nothing selected"}</h2></div></div>
        {selectedItem ? <Inspector item={selectedItem} project={project} playheadUs={playheadUs} onChange={updateTimelineItem} onMoveTrack={(trackId) => commitProject(moveItem(project, selectedItem.id, selectedItem.startUs, trackId))} onDetachAudio={detachSelectedAudio} /> : <div className="panel-empty inspector-empty"><MousePointer2 size={28} /><strong>Select a clip</strong><small>Its transform, audio, and timing controls will appear here.</small></div>}
      </aside>
      <section className="timeline-panel">
        <div className="sequence-bar"><span>Sequences</span><div className="sequence-tabs">{project.sequences.map((sequence)=><button key={sequence.id} className={sequence.id===project.sequence.id?"active":""} disabled={recording} onClick={()=>activateSequence(sequence.id)} title={sequence.compound?"Open compound sequence":"Open sequence"}>{sequence.compound&&<Layers3 size={11}/>} {sequence.name}</button>)}</div><input aria-label="Active sequence name" value={project.sequence.name} onChange={(event)=>commitProject(renameActiveSequence(project,event.target.value))}/><button className="icon-button" disabled={recording} onClick={()=>{const next=addSequence(project);commitProject(next);setPlayheadUs(0);setSelectedItemId(undefined);setSelectedItemIds([]);setStatus("New sequence created")}} title="Add sequence"><Plus size={14}/></button><button className="icon-button" disabled={recording} onClick={()=>{const next=duplicateActiveSequence(project);commitProject(next);setPlayheadUs(0);setSelectedItemId(undefined);setSelectedItemIds([]);setStatus("Sequence duplicated")}} title="Duplicate active sequence"><Copy size={14}/></button><button className="icon-button" disabled={recording||project.sequence.compound||project.sequences.filter((sequence)=>!sequence.compound).length<=1} onClick={()=>{commitProject(removeActiveSequence(project));setPlayheadUs(0);setSelectedItemId(undefined);setSelectedItemIds([]);setStatus("Sequence removed")}} title="Delete active sequence"><Trash2 size={14}/></button></div>
        <div className="timeline-toolbar"><div className="timeline-tool-group">
          <button className={`icon-button ${timelineTool==="select"?"active-tool":""}`} onClick={()=>setTimelineTool("select")} title="Selection tool"><MousePointer2 size={16}/></button>
          {(["roll","slip","slide"] as TimelineTool[]).map((tool)=><button key={tool} className={`tool-text ${timelineTool===tool?"active":""}`} onClick={()=>{setTimelineTool(tool);setStatus(`${tool} tool active`)}} title={`${tool} edit tool`}>{tool}</button>)}
          <button className="icon-button" onClick={splitSelected} title="Split selected linked clips at playhead"><Split size={16}/></button><button className="icon-button" disabled={!selectedItemId} onClick={duplicateSelected} title="Duplicate selected clips (Ctrl+D)"><Copy size={16}/></button><button className="icon-button" disabled={!selectedItemId} onClick={deleteSelected} title="Delete selected clip"><Trash2 size={16}/></button><button className="tool-text danger-tool" disabled={!selectedItemId} onClick={rippleDeleteSelected} title="Ripple delete and close gaps"><Scissors size={14}/> Ripple delete</button>
          <button className="icon-button" disabled={!selectedItemId} onClick={toggleLinkSelected} title={selectedItem?.linkedItemIds.length?"Unlink selected clips":"Link selected clips"}>{selectedItem?.linkedItemIds.length?<Unlink size={15}/>:<Link2 size={15}/>}</button><button className="tool-text" disabled={!selectedItemId} onClick={makeOrOpenCompound} title={selectedItem?.compoundSequenceId?"Open compound sequence":"Create compound clip from selection"}><Layers3 size={14}/> {selectedItem?.compoundSequenceId?"Open compound":"Compound"}</button><span className="divider"/>
          <button className={`tool-text ${snapping?"active":""}`} aria-pressed={snapping} onClick={()=>{setSnapping((value)=>!value);setStatus(`Snapping ${snapping?"off":"on"}`)}}><Sparkles size={14}/> Snapping</button><button className="tool-text" onClick={()=>addTimelineMarker()}><MapPin size={14}/> Marker</button><button className="tool-text" disabled={!selectedItemId} onClick={()=>void detectBeatsForSelected()}><AudioLines size={14}/> Detect beats</button><button className={`tool-text ${mixerOpen?"active":""}`} onClick={()=>setMixerOpen((value)=>!value)}><Volume2 size={14}/> Mixer</button><button className="tool-text add-media-tool" disabled={!selectedLibraryAsset} onClick={()=>selectedLibraryAsset&&addToTimeline(selectedLibraryAsset)}><Plus size={14}/> Add media</button>
        </div><div><span className="timeline-status" role="status" aria-live="polite">{status}</span><button className="icon-button" onClick={()=>setZoom(Math.max(.5,zoom-.25))}><ZoomOut size={15}/></button><input className="zoom-range" type="range" min="0.5" max="2.5" step="0.25" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/><button className="icon-button" onClick={()=>setZoom(Math.min(2.5,zoom+.25))}><ZoomIn size={15}/></button></div></div>
        {mixerOpen&&<TrackMixer tracks={project.sequence.tracks} items={audibleItems} analyses={audioAnalyses} playheadUs={playheadUs} onChange={updateTrackMix}/>}         <div className="timeline-body"><div className="track-labels" ref={trackLabelsRef} onScroll={(event) => { if (timelineRef.current) timelineRef.current.scrollTop = event.currentTarget.scrollTop; }}><div className="ruler-gutter track-adders"><button onClick={() => addNewTrack("video")} title="Add video overlay track"><Film size={12} /> V</button><button onClick={() => addNewTrack("graphic")} title="Add image overlay track"><ImageIcon size={12} /> I</button><button onClick={() => addNewTrack("audio")} title="Add audio track"><Music2 size={12} /> A</button></div>{project.sequence.tracks.map((track) => <TrackLabel key={track.id} track={track} project={project} commit={commitProject} />)}</div>
          <div className="timeline-scroll" ref={timelineRef} onScroll={(event) => { if (trackLabelsRef.current) trackLabelsRef.current.scrollTop = event.currentTarget.scrollTop; }} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlayheadUs(Math.max(0, ((event.clientX - rect.left + event.currentTarget.scrollLeft) / (PIXELS_PER_SECOND * zoom)) * SECOND)); }}>
            <div className="timeline-content" style={{ width: Math.max(1100, (projectDuration / SECOND) * PIXELS_PER_SECOND * zoom) }}><Ruler durationUs={projectDuration} zoom={zoom} />{project.sequence.markers.map((marker)=><TimelineMarkerView key={marker.id} marker={marker} zoom={zoom} onMove={(timeUs)=>commitProject(touch({...project,sequence:{...project.sequence,markers:project.sequence.markers.map((value)=>value.id===marker.id?{...value,timeUs}:value)}}))} onDelete={()=>commitProject(touch({...project,sequence:{...project.sequence,markers:project.sequence.markers.filter((value)=>value.id!==marker.id)}}))}/>)}
              <div className="playhead" style={{ left: (playheadUs / SECOND) * PIXELS_PER_SECOND * zoom }}><span /><i /></div>
              {project.sequence.tracks.map((track) => <TrackLane key={track.id} track={track} assets={project.assets} analyses={audioAnalyses} tool={timelineTool} zoom={zoom} selectedItemIds={selectedItemIds} onSelect={selectTimelineItem} onDropAsset={(assetId, position) => { const asset = project.assets.find((item) => item.id === assetId); if (asset) addToTimeline(asset, position, track.id); }} onMove={(itemId, position, targetTrackId) => { const ids=selectedItemIds.includes(itemId)?selectedItemIds:[itemId]; commitProject(moveItems(project,ids,itemId,snapTime(position,snapping,project,playheadUs,ids),targetTrackId)); }} onTrim={(itemId, edge, delta) => commitProject(trimItem(project, itemId, edge, delta))} onProfessionalEdit={professionalEdit} onOpenCompound={activateSequence} />)}
            </div>
          </div>
        </div>
      </section>
    </div>{modelsOpen && <ModelCenter project={project} onProject={commitProject} onClose={() => setModelsOpen(false)} />}{ecosystemOpen&&<EcosystemCenter onClose={()=>setEcosystemOpen(false)}/>}
  </div>;
}

function AssetThumbnail({ asset }: { asset: MediaAsset }) {
  const url = assetPreviewUrl(asset);
  if (asset.kind === "image" && url) return <span className="asset-thumb image"><img src={url} alt="" /></span>;
  return <span className={`asset-thumb ${asset.kind}`}>{asset.kind === "video" ? <Film size={22} /> : asset.kind === "audio" ? <Music2 size={22} /> : <ImageIcon size={22} />}<i>{asset.kind === "video" ? "VIDEO" : asset.kind === "audio" ? "AUDIO" : "IMAGE"}</i></span>;
}

function PreviewObject({ asset, item, playheadUs, playing, frameWidth, frameHeight, selected, onCommit }: {
  asset: MediaAsset; item: TimelineItem; playheadUs: number; playing: boolean; frameWidth: number; frameHeight: number; selected: boolean; onCommit: (item: TimelineItem) => void;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const drag = useRef<{ pointerId:number; mode:"move"|"scale"|"rotate"; startX:number; startY:number; x:number; y:number; scale:number; rotation:number; width:number; height:number; centerX:number; centerY:number; startDistance:number; startAngle:number } | undefined>(undefined);
  const [draft, setDraft] = useState<{ x:number; y:number; scale:number; rotation:number }>();
  const animated = evaluateTimelineItem(item, playheadUs);
  useEffect(() => { const media=mediaRef.current; if(!media||asset.kind==="image")return; const target=sourceTimeAt(item,playheadUs)/SECOND; if(Math.abs(media.currentTime-target)>.12)media.currentTime=target; media.playbackRate=speedAt(item,Math.max(0,playheadUs-item.startUs));media.volume=clamp(item.volume,0,1);if(playing&&item.freezeFrameUs===undefined)void media.play().catch(()=>undefined);else media.pause(); }, [asset.kind,item,playheadUs,playing]);
  const tracking=trackingOffset(item,playheadUs),x=(draft?.x??animated.positionX)+tracking.x*frameWidth,y=(draft?.y??animated.positionY)+tracking.y*frameHeight,transition=transitionStyle(item,playheadUs);
  const scale=draft?.scale??animated.scale,rotation=draft?.rotation??animated.rotation;
  const style:React.CSSProperties={transform:`translate(${(x/frameWidth)*100+transition.translateX}%, ${(y/frameHeight)*100}%) scale(${scale}) rotate(${rotation}deg)`,opacity:animated.opacity*transition.opacity,filter:previewFilter(animated),mixBlendMode:item.blendMode==="addition"?"plus-lighter":item.blendMode,...maskStyle(item)};
  function values(event:React.PointerEvent<HTMLDivElement>){const active=drag.current!;if(active.mode==="move")return{x:active.x+((event.clientX-active.startX)/active.width)*frameWidth,y:active.y+((event.clientY-active.startY)/active.height)*frameHeight,scale:active.scale,rotation:active.rotation};if(active.mode==="scale"){const distance=Math.hypot(event.clientX-active.centerX,event.clientY-active.centerY);return{x:active.x,y:active.y,scale:clamp(active.scale*(distance/Math.max(8,active.startDistance)),.05,12),rotation:active.rotation};}const angle=Math.atan2(event.clientY-active.centerY,event.clientX-active.centerX),raw=active.rotation+(angle-active.startAngle)*180/Math.PI;return{x:active.x,y:active.y,scale:active.scale,rotation:event.shiftKey?Math.round(raw/15)*15:raw};}
  return <div className={`preview-object-layer ${selected?"selected":""}`} style={style} onPointerDown={(event)=>{if(!selected)return;const frame=event.currentTarget.parentElement?.getBoundingClientRect();if(!frame)return;const action=(event.target as HTMLElement).closest<HTMLElement>("[data-preview-action]")?.dataset.previewAction;const mode=action==="rotate"?"rotate":action==="scale"?"scale":"move";const centerX=frame.left+frame.width/2,centerY=frame.top+frame.height/2;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointerId:event.pointerId,mode,startX:event.clientX,startY:event.clientY,x:item.positionX,y:item.positionY,scale:item.scale,rotation:item.rotation,width:frame.width,height:frame.height,centerX,centerY,startDistance:Math.hypot(event.clientX-centerX,event.clientY-centerY),startAngle:Math.atan2(event.clientY-centerY,event.clientX-centerX)};}} onPointerMove={(event)=>{if(drag.current?.pointerId===event.pointerId)setDraft(values(event));}} onPointerUp={(event)=>{if(drag.current?.pointerId!==event.pointerId)return;const next=values(event);drag.current=undefined;setDraft(undefined);onCommit({...item,positionX:Math.round(next.x),positionY:Math.round(next.y),scale:next.scale,rotation:next.rotation});}} onPointerCancel={()=>{drag.current=undefined;setDraft(undefined);}}>
    <div className="preview-media-transform" style={{clipPath:`inset(${item.crop.y*100}% ${(1-item.crop.x-item.crop.width)*100}% ${(1-item.crop.y-item.crop.height)*100}% ${item.crop.x*100}%)`,transform:`scale(${item.flipHorizontal?-1:1},${item.flipVertical?-1:1})`}}><Preview asset={asset} item={item} ref={mediaRef}/></div>{selected&&<div className="selection-box"><i data-preview-action="scale" className="handle nw"/><i data-preview-action="scale" className="handle ne"/><i data-preview-action="scale" className="handle sw"/><i data-preview-action="scale" className="handle se"/><i className="rotate-stem"/><i data-preview-action="rotate" className="rotate-handle"/></div>}
  </div>;
}function Preview({ asset, item, ref }: { asset: MediaAsset; item?: TimelineItem; ref: React.Ref<HTMLVideoElement | HTMLAudioElement> }) {
  const url = assetPreviewUrl(asset);
  if (!url) return <div className="viewer-empty"><Film size={28} /><strong>Media offline</strong><small>Relink this file to preview it.</small></div>;
  if (asset.kind === "image") return <img className="preview-media" src={url} alt={asset.name} />;
  if (asset.kind === "audio") return <div className="audio-preview"><Music2 size={38} /><strong>{asset.name}</strong><div className="audio-bars">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ height: `${20 + ((index * 17) % 60)}%` }} />)}</div><audio ref={ref as React.Ref<HTMLAudioElement>} src={url} muted /></div>;
  return <video className="preview-media" ref={ref as React.Ref<HTMLVideoElement>} src={url} muted />;
}

function AudioMixerPreview({items,assets,tracks,playheadUs,playing}:{items:TimelineItem[];assets:MediaAsset[];tracks:Track[];playheadUs:number;playing:boolean}){
  return <div className="preview-audio-mixer" aria-label={`${items.length} active audio clips`}>{items.map((item)=>{const asset=assets.find((candidate)=>candidate.id===item.assetId),track=tracks.find((candidate)=>candidate.id===item.trackId);return asset&&track?<PreviewAudioSource key={item.id} item={item} asset={asset} track={track} playheadUs={playheadUs} playing={playing}/>:null})}</div>;
}
function PreviewAudioSource({item,asset,track,playheadUs,playing}:{item:TimelineItem;asset:MediaAsset;track:Track;playheadUs:number;playing:boolean}){
  const ref=useRef<HTMLAudioElement>(null);useEffect(()=>{const media=ref.current;if(!media)return;const target=sourceTimeAt(item,playheadUs)/SECOND;if(Math.abs(media.currentTime-target)>.12)media.currentTime=target;const localUs=Math.max(0,playheadUs-item.startUs),remainingUs=Math.max(0,item.durationUs-localUs),fadeIn=item.fadeInUs?Math.min(1,localUs/item.fadeInUs):1,fadeOut=item.fadeOutUs?Math.min(1,remainingUs/item.fadeOutUs):1;media.volume=clamp(item.volume*track.gain*Math.min(fadeIn,fadeOut),0,1);media.playbackRate=speedAt(item,localUs);if(playing&&item.freezeFrameUs===undefined)void media.play().catch(()=>undefined);else media.pause();},[item,track.gain,playheadUs,playing]);return <audio ref={ref} src={assetPreviewUrl(asset)} preload="auto"/>;
}
function Inspector({ item, project, playheadUs, onChange, onMoveTrack, onDetachAudio }: { item: TimelineItem; project: OpenFrameProject; playheadUs: number; onChange: (item: TimelineItem) => void; onMoveTrack: (trackId: string) => void; onDetachAudio: () => void }) {
  const maxFadeSeconds = item.durationUs / SECOND / 2;
  const localUs = clamp(playheadUs - item.startUs, 0, item.durationUs);
  const setKeyframe = () => { const frame = keyframeAt(item, playheadUs); onChange({ ...item, keyframes: [...item.keyframes.filter((value) => Math.abs(value.timeUs - frame.timeUs) > 10_000), frame].sort((a, b) => a.timeUs - b.timeUs) }); };
  const updateKeyframe = (id: string, patch: { easing?: Easing }) => onChange({ ...item, keyframes: item.keyframes.map((frame) => frame.id === id ? { ...frame, ...patch } : frame) });
  const addEffect = (type: EffectType) => onChange({ ...item, effects: [...item.effects, { id: crypto.randomUUID(), type, enabled: true, amount: .5 }] });
  const pluginEffects = pluginSnapshot().plugins.filter((value)=>value.enabled).flatMap((plugin)=>plugin.package.contributions.effects.map((effect)=>({plugin,effect})));
  const pluginTransitions = pluginSnapshot().plugins.filter((value)=>value.enabled).flatMap((plugin)=>plugin.package.contributions.transitions.map((transition)=>({plugin,transition})));
  return <div className="inspector-controls">
    <section><h3>Layer <ChevronDown size={15} /></h3><label className="select-label">Track<select aria-label="Clip track" value={item.trackId} onChange={(event) => onMoveTrack(event.target.value)}>{project.sequence.tracks.filter((track) => track.id === item.trackId || (!track.locked && trackAcceptsAsset(track.kind, item.kind))).map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label><small className="field-help">Move this clip between compatible layers. Tracks at the top render above tracks below.</small></section>
    {item.kind !== "audio" && <section><h3>Transform <ChevronDown size={15} /></h3><div className="property-grid">
      <label>Position X<input aria-label="Position X" type="number" step="1" value={Math.round(item.positionX)} onChange={(event) => onChange({ ...item, positionX: Number(event.target.value) })} /></label>
      <label>Position Y<input aria-label="Position Y" type="number" step="1" value={Math.round(item.positionY)} onChange={(event) => onChange({ ...item, positionY: Number(event.target.value) })} /></label>
      <label>Scale %<input aria-label="Scale" type="number" min="10" max="400" step="1" value={Math.round(item.scale * 100)} onChange={(event) => onChange({ ...item, scale: clamp(Number(event.target.value) / 100, 0.1, 4) })} /></label>
      <label>Rotation<input aria-label="Rotation" type="number" min="-360" max="360" step="1" value={Math.round(item.rotation)} onChange={(event) => onChange({ ...item, rotation: clamp(Number(event.target.value), -360, 360) })} /></label>
    </div><button className="reset-properties" onClick={() => onChange({ ...item, positionX: 0, positionY: 0, scale: 1, rotation: 0 })}>Reset transform</button></section>}
    {item.kind !== "audio" && <section><h3>Crop & flip <ChevronDown size={15} /></h3><div className="property-grid">{(["x","y","width","height"] as const).map((key)=><label key={key}>{key}<input aria-label={`Clip crop ${key}`} type="number" min="0" max="100" value={Math.round(item.crop[key]*100)} onChange={(event)=>{const value=clamp(Number(event.target.value)/100,0,1);const crop={...item.crop,[key]:value};crop.width=Math.min(crop.width,1-crop.x);crop.height=Math.min(crop.height,1-crop.y);onChange({...item,crop});}} /></label>)}</div><div className="effect-add-row"><button className={item.flipHorizontal?"active":""} onClick={()=>onChange({...item,flipHorizontal:!item.flipHorizontal})}>Flip horizontal</button><button className={item.flipVertical?"active":""} onClick={()=>onChange({...item,flipVertical:!item.flipVertical})}>Flip vertical</button></div><button className="reset-properties" onClick={()=>onChange({...item,crop:{x:0,y:0,width:1,height:1},flipHorizontal:false,flipVertical:false})}>Reset crop & flip</button></section>}
    {item.kind !== "audio" && <section><h3>Animation <span>{item.keyframes.length} keyframes</span></h3><button className="reset-properties keyframe-add" onClick={setKeyframe}>Add / update at {formatTime(localUs)}</button>
      <div className="keyframe-list">{item.keyframes.map((frame) => <div className="keyframe-row" key={frame.id}><code>{formatTime(frame.timeUs)}</code><select aria-label={`Easing at ${formatTime(frame.timeUs)}`} value={frame.easing} onChange={(event) => updateKeyframe(frame.id, { easing: event.target.value as Easing })}><option value="linear">Linear</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in/out</option></select><button aria-label="Delete keyframe" onClick={() => onChange({ ...item, keyframes: item.keyframes.filter((value) => value.id !== frame.id) })}><Trash2 size={12} /></button></div>)}</div>
    </section>}
    {item.kind !== "audio" && <section><h3>Compositing <ChevronDown size={15} /></h3><label className="slider-label"><span>Opacity <b>{Math.round(item.opacity * 100)}%</b></span><input aria-label="Opacity" type="range" min="0" max="1" step="0.01" value={item.opacity} onChange={(event) => onChange({ ...item, opacity: Number(event.target.value) })} /></label><label className="select-label">Blend mode<select aria-label="Blend mode" value={item.blendMode} onChange={(event) => onChange({ ...item, blendMode: event.target.value as TimelineItem["blendMode"] })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option><option value="addition">Add</option></select></label></section>}
    {item.kind !== "audio" && <section><h3>Mask <ChevronDown size={15} /></h3><label className="select-label">Shape<select aria-label="Mask type" value={item.mask.type} onChange={(event) => onChange({ ...item, mask: { ...item.mask, type: event.target.value as TimelineItem["mask"]["type"] } })}><option value="none">None</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option></select></label>{item.mask.type !== "none" && <><div className="property-grid"><label>Width %<input aria-label="Mask width" type="number" min="1" max="100" value={Math.round(item.mask.width * 100)} onChange={(event) => onChange({ ...item, mask: { ...item.mask, width: clamp(Number(event.target.value) / 100, .01, 1) } })} /></label><label>Height %<input aria-label="Mask height" type="number" min="1" max="100" value={Math.round(item.mask.height * 100)} onChange={(event) => onChange({ ...item, mask: { ...item.mask, height: clamp(Number(event.target.value) / 100, .01, 1) } })} /></label><label>X %<input aria-label="Mask X" type="number" min="-100" max="100" value={Math.round(item.mask.x * 100)} onChange={(event) => onChange({ ...item, mask: { ...item.mask, x: clamp(Number(event.target.value) / 100, -1, 1) } })} /></label><label>Y %<input aria-label="Mask Y" type="number" min="-100" max="100" value={Math.round(item.mask.y * 100)} onChange={(event) => onChange({ ...item, mask: { ...item.mask, y: clamp(Number(event.target.value) / 100, -1, 1) } })} /></label></div><label className="slider-label"><span>Feather <b>{Math.round(item.mask.feather * 100)}%</b></span><input aria-label="Mask feather" type="range" min="0" max="1" step=".01" value={item.mask.feather} onChange={(event) => onChange({ ...item, mask: { ...item.mask, feather: Number(event.target.value) } })} /></label><label className="check-label"><input aria-label="Invert mask" type="checkbox" checked={item.mask.inverted} onChange={(event) => onChange({ ...item, mask: { ...item.mask, inverted: event.target.checked } })} /> Invert mask</label></>}</section>}
    {item.kind !== "audio" && <section><h3>Effects <ChevronDown size={15} /></h3><div className="effect-add-row">{(["blur", "sharpen", "grayscale", "vignette"] as EffectType[]).map((type) => <button key={type} onClick={() => addEffect(type)}>+ {type}</button>)}</div>{pluginEffects.map(({plugin,effect})=><button className="plugin-preset-add" key={plugin.package.manifest.id+effect.id} onClick={()=>onChange({...item,effects:[...item.effects,{id:crypto.randomUUID(),type:effect.kind,enabled:true,amount:effect.defaultAmount,plugin:{pluginId:plugin.package.manifest.id,contributionId:effect.id,label:effect.name}}]})}>+ {effect.name}<small>{plugin.package.manifest.name}</small></button>)}{item.effects.map((effect) => <div className="effect-row" key={effect.id}><label><input type="checkbox" checked={effect.enabled} onChange={(event) => onChange({ ...item, effects: item.effects.map((value) => value.id === effect.id ? { ...value, enabled: event.target.checked } : value) })} /> {effect.plugin?.label??effect.type}</label><input aria-label={`${effect.type} amount`} type="range" min="0" max="1" step=".01" value={effect.amount} onChange={(event) => onChange({ ...item, effects: item.effects.map((value) => value.id === effect.id ? { ...value, amount: Number(event.target.value) } : value) })} /><button aria-label={`Delete ${effect.type} effect`} onClick={() => onChange({ ...item, effects: item.effects.filter((value) => value.id !== effect.id) })}><Trash2 size={12} /></button></div>)}</section>}
    {item.kind !== "image" && <section><h3>Retiming <ChevronDown size={15} /></h3><div className="property-grid"><label>Speed<input aria-label="Playback speed" type="number" min="0.25" max="4" step="0.05" value={item.playbackRate} onChange={(event) => { const playbackRate = clamp(Number(event.target.value), .25, 4); const durationUs = Math.max(100_000, Math.round((item.sourceOutUs - item.sourceInUs) / playbackRate)); onChange({ ...item, playbackRate, durationUs, fadeInUs: Math.min(item.fadeInUs, durationUs / 2), fadeOutUs: Math.min(item.fadeOutUs, durationUs / 2), transitionIn: { ...item.transitionIn, durationUs: Math.min(item.transitionIn.durationUs, durationUs / 2) }, transitionOut: { ...item.transitionOut, durationUs: Math.min(item.transitionOut.durationUs, durationUs / 2) } }); }} /></label><label>Freeze frame<input aria-label="Freeze frame" readOnly value={item.freezeFrameUs === undefined ? "Off" : formatTime(item.freezeFrameUs)} /></label></div><label className="check-label"><input aria-label="Reverse clip" type="checkbox" checked={item.reversed} onChange={(event) => onChange({ ...item, reversed: event.target.checked })} /> Reverse playback</label><button className="reset-properties" onClick={() => onChange({ ...item, freezeFrameUs: item.freezeFrameUs === undefined ? sourceTimeAt(item, playheadUs) : undefined })}>{item.freezeFrameUs === undefined ? "Freeze at playhead" : "Clear freeze frame"}</button></section>}
    {item.kind !== "audio" && <section><h3>Transitions <ChevronDown size={15} /></h3>{(["transitionIn", "transitionOut"] as const).map((side) => <div className="transition-row" key={side}><label>{side === "transitionIn" ? "In" : "Out"}<select aria-label={side === "transitionIn" ? "Transition in" : "Transition out"} value={item[side].plugin?"plugin:"+item[side].plugin!.pluginId+":"+item[side].plugin!.contributionId+":"+item[side].type:item[side].type} onChange={(event) => { const parts=event.target.value.split(":"); const selected=parts[0]==="plugin"?pluginTransitions.find((value)=>value.plugin.package.manifest.id===parts[1]&&value.transition.id===parts[2]):undefined; const plugin=selected?{pluginId:parts[1],contributionId:parts[2],label:selected.transition.name}:undefined; const type=(plugin?parts[3]:event.target.value) as TimelineItem[typeof side]["type"]; const durationUs=selected?Math.min(item.durationUs/2,selected.transition.defaultDurationMs*1000):item[side].durationUs; onChange({ ...item, [side]: { ...item[side], type, durationUs, plugin } }); }}><option value="none">None</option><option value="fade">Fade</option><option value="wipe-left">Wipe left</option><option value="slide-left">Slide left</option>{pluginTransitions.map(({plugin,transition})=><option key={plugin.package.manifest.id+transition.id} value={"plugin:"+plugin.package.manifest.id+":"+transition.id+":"+transition.kind}>{transition.name} · {plugin.package.manifest.name}</option>)}</select></label><label>Duration<input aria-label={`${side} duration`} type="number" min="0" max={item.durationUs / SECOND / 2} step=".1" value={(item[side].durationUs / SECOND).toFixed(1)} onChange={(event) => onChange({ ...item, [side]: { ...item[side], durationUs: Math.round(clamp(Number(event.target.value), 0, item.durationUs / SECOND / 2) * SECOND) } })} /></label></div>)}</section>}
    {item.kind !== "audio" && <section><h3>Color <ChevronDown size={15} /></h3><label className="slider-label"><span>Brightness <b>{Math.round(item.brightness * 100)}</b></span><input aria-label="Brightness" type="range" min="-1" max="1" step="0.01" value={item.brightness} onChange={(event) => onChange({ ...item, brightness: Number(event.target.value) })} /></label><label className="slider-label"><span>Contrast <b>{Math.round(item.contrast * 100)}%</b></span><input aria-label="Contrast" type="range" min="0.5" max="2" step="0.01" value={item.contrast} onChange={(event) => onChange({ ...item, contrast: Number(event.target.value) })} /></label><label className="slider-label"><span>Saturation <b>{Math.round(item.saturation * 100)}%</b></span><input aria-label="Saturation" type="range" min="0" max="3" step="0.01" value={item.saturation} onChange={(event) => onChange({ ...item, saturation: Number(event.target.value) })} /></label></section>}
    {item.kind !== "image" && <section><h3>Audio <ChevronDown size={15} /></h3>{item.kind === "video" && !item.compoundSequenceId && <button className="reset-properties" onClick={onDetachAudio}>Detach audio to its own track</button>}<label className="slider-label"><span>Volume <b>{Math.round(item.volume * 100)}%</b></span><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={Math.min(1, item.volume)} onChange={(event) => onChange({ ...item, volume: Number(event.target.value) })} /></label><div className="property-grid"><label>Fade in (s)<input aria-label="Fade in" type="number" min="0" max={maxFadeSeconds} step="0.1" value={(item.fadeInUs / SECOND).toFixed(1)} onChange={(event) => onChange({ ...item, fadeInUs: Math.round(clamp(Number(event.target.value), 0, maxFadeSeconds) * SECOND) })} /></label><label>Fade out (s)<input aria-label="Fade out" type="number" min="0" max={maxFadeSeconds} step="0.1" value={(item.fadeOutUs / SECOND).toFixed(1)} onChange={(event) => onChange({ ...item, fadeOutUs: Math.round(clamp(Number(event.target.value), 0, maxFadeSeconds) * SECOND) })} /></label></div></section>}
    <section><h3>Timing <ChevronDown size={15} /></h3><div className="timing-readout"><span>Start <code>{formatTime(item.startUs)}</code></span><span>Duration <code>{formatTime(item.durationUs)}</code></span></div></section>
  </div>;
}function TrackLabel({ track, project, commit }: { track: Track; project: OpenFrameProject; commit: (project: OpenFrameProject) => void }) {
  function update(patch: Partial<Track>) { commit(touch({ ...project, sequence: { ...project.sequence, tracks: project.sequence.tracks.map((item) => item.id === track.id ? { ...item, ...patch } : item) } })); }
  const index = project.sequence.tracks.findIndex((item) => item.id === track.id);
  const visual = track.kind !== "audio";
  return <div className="track-label"><span className={`track-kind ${track.kind}`}>{track.kind === "audio" ? "A" : track.kind === "graphic" ? "I" : "V"}</span><input aria-label={`${track.name} name`} value={track.name} onChange={(event) => update({ name: event.target.value.slice(0, 40) })} /><div className="track-actions"><button disabled={index === 0} onClick={() => commit(moveTrack(project, track.id, -1))} title="Move layer up"><ChevronLeft size={13} /></button><button disabled={index === project.sequence.tracks.length - 1} onClick={() => commit(moveTrack(project, track.id, 1))} title="Move layer down"><ChevronRight size={13} /></button><button onClick={() => update({ locked: !track.locked })} title={track.locked ? "Unlock track" : "Lock track"}>{track.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>{visual && <button onClick={() => update({ visible: !track.visible })} title={track.visible ? "Hide layer" : "Show layer"}><Eye size={13} /></button>}{track.kind !== "graphic" && <button onClick={() => update({ muted: !track.muted })} title={track.muted ? "Unmute track" : "Mute track"}>{track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>}<button disabled={track.items.length > 0 || project.sequence.tracks.length <= 1} onClick={() => commit(removeTrack(project, track.id))} title={track.items.length ? "Delete clips before removing this track" : "Remove empty track"}><Trash2 size={13} /></button></div></div>;
}

function TrackMixer({tracks,items,analyses,playheadUs,onChange}:{tracks:Track[];items:TimelineItem[];analyses:Record<string,AudioAnalysis>;playheadUs:number;onChange:(trackId:string,patch:Partial<Pick<Track,"gain"|"pan"|"solo"|"muted">>)=>void}){
  const audioTracks=tracks.filter((track)=>track.kind!=="graphic");return <div className="track-mixer" aria-label="Track mixer">{audioTracks.map((track)=>{const item=items.find((value)=>value.trackId===track.id),analysis=item?analyses[item.assetId]:undefined,progress=item?clamp((playheadUs-item.startUs)/Math.max(1,item.durationUs),0,1):0,level=item&&analysis?.peaks.length?(analysis.peaks[Math.min(analysis.peaks.length-1,Math.floor(progress*analysis.peaks.length))]??0)*item.volume*track.gain:0;return <article key={track.id}><strong>{track.name}</strong><div className="mixer-meter"><i style={{height:`${clamp(level,0,1)*100}%`}}/></div><label>Gain <b>{Math.round(track.gain*100)}%</b><input aria-label={`${track.name} gain`} type="range" min="0" max="2" step=".01" value={track.gain} onChange={(event)=>onChange(track.id,{gain:Number(event.target.value)})}/></label><label>Pan <b>{Math.round(track.pan*100)}</b><input aria-label={`${track.name} pan`} type="range" min="-1" max="1" step=".01" value={track.pan} onChange={(event)=>onChange(track.id,{pan:Number(event.target.value)})}/></label><div><button className={track.solo?"active":""} onClick={()=>onChange(track.id,{solo:!track.solo})}>S</button><button className={track.muted?"active danger":""} onClick={()=>onChange(track.id,{muted:!track.muted})}>M</button></div></article>})}</div>;
}
function TimelineMarkerView({marker,zoom,onMove,onDelete}:{marker:TimelineMarker;zoom:number;onMove:(timeUs:number)=>void;onDelete:()=>void}){
  const drag=useRef<{x:number;timeUs:number}|undefined>(undefined);return <button className={`timeline-marker ${marker.kind}`} style={{left:(marker.timeUs/SECOND)*PIXELS_PER_SECOND*zoom,"--marker-color":marker.color} as React.CSSProperties} title={`${marker.label} · ${formatTime(marker.timeUs)} · drag to move, double-click to delete`} onDoubleClick={(event)=>{event.stopPropagation();onDelete()}} onPointerDown={(event)=>{event.stopPropagation();drag.current={x:event.clientX,timeUs:marker.timeUs};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerUp={(event)=>{if(!drag.current)return;onMove(Math.max(0,drag.current.timeUs+((event.clientX-drag.current.x)/(PIXELS_PER_SECOND*zoom))*SECOND));drag.current=undefined}}><span/><i/></button>;
}
function Ruler({ durationUs, zoom }: { durationUs: number; zoom: number }) {
  const seconds = Math.ceil(durationUs / SECOND);return <div className="timeline-ruler">{Array.from({length:seconds+1},(_,second)=><span key={second} style={{left:second*PIXELS_PER_SECOND*zoom}}><i/>{second%(zoom<.75?5:2)===0&&<b>{formatTime(second*SECOND).slice(3,8)}</b>}</span>)}</div>;
}
function TrackLane({track,assets,analyses,tool,zoom,selectedItemIds,onSelect,onDropAsset,onMove,onTrim,onProfessionalEdit,onOpenCompound}:{track:Track;assets:MediaAsset[];analyses:Record<string,AudioAnalysis>;tool:TimelineTool;zoom:number;selectedItemIds:string[];onSelect:(item:TimelineItem,additive?:boolean)=>void;onDropAsset:(assetId:string,position:number)=>void;onMove:(itemId:string,position:number,trackId?:string)=>void;onTrim:(itemId:string,edge:"start"|"end",delta:number)=>void;onProfessionalEdit:(tool:TimelineTool,itemId:string,edge:"start"|"end",delta:number)=>void;onOpenCompound:(sequenceId:string)=>void}){
  return <div data-track-id={track.id} className={`track-lane ${track.locked?"locked":""}`} onDragOver={(event)=>{if(!track.locked){event.preventDefault();event.dataTransfer.dropEffect="copy"}}} onDrop={(event)=>{event.preventDefault();const assetId=event.dataTransfer.getData("application/openframe-asset")||event.dataTransfer.getData("text/plain"),asset=assets.find((candidate)=>candidate.id===assetId),compatible=asset&&trackAcceptsAsset(track.kind,asset.kind);if(assetId&&compatible&&!track.locked){const rect=event.currentTarget.getBoundingClientRect();onDropAsset(assetId,((event.clientX-rect.left)/(PIXELS_PER_SECOND*zoom))*SECOND)}}}>{track.items.map((item)=>{const asset=assets.find((value)=>value.id===item.assetId);return <TimelineClip key={item.id} item={item} asset={asset} analysis={analyses[item.assetId]} tool={tool} zoom={zoom} selected={selectedItemIds.includes(item.id)} onSelect={(additive)=>onSelect(item,additive)} onMove={onMove} onTrim={onTrim} onProfessionalEdit={onProfessionalEdit} onOpenCompound={onOpenCompound}/>})}</div>;
}
function TimelineClip({item,asset,analysis,tool,zoom,selected,onSelect,onMove,onTrim,onProfessionalEdit,onOpenCompound}:{item:TimelineItem;asset?:MediaAsset;analysis?:AudioAnalysis;tool:TimelineTool;zoom:number;selected:boolean;onSelect:(additive?:boolean)=>void;onMove:(id:string,position:number,trackId?:string)=>void;onTrim:(id:string,edge:"start"|"end",delta:number)=>void;onProfessionalEdit:(tool:TimelineTool,itemId:string,edge:"start"|"end",delta:number)=>void;onOpenCompound:(sequenceId:string)=>void}){
  const dragStart=useRef<{x:number;start:number}|null>(null);const[dragDeltaUs,setDragDeltaUs]=useState(0);
  function beginDrag(event:React.PointerEvent<HTMLDivElement>){if(event.button!==0||(event.target as HTMLElement).classList.contains("trim-handle"))return;event.preventDefault();event.stopPropagation();onSelect(event.shiftKey||event.ctrlKey||event.metaKey);dragStart.current={x:event.clientX,start:item.startUs};setDragDeltaUs(0);event.currentTarget.setPointerCapture(event.pointerId)}
  function moveDrag(event:React.PointerEvent<HTMLDivElement>){if(dragStart.current)setDragDeltaUs(((event.clientX-dragStart.current.x)/(PIXELS_PER_SECOND*zoom))*SECOND)}
  function endDrag(event:React.PointerEvent<HTMLDivElement>){if(!dragStart.current)return;const deltaUs=((event.clientX-dragStart.current.x)/(PIXELS_PER_SECOND*zoom))*SECOND,startUs=Math.max(0,dragStart.current.start+deltaUs),lane=(document.elementFromPoint(event.clientX,event.clientY) as HTMLElement|null)?.closest<HTMLElement>("[data-track-id]");dragStart.current=null;setDragDeltaUs(0);if(Math.abs(deltaUs)<=1_000&&lane?.dataset.trackId===item.trackId)return;if(tool==="slip"||tool==="slide")onProfessionalEdit(tool,item.id,"end",deltaUs);else if(tool==="select")onMove(item.id,startUs,lane?.dataset.trackId)}
  function beginTrim(event:React.PointerEvent,edge:"start"|"end"){event.preventDefault();event.stopPropagation();onSelect(event.shiftKey||event.ctrlKey||event.metaKey);const origin=event.clientX,target=event.currentTarget as HTMLElement;target.setPointerCapture(event.pointerId);target.onpointerup=(up)=>{const deltaUs=((up.clientX-origin)/(PIXELS_PER_SECOND*zoom))*SECOND;if(Math.abs(deltaUs)>1_000){if(tool==="roll")onProfessionalEdit(tool,item.id,edge,deltaUs);else onTrim(item.id,edge,deltaUs)}target.onpointerup=null}}
  return <div data-item-id={item.id} className={`timeline-clip ${item.kind} tool-${tool} ${selected?"selected":""}`} style={{left:(Math.max(0,item.startUs+(tool==="select"?dragDeltaUs:0))/SECOND)*PIXELS_PER_SECOND*zoom,width:Math.max(24,(item.durationUs/SECOND)*PIXELS_PER_SECOND*zoom)}} onDoubleClick={(event)=>{if(item.compoundSequenceId){event.stopPropagation();onOpenCompound(item.compoundSequenceId)}}} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>{dragStart.current=null;setDragDeltaUs(0)}}><button className="trim-handle left" onPointerDown={(event)=>beginTrim(event,"start")} aria-label="Trim start"/><div className="clip-content"><span>{item.kind==="audio"?<Music2 size={13}/>:item.kind==="image"?<ImageIcon size={13}/>:<Film size={13}/>} {item.name}{item.compoundSequenceId&&<b className="clip-badge compound">compound</b>}{item.linkedItemIds.length>0&&<b className="clip-badge linked">link</b>}{item.keyframes.length>0&&<b className="clip-badge">◆{item.keyframes.length}</b>}{item.effects.length>0&&<b className="clip-badge">fx</b>}{item.reversed&&<b className="clip-badge">rev</b>}</span>{analysis?.peaks.length&&asset?<Waveform analysis={analysis} item={item} asset={asset}/>:null}{asset?.missing&&<small>Offline</small>}</div><button className="trim-handle right" onPointerDown={(event)=>beginTrim(event,"end")} aria-label="Trim end"/></div>;
}
function Waveform({analysis,item,asset}:{analysis:AudioAnalysis;item:TimelineItem;asset:MediaAsset}){const count=64,start=clamp(item.sourceInUs/Math.max(1,asset.durationUs),0,1),end=clamp(item.sourceOutUs/Math.max(1,asset.durationUs),start,1),values=Array.from({length:count},(_,index)=>{const progress=index/(count-1),sourceProgress=item.reversed?end-(end-start)*progress:start+(end-start)*progress,at=Math.min(analysis.peaks.length-1,Math.floor(sourceProgress*analysis.peaks.length));return analysis.peaks[at]??0});return <svg className="real-waveform" viewBox="0 0 128 24" preserveAspectRatio="none" aria-label="Real audio waveform">{values.map((value,index)=><rect key={index} x={index*2} y={12-value*11} width="1.2" height={Math.max(1,value*22)} rx=".5"/>)}</svg>}
function CaptionOverlay({ caption }: { caption: OpenFrameProject["sequence"]["captions"][number] }) {
  const style: React.CSSProperties = { left: caption.style.alignment === "left" ? "8%" : caption.style.alignment === "right" ? "auto" : "50%", right: caption.style.alignment === "right" ? "8%" : "auto", top: `${caption.style.positionY * 100}%`, transform: caption.style.alignment === "center" ? "translate(-50%,-50%)" : "translateY(-50%)", color: caption.style.color, fontFamily: caption.style.fontFamily, fontSize: `${Math.max(12, caption.style.fontSize / 3)}px`, fontWeight: caption.style.fontWeight, textAlign: caption.style.alignment, background: hexAlpha(caption.style.backgroundColor, caption.style.backgroundOpacity), WebkitTextStroke: `${caption.style.strokeWidth / 2}px ${caption.style.strokeColor}`, textShadow: caption.style.shadow ? "0 2px 5px #000" : "none" };
  return <div className="caption-overlay" style={style}>{caption.text}</div>;
}
function trackingOffset(item: TimelineItem, positionUs: number) { if (!item.motionTracking.analyzed || item.motionTracking.points.length < 2) return { x: 0, y: 0 }; const local = positionUs - item.startUs; const first = item.motionTracking.points[0]; const point = item.motionTracking.points.reduce((best, candidate) => Math.abs(candidate.timeUs - local) < Math.abs(best.timeUs - local) ? candidate : best); return { x: point.x - first.x, y: point.y - first.y }; }
function hexAlpha(color: string, opacity: number) { const alpha = Math.round(clamp(opacity, 0, 1) * 255).toString(16).padStart(2, "0"); return `${color}${alpha}`; }
function previewFilter(item: TimelineItem) {
  const advanced = item.advancedColor;
  const brightness = Math.max(.1, 1 + item.brightness + advanced.exposure * .12 + advanced.whites * .12 + advanced.shadows * .08);
  const saturation = Math.max(0, item.saturation + advanced.vibrance * .35);
  const filters = [`brightness(${brightness})`, `contrast(${item.contrast + advanced.highlights * .15 - advanced.fade * .2})`, `saturate(${saturation})`, `sepia(${Math.abs(advanced.temperature) * .18})`, `hue-rotate(${advanced.tint * 16 + advanced.temperature * -8}deg)`];
  if (item.chromaKey.showMask) filters.push("grayscale(1) contrast(8)");
  for (const effect of item.effects) if (effect.enabled) { if (effect.type === "blur") filters.push(`blur(${effect.amount * 18}px)`); if (effect.type === "grayscale") filters.push(`grayscale(${effect.amount})`); if (effect.type === "sharpen") filters.push(`contrast(${1 + effect.amount * .35})`); if (effect.type === "vignette") filters.push(`brightness(${1 - effect.amount * .2})`); }
  return filters.join(" ");
}
function maskStyle(item: TimelineItem): React.CSSProperties {
  if (item.mask.type === "none") return {};
  const cx = 50 + item.mask.x * 50, cy = 50 + item.mask.y * 50, rx = item.mask.width * 50, ry = item.mask.height * 50;
  const feather = Math.max(.1, item.mask.feather * 20);
  if (item.mask.type === "ellipse") {
    const stops = item.mask.inverted ? `transparent ${100 - feather}%, #000 100%` : `#000 ${100 - feather}%, transparent 100%`;
    return { maskImage: `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, ${stops})` };
  }
  const left = cx - rx, right = cx + rx, top = cy - ry, bottom = cy + ry;
  if (!item.mask.inverted) {
    const horizontal = `linear-gradient(to right, transparent ${left - feather}%, #000 ${left + feather}%, #000 ${right - feather}%, transparent ${right + feather}%)`;
    const vertical = `linear-gradient(to bottom, transparent ${top - feather}%, #000 ${top + feather}%, #000 ${bottom - feather}%, transparent ${bottom + feather}%)`;
    return { maskImage: `${horizontal}, ${vertical}`, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
  }
  return { maskImage: `linear-gradient(#000 0 0), linear-gradient(#000 0 0)`, maskSize: `100% 100%, ${item.mask.width * 100}% ${item.mask.height * 100}%`, maskPosition: `0 0, ${cx}% ${cy}%`, maskRepeat: "no-repeat", maskComposite: "exclude", WebkitMaskComposite: "xor" };
}function transitionStyle(item: TimelineItem, positionUs: number) {
  const local = clamp(positionUs - item.startUs, 0, item.durationUs), remaining = item.durationUs - local;
  let opacity = 1, translateX = 0;
  for (const [settings, progress, incoming] of [[item.transitionIn, item.transitionIn.durationUs ? local / item.transitionIn.durationUs : 1, true], [item.transitionOut, item.transitionOut.durationUs ? remaining / item.transitionOut.durationUs : 1, false]] as const) {
    const p = clamp(progress, 0, 1); if (settings.type === "fade") opacity *= p; if (settings.type === "slide-left") translateX -= (1 - p) * 100; if (settings.type === "wipe-left") opacity *= p;
  }
  return { opacity, translateX };
}
function snapTime(timeUs: number, enabled: boolean, project?: OpenFrameProject, playheadUs = 0, excludedIds: string[] = []) {
  const clamped = Math.max(0, timeUs); if (!enabled) return clamped;
  const excluded=new Set(excludedIds), interval=SECOND/2, grid=Math.round(clamped/interval)*interval;
  const candidates=[0,playheadUs,grid,...(project?.sequence.markers.map((marker)=>marker.timeUs)??[]),...(project?.sequence.tracks.flatMap((track)=>track.items.filter((item)=>!excluded.has(item.id)).flatMap((item)=>[item.startUs,item.startUs+item.durationUs]))??[])];
  const nearest=candidates.reduce((best,value)=>Math.abs(value-clamped)<Math.abs(best-clamped)?value:best,grid);
  return Math.abs(nearest-clamped)<=120_000?nearest:grid;
}
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

