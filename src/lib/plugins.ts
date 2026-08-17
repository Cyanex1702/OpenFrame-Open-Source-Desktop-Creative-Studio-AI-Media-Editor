import type { PluginStatus, PluginTheme } from "../types/plugins";
const EMPTY: PluginStatus = { runtime: "declarative-v1", sdkVersion: 1, directory: "", plugins: [], securitySummary: "Declarative packages only." };
let cache: PluginStatus = EMPTY;
const listeners = new Set<() => void>();
export function pluginSnapshot() { return cache; }
export function setPluginSnapshot(status: PluginStatus) { cache = status; for (const listener of listeners) listener(); }
export function subscribePlugins(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function applyPluginTheme(theme?: PluginTheme, key?: string) {
  const root = document.documentElement;
  const variables: Record<string, string> = { background:"--bg",panel:"--panel",surface:"--surface",border:"--border",text:"--text",muted:"--muted",accent:"--lime",accentSecondary:"--purple" };
  for (const variable of Object.values(variables)) root.style.removeProperty(variable);
  if (theme) for (const [token,value] of Object.entries(theme.tokens)) if (value) root.style.setProperty(variables[token],value);
  if (key) localStorage.setItem("openframe.theme",key); else localStorage.removeItem("openframe.theme");
}
export function restorePluginTheme(status: PluginStatus) {
  const key=localStorage.getItem("openframe.theme"); if(!key)return;
  for(const plugin of status.plugins.filter(value=>value.enabled)){const theme=plugin.package.contributions.themes.find(value=>plugin.package.manifest.id+":"+value.id===key);if(theme){applyPluginTheme(theme,key);return;}}
  applyPluginTheme();
}
