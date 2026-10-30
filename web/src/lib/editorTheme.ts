import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

export const studioEditorTheme = Prec.highest(
  EditorView.theme({
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "0.8125rem",
    },
    ".cm-content": {
      fontFamily: "var(--font-mono)",
      caretColor: "var(--foreground)",
      lineHeight: "1.6",
    },
    ".cm-gutters": {
      backgroundColor: "var(--secondary)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "var(--studio-row-alt)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--studio-selection)",
    },
    ".cm-cursor": { borderLeftColor: "var(--foreground)" },
    ".cm-panels, .cm-tooltip": {
      backgroundColor: "var(--popover)",
      color: "var(--foreground)",
      borderColor: "var(--input)",
    },
  }),
);
