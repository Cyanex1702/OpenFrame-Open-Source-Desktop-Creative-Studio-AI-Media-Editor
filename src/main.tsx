import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { EditorProvider } from "./store/editor-store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><EditorProvider><App /></EditorProvider></StrictMode>);
