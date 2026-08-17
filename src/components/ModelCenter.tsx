import { useEffect, useState } from "react";
import { CheckCircle2, Cpu, Download, ExternalLink, HardDrive, ShieldCheck, Trash2, X } from "lucide-react";
import { downloadModel, getModelCenterStatus, openDependencyPage, pickAndInstallWhisperRuntime, removeModel, type ModelCenterStatus } from "../lib/native";
import type { OpenFrameProject } from "../types/project";

export function ModelCenter({ project, onProject, onClose }: { project?: OpenFrameProject; onProject?: (project: OpenFrameProject) => void; onClose: () => void }) {
  const [center, setCenter] = useState<ModelCenterStatus>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("Optional downloads only. Nothing is fetched without your click.");
  const refresh = async () => setCenter(await getModelCenterStatus());
  useEffect(() => { void refresh().catch((error) => setMessage(String(error))); }, []);

  async function install(modelId: string) {
    setBusy(modelId); setMessage("Downloading and verifying the selected model…");
    try {
      const path = await downloadModel(modelId);
      if (project && onProject) onProject({ ...project, settings: { ...project.settings, transcriptionModelPath: path } });
      await refresh(); setMessage("Model installed and checksum verified.");
    } catch (error) { setMessage("Model installation failed: " + error); }
    finally { setBusy(undefined); }
  }
  async function uninstall(modelId: string) {
    setBusy(modelId);
    try { await removeModel(modelId); await refresh(); setMessage("Model removed."); }
    catch (error) { setMessage("Could not remove model: " + error); }
    finally { setBusy(undefined); }
  }
  async function installRuntime() {
    setBusy("runtime");
    try { const path = await pickAndInstallWhisperRuntime(); if (path) { await refresh(); setMessage("whisper.cpp runtime installed."); } }
    catch (error) { setMessage("Runtime installation failed: " + error); }
    finally { setBusy(undefined); }
  }

  return <div className="model-center-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <section className="model-center" role="dialog" aria-modal="true" aria-labelledby="model-center-title">
      <header><div><span className="eyebrow">LOCAL & OPTIONAL</span><h2 id="model-center-title">Models & dependencies</h2><p>Preview choices, download verified models, or open the official runtime page. Your media never leaves this computer.</p></div><button className="icon-button" aria-label="Close model center" onClick={onClose}><X size={18} /></button></header>
      <div className="dependency-strip">
        <article><HardDrive size={18} /><div><strong>FFmpeg + FFprobe</strong><small>Bundled with OpenFrame</small></div><b className="installed"><CheckCircle2 size={13} /> Ready</b></article>
        <article><Cpu size={18} /><div><strong>whisper.cpp runtime</strong><small>{center?.dependencies.whisperRuntimeInstalled ? "Installed locally" : "Required for automatic captions"}</small></div>{center?.dependencies.whisperRuntimeInstalled ? <b className="installed"><CheckCircle2 size={13} /> Ready</b> : <span className="runtime-actions"><button onClick={() => void openDependencyPage(center?.dependencies.whisperReleasePage ?? "https://github.com/ggml-org/whisper.cpp/releases")}><ExternalLink size={12} /> Official releases</button><button disabled={busy === "runtime"} onClick={() => void installRuntime()}>Choose downloaded EXE</button></span>}</article>
      </div>
      <div className="model-security"><ShieldCheck size={17} /><span><strong>Verified before installation</strong><small>Downloads use the official whisper.cpp Hugging Face repository and must match the published SHA-1. Partial or mismatched files are removed.</small></span></div>
      <div className="model-grid">
        {center?.models.map((model) => <article className={"model-card " + (model.installed ? "ready" : "")} key={model.id}>
          <div className="model-preview"><Cpu size={25} /><span>{model.quality}</span></div>
          <div className="model-copy"><span className="model-language">{model.language}</span><h3>{model.name}</h3><p>{model.purpose}</p><dl><div><dt>Size</dt><dd>{formatBytes(model.sizeBytes)}</dd></div><div><dt>License</dt><dd>{model.license}</dd></div><div><dt>Version</dt><dd>{model.version}</dd></div></dl><code title={model.sha1}>SHA-1 {model.sha1.slice(0, 12)}…</code></div>
          <div className="model-actions">{model.installed ? <><button className="model-use" onClick={() => project && onProject?.({ ...project, settings: { ...project.settings, transcriptionModelPath: model.installedPath } })}><CheckCircle2 size={13} /> Use for captions</button><button aria-label={"Remove " + model.name} disabled={busy === model.id} onClick={() => void uninstall(model.id)}><Trash2 size={13} /></button></> : <button className="model-download" disabled={!!busy} onClick={() => void install(model.id)}><Download size={13} /> {busy === model.id ? "Downloading…" : "Download & verify"}</button>}<button title="Open official model source" onClick={() => void openDependencyPage(model.sourceUrl)}><ExternalLink size={13} /></button></div>
        </article>) ?? <div className="model-loading">Reading local model inventory…</div>}
      </div>
      <footer><span role="status">{message}</span><button onClick={() => void openDependencyPage(center?.dependencies.modelsPage ?? "https://huggingface.co/ggerganov/whisper.cpp")}><ExternalLink size={12} /> Browse official model files</button></footer>
    </section>
  </div>;
}
function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + " GB" : Math.round(bytes / 1024 ** 2) + " MB"; }
