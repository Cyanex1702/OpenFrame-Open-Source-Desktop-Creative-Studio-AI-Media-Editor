import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import type { OpenFrameProject } from "../types/project";
import { syncProjectSequences } from "../lib/project";

interface HistoryState {
  past: OpenFrameProject[];
  present: OpenFrameProject | null;
  future: OpenFrameProject[];
  dirty: boolean;
}

type Action =
  | { type: "open"; project: OpenFrameProject | null }
  | { type: "commit"; project: OpenFrameProject }
  | { type: "undo" }
  | { type: "redo" };

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case "open": return { past: [], present: action.project, future: [], dirty: false };
    case "commit": return state.present
      ? { past: [...state.past.slice(-99), state.present], present: action.project, future: [], dirty: true }
      : { ...state, present: action.project };
    case "undo": {
      const previous = state.past.at(-1);
      return previous && state.present ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], dirty: true } : state;
    }
    case "redo": {
      const next = state.future[0];
      return next && state.present ? { past: [...state.past, state.present], present: next, future: state.future.slice(1), dirty: true } : state;
    }
  }
}

interface EditorContextValue extends HistoryState {
  dispatch: Dispatch<Action>;
  commit: (project: OpenFrameProject) => void;
  open: (project: OpenFrameProject | null) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: null, future: [], dirty: false });
  const commit = useCallback((project: OpenFrameProject) => dispatch({ type: "commit", project: syncProjectSequences(project) }), []);
  const open = useCallback((project: OpenFrameProject | null) => dispatch({ type: "open", project }), []);
  const value = useMemo(() => ({ ...state, dispatch, commit, open }), [state, commit, open]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error("useEditor must be used inside EditorProvider");
  return context;
}
