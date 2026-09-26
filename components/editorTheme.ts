export const MONADLENS_THEME = "monadlens-dark";

type MonacoLike = {
  editor: { defineTheme(name: string, data: unknown): void };
};

/** Monaco theme matching the page surfaces; safe to call more than once. */
export function defineMonadLensTheme(monaco: MonacoLike) {
  monaco.editor.defineTheme(MONADLENS_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "B6A8FF" },
      { token: "comment", foreground: "6E6980" },
      { token: "number", foreground: "F5C98B" },
      { token: "string", foreground: "9BE3C8" },
    ],
    colors: {
      "editor.background": "#100E17",
      "editorGutter.background": "#100E17",
      "editor.lineHighlightBackground": "#1A172680",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#4F4A63",
      "editorLineNumber.activeForeground": "#A996FF",
      "editorCursor.foreground": "#A996FF",
      "editor.selectionBackground": "#836EF944",
      "editor.inactiveSelectionBackground": "#836EF922",
      "editorIndentGuide.background1": "#221F2E",
      "editorWidget.background": "#1A1726",
      "editorWidget.border": "#2A2638",
      "editorHoverWidget.background": "#1A1726",
      "editorHoverWidget.border": "#2A2638",
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff24",
      "diffEditor.insertedTextBackground": "#5EE3C122",
      "diffEditor.removedTextBackground": "#FF7A8522",
    },
  });
}
