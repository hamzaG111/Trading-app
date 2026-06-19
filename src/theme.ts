// Design tokens for the AURUM look: deep black canvas, metallic gold accents.
// Shared between CSS (via :root variables in index.css) and JS (charts).
export const theme = {
  bg: "#0a0a0b",
  panel: "#121214",
  panelAlt: "#17171a",
  border: "rgba(212, 175, 55, 0.14)",
  borderSoft: "rgba(255, 255, 255, 0.06)",
  text: "#ededed",
  textMuted: "#9b9b9b",
  gold: "#d4af37",
  goldBright: "#f0d066",
  goldDeep: "#9c7a1e",
  green: "#3fbf7f",
  red: "#e5484d",
  blue: "#5b8def",
} as const;

export type Theme = typeof theme;
