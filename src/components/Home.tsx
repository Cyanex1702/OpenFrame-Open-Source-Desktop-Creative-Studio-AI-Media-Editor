import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Film, FolderOpen, Palette, Plus, Search, ShieldCheck, Sparkles, X, Plug, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { createDesignProject } from "../lib/design";
import { createProject, presets } from "../lib/project";
import { discardRecovery, openProject, openRecent, recentProjects, recoverableProjects } from "../lib/native";
import type { OpenFrameProject } from "../types/project";
import { Logo } from "./Logo";
import { EcosystemCenter } from "./EcosystemCenter";

export function Home({ onOpen }: { onOpen: (project: OpenFrameProject) => void }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [ecosystem, setEcosystem] = useState(false);
  const [recoveries, setRecoveries] = useState<OpenFrameProject[]>([]);
  useEffect(() => { void recoverableProjects().then(setRecoveries).catch(() => setRecoveries([])); }, []);
  const recents = useMemo(
    () => recentProjects().filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  async function chooseProject() {
    const project = await openProject();
    if (project) onOpen(project);
  }

  return <main className="home-shell">
    <header className="home-header"><Logo /><div className="home-status"><button className="home-ecosystem" onClick={()=>setEcosystem(true)}><Plug size={14}/> Extend & About</button><ShieldCheck size={15} /> Local only <span className="avatar">OF</span></div></header>
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow"><Sparkles size={14} /> YOUR CREATIVE SPACE</span>
        <h1>Make something<br /><em>worth sharing.</em></h1>
        <p>A focused, private video and visual-design workspace with no account, no watermark, and no cloud between you and your work.</p>
        <div className="hero-actions">
          <button className="button primary large" onClick={() => setCreating(true)}><Plus size={18} /> New project</button>
          <button className="button ghost large" onClick={() => void chooseProject()}><FolderOpen size={18} /> Open project</button>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="frame-card back" /><div className="frame-card mid" />
        <div className="frame-card front"><span className="mini-play">▶</span><div className="mini-timeline"><i /><i /><i /></div></div>
        <span className="orbit-dot one" /><span className="orbit-dot two" />
      </div>
    </section>
    {!!recoveries.length && <section className="recovery-section">
      <div className="recovery-heading"><AlertTriangle size={17}/><div><strong>Recovered autosaves</strong><small>OpenFrame found edits saved before the project was closed or interrupted.</small></div></div>
      <div className="recovery-list">{recoveries.map((recovery) => <article key={recovery.id}><div><strong>{recovery.name}</strong><small>{recovery.sequence.name} · {new Date(recovery.modifiedAt).toLocaleString()}</small></div><button className="button primary compact" onClick={() => onOpen(recovery)}><RotateCcw size={13}/> Restore</button><button className="icon-button" title={`Discard recovery for ${recovery.name}`} onClick={() => { void discardRecovery(recovery.id).then(() => setRecoveries((current) => current.filter((item) => item.id !== recovery.id))); }}><Trash2 size={14}/></button></article>)}</div>
    </section>}
    <section className="recent-section">
      <div className="section-title">
        <div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent projects</h2></div>
        <label className="search-field"><Search size={16} /><input placeholder="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {recents.length ? <div className="recent-grid">{recents.map((recent) =>
        <button className="recent-card" key={recent.id} onClick={async () => { const project = await openRecent(recent.id, recent.path); if (project) onOpen(project); }}>
          <div className="recent-thumb"><span>{recent.width} × {recent.height}</span><Film size={20} /></div>
          <strong>{recent.name}</strong><small><Clock3 size={13} /> Edited {new Date(recent.modifiedAt).toLocaleDateString()}</small>
        </button>)}</div> :
        <button className="empty-recent" onClick={() => setCreating(true)}><span className="empty-icon"><Plus size={22} /></span><strong>Your first project starts here</strong><small>Create a video or design project. It stays safely on this computer.</small></button>}
    </section>
    <footer className="home-footer"><span>OpenFrame 0.12.0</span><span>Free • Open source • Local-first</span></footer>
    {ecosystem&&<EcosystemCenter onClose={()=>setEcosystem(false)}/>}
    {creating && <NewProjectModal onClose={() => setCreating(false)} onCreate={(project) => { setCreating(false); onOpen(project); }} />}
  </main>;
}

function NewProjectModal({ onCreate, onClose }: { onCreate: (project: OpenFrameProject) => void; onClose: () => void }) {
  const [name, setName] = useState("My first creation");
  const [preset, setPreset] = useState(presets[0]);
  const [workspace, setWorkspace] = useState<"video" | "design">("video");
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <div className="modal-head"><div><span className="eyebrow">NEW PROJECT</span><h2 id="new-project-title">Choose your frame</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="workspace-kind" role="group" aria-label="Workspace type"><button className={workspace === "video" ? "selected" : ""} onClick={() => setWorkspace("video")}><Film size={18} /><span><strong>Video</strong><small>Timeline editing</small></span></button><button className={workspace === "design" ? "selected" : ""} onClick={() => setWorkspace("design")}><Palette size={18} /><span><strong>Design</strong><small>Pages and graphics</small></span></button></div>
      <label className="field-label">Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="preset-grid">{presets.map((option) =>
        <button className={"preset-card " + (preset.name === option.name ? "selected" : "")} key={option.name} onClick={() => setPreset(option)}>
          <span className="preset-frame" style={{ aspectRatio: option.width + "/" + option.height }} />
          <span><strong>{option.label}</strong><small>{option.width} × {option.height}</small></span>
          {preset.name === option.name && <Check className="preset-check" size={15} />}
        </button>)}</div>
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onCreate(workspace === "design" ? createDesignProject(name, preset) : createProject(name, preset))}>Create {workspace} project</button></div>
    </div>
  </div>;
}