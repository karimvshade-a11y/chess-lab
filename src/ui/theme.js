/* Design tokens carried over from the original build. */
export const C = {
  paper: "#EFEDE6",
  card: "#FBFAF6",
  ink: "#14161C",
  mute: "#6E6B63",
  line: "#D8D3C5",
  indigo: "#2E3260",
  sqL: "#E7E2D5",
  sqD: "#767BA0",
  red: "#A8241C",
  green: "#2C6B4E",
  amber: "#B0791A",
};

export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif';

export const label = (extra = {}) => ({
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.mute,
  ...extra,
});

export const card = (extra = {}) => ({
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 2,
  padding: 14,
  ...extra,
});
