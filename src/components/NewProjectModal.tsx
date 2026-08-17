import { useState } from "react";
import { Check, X } from "lucide-react";
import { createProject, presets } from "../lib/project";
import type { OpenFrameProject, ProjectPreset } from "../types/project";

export function NewProjectModal({ onCreate, onClose }: { onCreate: (project: OpenFrameProject) => void; onClose: () => void }) {
  const [name, setName] = useState("My first film");
  const [selected, setSelected] = useState<ProjectPreset>(presets[0]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <div className="modal-head">
        <div><span className="eyebrow">NEW PROJECT</span><h2 id="new-project-title">Choose your frame</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <label className="field-label">Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="preset-grid">
        {presets.map((preset) => <button key={preset.name} className={`preset-card ${selected.name === preset.name ? "selected" : ""}`} onClick={() => setSelected(preset)}>
          <span className="preset-frame" style={{ aspectRatio: `${preset.width}/${preset.height}` }} />
          <span><strong>{preset.label}</strong><small>{preset.width} × {preset.height}</small></span>
          {selected.name === preset.name && <Check className="preset-check" size={15} />}
        </button>)}
      </div>
      <div className="modal-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" onClick={() => onCreate(createProject(name, selected))}>Create project</button></div>
    </div>
  </div>;
}

