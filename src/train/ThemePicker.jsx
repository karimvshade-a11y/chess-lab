/**
 * Theme filter for the puzzle trainer.
 *
 * Sorted by your own accuracy rather than by how many puzzles exist, so the
 * themes you keep failing sit at the top where you will actually pick them.
 */
import { useEffect, useMemo, useState } from "react";
import { C, MONO, label, card } from "../ui/theme.js";
import { puzzleThemes, themeAccuracy } from "../stockfish/client.js";
import { prettyTheme as pretty } from "./themes.js";

/* Tags describing difficulty or phase rather than a tactical idea; useless as
   a training filter. */
const NOT_A_THEME = new Set([
  "short", "long", "veryLong", "oneMove", "crushing", "advantage", "equality",
  "master", "masterVsMaster", "superGM", "opening", "middlegame", "endgame",
  "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5",
]);

export const prettyTheme = pretty;

export default function ThemePicker({ value, onChange }) {
  const [themes, setThemes] = useState([]);
  const [acc, setAcc] = useState({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    puzzleThemes().then(setThemes).catch(() => {});
    themeAccuracy()
      .then((rows) => {
        const m = {};
        for (const [t, tries, ok] of rows) m[t] = { tries, ok };
        setAcc(m);
      })
      .catch(() => {});
  }, []);

  const list = useMemo(() => {
    const usable = themes.filter(([t, n]) => !NOT_A_THEME.has(t) && n >= 40);
    return usable
      .map(([t, n]) => {
        const a = acc[t];
        const rate = a && a.tries >= 3 ? a.ok / a.tries : null;
        return { theme: t, count: n, rate, tries: a ? a.tries : 0 };
      })
      .sort((x, y) => {
        // Weakest first, then anything untested, then the rest by size.
        if (x.rate == null && y.rate == null) return y.count - x.count;
        if (x.rate == null) return 1;
        if (y.rate == null) return -1;
        return x.rate - y.rate;
      });
  }, [themes, acc]);

  const current = list.find((l) => l.theme === value);

  return (
    <div style={card()}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer",
        }}
      >
        <span style={label()}>theme</span>
        <span style={label({ color: C.ink })}>{open ? "close" : "change"}</span>
      </button>

      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, marginTop: 4 }}>
        {value ? prettyTheme(value) : "Everything"}
      </div>
      {current && current.rate != null && (
        <div style={label({ marginTop: 3, color: current.rate < 0.6 ? C.red : C.mute })}>
          {Math.round(current.rate * 100)}% solved over {current.tries}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10, maxHeight: 300, overflowY: "auto", borderTop: `1px solid ${C.line}` }}>
          <Row
            name="Everything"
            active={!value}
            onClick={() => { onChange(null); setOpen(false); }}
          />
          {list.map((l) => (
            <Row
              key={l.theme}
              name={prettyTheme(l.theme)}
              count={l.count}
              rate={l.rate}
              active={l.theme === value}
              onClick={() => { onChange(l.theme); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ name, count, rate, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        width: "100%", textAlign: "left", cursor: "pointer",
        background: active ? C.paper : "transparent",
        border: "none", borderLeft: `2px solid ${active ? C.amber : "transparent"}`,
        padding: "7px 8px", fontFamily: MONO, fontSize: 12,
        color: active ? C.ink : C.mute,
      }}
    >
      <span style={{ color: active ? C.ink : C.ink }}>{name}</span>
      <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        {rate != null && (
          <span style={{ color: rate < 0.6 ? C.red : rate > 0.85 ? C.green : C.mute, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(rate * 100)}%
          </span>
        )}
        {count != null && <span style={{ color: C.mute, fontSize: 10 }}>{count}</span>}
      </span>
    </button>
  );
}
