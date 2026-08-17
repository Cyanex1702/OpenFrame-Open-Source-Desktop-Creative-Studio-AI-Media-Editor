import { DesignWorkspace } from "./components/DesignWorkspace";
import { Editor } from "./components/Editor";
import { Home } from "./components/Home";
import { useEffect } from "react";
import { autosaveProject, getPluginStatus } from "./lib/native";
import { restorePluginTheme, setPluginSnapshot } from "./lib/plugins";
import { useEditor } from "./store/editor-store";

export default function App() {
  const { present, open, dirty } = useEditor();
  useEffect(() => { void getPluginStatus().then((status) => { setPluginSnapshot(status); restorePluginTheme(status); }); }, []);
  useEffect(() => {
    if (!present || !dirty) return;
    const timer = window.setTimeout(() => { void autosaveProject(present).catch(() => undefined); }, 1500);
    return () => window.clearTimeout(timer);
  }, [present, dirty]);
  if (!present) return <Home onOpen={open} />;
  return present.workspace === "design"
    ? <DesignWorkspace onHome={() => open(null)} />
    : <Editor onHome={() => open(null)} />;
}
