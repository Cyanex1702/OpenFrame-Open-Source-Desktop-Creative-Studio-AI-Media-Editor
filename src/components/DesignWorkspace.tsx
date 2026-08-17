import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Brush, Circle, Copy, Download, Eraser, Film, Frame, Cpu, Image as ImageIcon, MousePointer2, Palette, Plus, RectangleHorizontal, Redo2, Save, Shapes, Star, Text, Trash2, Undo2, Upload } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEditor } from "../store/editor-store";
import { activeDesignPage, builtInTemplates, createDesignObject, createDesignPage, normalizeDesign, templateFromPage, updateDesignPage } from "../lib/design";
import { assetPreviewUrl, browserFilesToAssets, pickAndProbeMedia, pickDesignManifest, removeImageBackground, saveDesignManifest, saveDesignRaster, saveProject } from "../lib/native";
import { addAssetToTimeline, id, touch } from "../lib/project";
import { pluginSnapshot, subscribePlugins } from "../lib/plugins";
import type { CommunityAssetPack, DesignObject, DesignObjectType, DesignPage, DesignTemplate } from "../types/design";
import type { MediaAsset, OpenFrameProject } from "../types/project";
import { DesignCanvasObject, DesignClip } from "./DesignCanvas";
import { DesignCanvasInspector, DesignObjectInspector } from "./DesignInspector";
import { Logo } from "./Logo";
import { ModelCenter } from "./ModelCenter";
import { EcosystemCenter } from "./EcosystemCenter";

type Tool = "select" | "brush" | "eraser";
type Corner = "nw" | "ne" | "sw" | "se";
type DesignInteraction = { id: string; mode: "move" | "resize" | "rotate"; sx: number; sy: number; x: number; y: number; width: number; height: number; rotation: number; corner?: Corner; centerX?: number; centerY?: number; startAngle?: number; group?: Array<{id:string;x:number;y:number}> };
const builtInGraphics = [
  { name: "Fire", glyph: "🔥" }, { name: "Heart", glyph: "❤️" }, { name: "Sparkles", glyph: "✨" }, { name: "Celebration", glyph: "🎉" },
  { name: "Laugh", glyph: "😂" }, { name: "Wow", glyph: "🤯" }, { name: "Thumbs up", glyph: "👍" }, { name: "Eyes", glyph: "👀" },
  { name: "Speech bubble", glyph: "💬" }, { name: "Idea", glyph: "💡" }, { name: "Warning", glyph: "⚠️" }, { name: "Check", glyph: "✅" },
  { name: "Right arrow", glyph: "➜" }, { name: "Curved arrow", glyph: "↪" }, { name: "Star symbol", glyph: "★" }, { name: "Lightning", glyph: "⚡" },
  { name: "LOL meme text", glyph: "LOL" }, { name: "WOW meme text", glyph: "WOW" }, { name: "New badge", glyph: "NEW" }, { name: "Sale badge", glyph: "SALE" },
];
export function DesignWorkspace({ onHome }: { onHome: () => void }) {
  const { present: project, past, future, commit, open, dispatch } = useEditor();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [status, setStatus] = useState("Design workspace ready");
  const [zoom, setZoom] = useState(.72);
  const [models, setModels] = useState(false);
  const [ecosystem, setEcosystem] = useState(false);
  const [, refreshPlugins] = useState(0);
  useEffect(() => subscribePlugins(() => refreshPlugins((value) => value + 1)), []);
  const [format, setFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [brushColor, setBrushColor] = useState("#b9f75a");
  const [brushSize, setBrushSize] = useState(18);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [graphicQuery, setGraphicQuery] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef<{ id: string; points: Array<[number, number]> } | undefined>(undefined);
  const interaction = useRef<DesignInteraction | undefined>(undefined);
  const builtIns = useMemo(builtInTemplates, []);
  const document = project ? normalizeDesign(project.design, project.sequence.width, project.sequence.height) : undefined;
  const page = project && document ? activeDesignPage({ ...project, design: document }) : undefined;
  const selected = page?.objects.find((object) => object.id === selectedId);
  const imageAssets = project?.assets.filter((asset) => asset.kind === "image") ?? [];
  const commitProject = useCallback((next: OpenFrameProject) => commit(touch(next)), [commit]);
  const commitPage = useCallback((next: DesignPage) => project && commit(updateDesignPage(project, next)), [project, commit]);
  const updateObject = useCallback((updated: DesignObject) => page && commitPage({ ...page, objects: page.objects.map((value) => value.id === updated.id ? updated : value) }), [page, commitPage]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("input,textarea,select")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && page && selectedId) { const ids=new Set(selectedIds.length?selectedIds:[selectedId]);commitPage({ ...page, objects: page.objects.filter((value) => !ids.has(value.id)) }); setSelectedId(undefined);setSelectedIds([]); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selected && page) { event.preventDefault(); duplicateObject(selected); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });

  if (!project || !page || !document) return null;

  function addObject(type: DesignObjectType, patch: Partial<DesignObject> = {}) {
    const object = createDesignObject(type, page!, patch); commitPage({ ...page!, objects: [...page!.objects, object] }); setSelectedId(object.id); setSelectedIds([object.id]); setTool("select");
  }
  function duplicateObject(object: DesignObject) {
    const copy = { ...structuredClone(object), id: id("design"), name: object.name + " copy", x: object.x + 24, y: object.y + 24 };
    commitPage({ ...page!, objects: [...page!.objects, copy] }); setSelectedId(copy.id); setSelectedIds([copy.id]);
  }
  async function importImages(files?: File[]) {
    try {
      const assets = files ? (await browserFilesToAssets(files)).filter((asset) => asset.kind === "image") : (await pickAndProbeMedia()).filter((asset) => asset.kind === "image");
      if (!assets.length) { setStatus("Choose an image file"); return; }
      const asset = assets[0], object = createDesignObject("image", page!, { name: asset.name, assetId: asset.id, width: Math.min(page!.width * .55, asset.width ?? 600), height: Math.min(page!.height * .55, asset.height ?? 400) });
      commitProject({ ...project!, assets: [...project!.assets, ...assets], design: { ...document!, pages: document!.pages.map((value) => value.id === page!.id ? { ...page!, objects: [...page!.objects, object] } : value) } });
      setSelectedId(object.id); setSelectedIds([object.id]); setStatus("Imported " + asset.name);
    } catch (error) { setStatus("Image import failed: " + error); }
  }
  async function saveCurrent(saveAs = false) { try { const saved = await saveProject(project!, saveAs); if (saved) { open(saved); setStatus("Project saved"); } } catch (error) { setStatus("Save failed: " + error); } }
  async function exportImage() { if (!svgRef.current) return; setStatus("Rendering " + format.toUpperCase()); try { const path = await saveDesignRaster(svgRef.current, format, page!.name); setStatus(path ? "Exported " + path : "Export cancelled"); } catch (error) { setStatus("Export failed: " + error); } }
  function addPage() { const next = createDesignPage(page!.width, page!.height, "Page " + (document!.pages.length + 1)); commitProject({ ...project!, design: { ...document!, activePageId: next.id, pages: [...document!.pages, next] } }); setSelectedId(undefined); setSelectedIds([]); }
  function duplicatePage() { const copy = { ...structuredClone(page!), id: id("page"), name: page!.name + " copy", objects: page!.objects.map((object) => ({ ...object, id: id("design") })) }; commitProject({ ...project!, design: { ...document!, activePageId: copy.id, pages: [...document!.pages, copy] } }); }
  function deletePage() { if (document!.pages.length === 1) return; const pages = document!.pages.filter((value) => value.id !== page!.id); commitProject({ ...project!, design: { ...document!, activePageId: pages[0].id, pages } }); setSelectedId(undefined); setSelectedIds([]); }
  function applyTemplate(template: DesignTemplate) { const applied = { ...structuredClone(template.page), id: page!.id, name: page!.name, objects: template.page.objects.map((object) => ({ ...object, id: id("design") })) }; commitPage(applied); setSelectedId(undefined); setSelectedIds([]); setStatus("Applied " + template.name); }
  function saveTemplate() { const template = templateFromPage(page!, page!.name); commitProject({ ...project!, design: { ...document!, templates: [...document!.templates, template] } }); void saveDesignManifest(template, template.name, "of-template"); setStatus("Template saved and exported"); }
  async function importManifest() {
    try {
      const text = await pickDesignManifest(); if (!text) return; const value = JSON.parse(text);
      if (value.schemaVersion === 1 && Array.isArray(value.items)) { const pack = value as CommunityAssetPack; commitProject({ ...project!, design: { ...document!, communityPacks: [...document!.communityPacks.filter((item) => item.id !== pack.id), pack] } }); setStatus("Imported community pack " + pack.name); }
      else if (value.page && value.name) { const template = value as DesignTemplate; commitProject({ ...project!, design: { ...document!, templates: [...document!.templates, { ...template, id: id("template"), source: "user" }] } }); setStatus("Imported template " + template.name); }
      else throw new Error("Unsupported manifest schema");
    } catch (error) { setStatus("Import failed: " + error); }
  }
  async function cutout() {
    if (!selected?.assetId) return; const asset = project!.assets.find((value) => value.id === selected.assetId); if (!asset) return; setStatus("Removing background locally");
    try { const path = await removeImageBackground(asset.path, "#00ff00", .25, .08); const nextAsset: MediaAsset = { ...asset, id: id("asset"), name: asset.name.replace(/\.[^.]+$/, "") + " cutout.png", path, codec: "png" }; commitProject({ ...project!, assets: [...project!.assets, nextAsset], design: { ...document!, pages: document!.pages.map((value) => value.id === page!.id ? { ...page!, objects: page!.objects.map((object) => object.id === selected.id ? { ...object, assetId: nextAsset.id, name: nextAsset.name } : object) } : value) } }); setStatus("Background removed; original preserved"); } catch (error) { setStatus("Background removal failed: " + error); }
  }
  function addToVideo() { if (!selected?.assetId) return; const asset = project!.assets.find((value) => value.id === selected.assetId); if (!asset) return; const result = addAssetToTimeline(project!, asset); commitProject({ ...result.project, workspace: "video" }); }
  function favorite(assetId: string) { const ids = project!.favoriteAssetIds.includes(assetId) ? project!.favoriteAssetIds.filter((value) => value !== assetId) : [...project!.favoriteAssetIds, assetId]; commitProject({ ...project!, favoriteAssetIds: ids }); }
  function reorder(idValue: string, direction: -1 | 1) { const objects = [...page!.objects], at = objects.findIndex((value) => value.id === idValue), next = Math.max(0, Math.min(objects.length - 1, at + direction)); if (at !== next) { [objects[at], objects[next]] = [objects[next], objects[at]]; commitPage({ ...page!, objects }); } }
  function point(event: React.PointerEvent<SVGElement>) { const p = svgRef.current!.createSVGPoint(); p.x=event.clientX; p.y=event.clientY; const mapped=p.matrixTransform(svgRef.current!.getScreenCTM()!.inverse()); return { x:mapped.x, y:mapped.y }; }
  function beginInteraction(event: React.PointerEvent<SVGElement>, object: DesignObject, mode: DesignInteraction["mode"], corner?: Corner) {
    event.stopPropagation(); const additive=event.shiftKey||event.ctrlKey||event.metaKey;const group=additive?[...new Set([...selectedIds,object.id])]:(selectedIds.includes(object.id)?selectedIds:[object.id]);setSelectedId(object.id);setSelectedIds(group); if (object.locked || tool !== "select") return;
    event.currentTarget.setPointerCapture(event.pointerId); const p=point(event), centerX=object.x+object.width/2, centerY=object.y+object.height/2;
    interaction.current={id:object.id,mode,sx:p.x,sy:p.y,x:object.x,y:object.y,width:object.width,height:object.height,rotation:object.rotation,corner,centerX,centerY,startAngle:Math.atan2(p.y-centerY,p.x-centerX),group:page!.objects.filter((value)=>group.includes(value.id)).map((value)=>({id:value.id,x:value.x,y:value.y}))};
  }
  function changeInteraction(event: React.PointerEvent<SVGElement>, object: DesignObject) {
    const active=interaction.current; if(!active||active.id!==object.id)return; const p=point(event);
    if(active.mode==="move") { const dx=p.x-active.sx,dy=p.y-active.sy,group=new Map((active.group??[]).map((value)=>[value.id,value]));commitPage({...page!,objects:page!.objects.map((value)=>{const origin=group.get(value.id);return origin?{...value,x:origin.x+dx,y:origin.y+dy}:value})}); return; }
    if(active.mode==="rotate") { const angle=Math.atan2(p.y-active.centerY!,p.x-active.centerX!), raw=active.rotation+(angle-active.startAngle!)*180/Math.PI; updateObject({...object,rotation:event.shiftKey?Math.round(raw/15)*15:raw}); return; }
    let dx=p.x-active.sx,dy=p.y-active.sy; const left=active.corner?.includes("w"),top=active.corner?.includes("n");
    if(event.shiftKey){const ratio=active.width/Math.max(1,active.height);if(Math.abs(dx)>Math.abs(dy)*ratio)dy=Math.sign(dy||dx)*Math.abs(dx)/ratio;else dx=Math.sign(dx||dy)*Math.abs(dy)*ratio;}
    const width=Math.max(24,active.width+(left?-dx:dx)),height=Math.max(24,active.height+(top?-dy:dy));
    updateObject({...object,x:left?active.x+active.width-width:active.x,y:top?active.y+active.height-height:active.y,width,height});
  }
  function endInteraction() { interaction.current=undefined; }
  function drawDown(event: React.PointerEvent<SVGSVGElement>) { if (tool !== "brush") return; const p=point(event), object=createDesignObject("path",page!,{path:`M ${p.x} ${p.y}`,pathColor:brushColor,pathWidth:brushSize,opacity:brushOpacity,x:0,y:0,width:page!.width,height:page!.height}); drawing.current={id:object.id,points:[[p.x,p.y]]}; commitPage({...page!,objects:[...page!.objects,object]}); setSelectedId(object.id); }
  function drawMove(event: React.PointerEvent<SVGSVGElement>) { if (!drawing.current) return; const p=point(event); drawing.current.points.push([p.x,p.y]); const path=drawing.current.points.map(([x,y],i)=>(i?"L":"M")+" "+x.toFixed(1)+" "+y.toFixed(1)).join(" "); const current=activeDesignPage(project!); commitPage({...current,objects:current.objects.map((object)=>object.id===drawing.current!.id?{...object,path}:object)}); }

  const pluginTemplates = pluginSnapshot().plugins.filter((value)=>value.enabled).flatMap((plugin)=>plugin.package.contributions.templates.map((template)=>({...template,id:plugin.package.manifest.id+":"+template.id,source:"community" as const})));
  const allTemplates = [...builtIns, ...document.templates, ...pluginTemplates, ...document.communityPacks.flatMap((pack) => pack.items.filter((item) => item.kind === "template").map((item) => item.data as DesignTemplate))];
  return <div className="design-shell">
    <header className="design-topbar"><div><button className="icon-button" title="Back to Home" onClick={onHome}><ArrowLeft size={17} /></button><Logo /><button className="workspace-switch" onClick={() => commitProject({ ...project, workspace: "video" })}><Film size={14} /> Video</button><button className="workspace-switch active"><Palette size={14} /> Design</button></div><button className="design-title"><strong>{project.name}</strong><small>{page.width} × {page.height} · {document.pages.length} pages</small></button><div><button className="icon-button" disabled={!past.length} onClick={() => dispatch({ type: "undo" })}><Undo2 size={16} /></button><button className="icon-button" disabled={!future.length} onClick={() => dispatch({ type: "redo" })}><Redo2 size={16} /></button><button className="button ghost compact" onClick={() => void saveCurrent()}><Save size={14} /> Save</button><select aria-label="Design export format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select><button className="button primary compact" onClick={() => void exportImage()}><Download size={14} /> Export</button></div></header>
    <div className="design-layout">
      <nav className="design-tools"><Tool active={tool==="select"} label="Select" icon={<MousePointer2 />} onClick={()=>setTool("select")} /><Tool label="Image" icon={<ImageIcon />} onClick={()=>isTauri()?void importImages():fileRef.current?.click()} /><Tool label="Text" icon={<Text />} onClick={()=>addObject("text")} /><Tool label="Rectangle" icon={<RectangleHorizontal />} onClick={()=>addObject("rectangle")} /><Tool label="Ellipse" icon={<Circle />} onClick={()=>addObject("ellipse")} /><Tool label="Star" icon={<Shapes />} onClick={()=>addObject("star")} /><Tool label="Arrow" icon={<ArrowRight />} onClick={()=>addObject("arrow")} /><Tool label="Frame" icon={<Frame />} onClick={()=>addObject("frame",{assetId:imageAssets[0]?.id})} /><Tool active={tool==="brush"} label="Brush" icon={<Brush />} onClick={()=>setTool("brush")} /><Tool active={tool==="eraser"} label="Eraser" icon={<Eraser />} onClick={()=>setTool("eraser")} /><span className="rail-spacer" /><Tool label="Models" icon={<Cpu />} onClick={()=>setModels(true)} /><Tool label="Extend" icon={<Shapes />} onClick={()=>setEcosystem(true)} /></nav>
      <aside className="design-library">
        <section><PanelHead title="Pages" detail="Scene organization" action={<button onClick={addPage}><Plus size={14}/></button>} /><div className="page-tabs">{document.pages.map((value,index)=><button className={value.id===page.id?"active":""} key={value.id} onClick={()=>commitProject({...project,design:{...document,activePageId:value.id}})}><i>{index+1}</i><span>{value.name}</span></button>)}</div><div className="page-actions"><button onClick={duplicatePage}><Copy size={12}/> Duplicate</button><button disabled={document.pages.length===1} onClick={deletePage}><Trash2 size={12}/> Delete</button></div></section>
        <section><PanelHead title="Templates" detail="Open JSON format" action={<button onClick={()=>void importManifest()}><Upload size={13}/></button>} /><div className="template-grid">{allTemplates.map((template)=><button key={template.id} onClick={()=>applyTemplate(template)}><span style={{background:template.page.backgroundColor}}><i/></span><b>{template.name}</b><small>{template.category}</small></button>)}</div><button className="wide-design-action" onClick={saveTemplate}>Save current as template</button></section>
        <section><PanelHead title="Graphics" detail="Searchable, built in" /><input className="graphics-search" aria-label="Search graphics" placeholder="Search emoji, symbols, badges…" value={graphicQuery} onChange={(event)=>setGraphicQuery(event.target.value)} /><div className="graphics-grid">{builtInGraphics.filter((graphic)=>graphic.name.toLowerCase().includes(graphicQuery.toLowerCase())||graphic.glyph.includes(graphicQuery)).map((graphic)=><button key={graphic.name} title={graphic.name} onClick={()=>addObject("text",{name:graphic.name,text:graphic.glyph,fontFamily:graphic.glyph.length<=4?"Segoe UI Emoji":"Arial Black",fontSize:graphic.glyph.length>4?88:128,fontWeight:900,width:Math.min(page.width*.42,420),height:Math.min(page.height*.22,180)})}><span>{graphic.glyph}</span><small>{graphic.name}</small></button>)}</div></section><section><PanelHead title="Assets" detail="Favorite and reuse" /><div className="design-assets">{imageAssets.map((asset)=><article key={asset.id}><button onClick={()=>addObject("image",{name:asset.name,assetId:asset.id})}><img src={assetPreviewUrl(asset)} alt=""/><span>{asset.name}</span></button><button className={project.favoriteAssetIds.includes(asset.id)?"favorite":""} aria-label={"Favorite "+asset.name} onClick={()=>favorite(asset.id)}><Star size={12} fill="currentColor"/></button></article>)}</div></section><input ref={fileRef} hidden type="file" accept="image/*" onChange={(event)=>void importImages(Array.from(event.target.files??[]))}/>
      </aside>
      <main className="design-stage"><div className="design-stage-toolbar"><span role="status">{status}</span><label>Zoom<input aria-label="Design zoom" type="range" min=".2" max="1.4" step=".05" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/></label><b>{Math.round(zoom*100)}%</b></div><div className="design-canvas-wrap"><svg ref={svgRef} className="design-canvas" viewBox={`0 0 ${page.width} ${page.height}`} width={page.width*zoom} height={page.height*zoom} onPointerDown={drawDown} onPointerMove={drawMove} onPointerUp={()=>{drawing.current=undefined}}>
        <defs>{page.objects.map((object)=><DesignClip object={object} key={object.id}/>)}{page.backgroundSecondary&&<linearGradient id="page_gradient" gradientTransform={`rotate(${page.gradientAngle} .5 .5)`}><stop offset="0" stopColor={page.backgroundColor}/><stop offset="1" stopColor={page.backgroundSecondary}/></linearGradient>}</defs><rect width={page.width} height={page.height} fill={page.backgroundSecondary?"url(#page_gradient)":page.backgroundColor}/>
        {page.objects.map((object)=>object.visible&&<DesignCanvasObject key={object.id} object={object} asset={project.assets.find((asset)=>asset.id===object.assetId)} selected={selectedIds.includes(object.id)} handlers={{down:(event)=>{event.stopPropagation();if(tool==="eraser"){commitPage({...page,objects:page.objects.filter((value)=>value.id!==object.id)});return}beginInteraction(event,object,"move")},move:(event)=>changeInteraction(event,object),up:endInteraction,resizeDown:(event,corner)=>beginInteraction(event,object,"resize",corner),rotateDown:(event)=>beginInteraction(event,object,"rotate")}}/>)}</svg></div><div className="page-filmstrip">{document.pages.map((value,index)=><button key={value.id} className={value.id===page.id?"active":""} onClick={()=>commitProject({...project,design:{...document,activePageId:value.id}})}><span>{index+1}</span>{value.name}</button>)}<button onClick={addPage}><Plus size={13}/> Page</button></div></main>
      <aside className="design-inspector"><PanelHead title={selected?.name??"Canvas"} detail={selected?.type??"Page properties"} /><div className="layer-stack"><b>Layers</b>{[...page.objects].reverse().map((object)=><button className={selectedIds.includes(object.id)?"active":""} key={object.id} onClick={(event)=>{const additive=event.shiftKey||event.ctrlKey||event.metaKey;setSelectedId(object.id);setSelectedIds((current)=>additive?[...new Set([...current,object.id])]:[object.id])}}><span>{object.type}</span>{object.name}</button>)}</div>{selected?<DesignObjectInspector object={selected} assets={imageAssets} textStyles={document.textStyles} onChange={updateObject} onDelete={()=>{commitPage({...page,objects:page.objects.filter((value)=>value.id!==selected.id)});setSelectedId(undefined);setSelectedIds([])}} onDuplicate={()=>duplicateObject(selected)} onCutout={()=>void cutout()} onVideo={addToVideo} onReorder={(direction)=>reorder(selected.id,direction)} onSaveTextStyle={()=>{if(selected.type!=="text")return;const style={id:id("text-style"),name:selected.name+" style",fontFamily:selected.fontFamily??"Arial",fontSize:selected.fontSize??72,fontWeight:selected.fontWeight??700,fill:selected.fill,textAlign:selected.textAlign??"center"};commitProject({...project,design:{...document,textStyles:[...document.textStyles,style]}})}}/>:<DesignCanvasInspector page={page} onChange={commitPage}/>} {tool==="brush"&&<section className="brush-controls"><h3>Brush</h3><label>Color<input aria-label="Brush color" type="color" value={brushColor} onChange={(event)=>setBrushColor(event.target.value)}/></label><label>Size<input aria-label="Brush size" type="range" min="1" max="120" value={brushSize} onChange={(event)=>setBrushSize(Number(event.target.value))}/></label><label>Opacity<input aria-label="Brush opacity" type="range" min=".05" max="1" step=".05" value={brushOpacity} onChange={(event)=>setBrushOpacity(Number(event.target.value))}/></label></section>}</aside>
    </div>{models&&<ModelCenter project={project} onProject={commitProject} onClose={()=>setModels(false)}/>} {ecosystem&&<EcosystemCenter onClose={()=>setEcosystem(false)}/>}
  </div>;
}
function Tool({label,icon,active,onClick}:{label:string;icon:React.ReactNode;active?:boolean;onClick:()=>void}){return <button className={active?"active":""} aria-label={label} onClick={onClick}>{icon}<span>{label}</span></button>}
function PanelHead({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){return <div className="design-panel-head"><span><b>{title}</b><small>{detail}</small></span>{action}</div>}
