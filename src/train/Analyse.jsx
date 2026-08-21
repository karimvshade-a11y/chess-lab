/**
 * Analysis board: play or paste any position and watch the local engine think.
 * Multi-PV lines are rendered in SAN against the live position, and the top
 * line's first move is drawn on the board as an arrow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import {
  parseFEN, makeMove, legalMoves, uciOf, toSAN, sqName, toFEN,
  inCheck, isMate, isStalemate, insufficientMaterial, START_FEN,
} from "../engine/core.js";
import { analyse, stop, onProgress, formatScore, scoreToBar } from "../stockfish/client.js";

/* The evaluation in words. A number like "+1.4" means nothing until you know
   it is measured in pawns and which way it points. */
function verdict(line, whiteToMove) {
  if (!line) return { text: "thinking…", tone: null };
  const flip = whiteToMove ? 1 : -1;
  if (line.mate != null) {
    const m = line.mate * flip;
    const who = m > 0 ? "White" : "Black";
    return { text: `${who} mates in ${Math.abs(m)}`, tone: "decisive" };
  }
  const cp = (line.cp ?? 0) * flip;
  const a = Math.abs(cp);
  const who = cp > 0 ? "White" : "Black";
  if (a < 30) return { text: "Dead level", tone: "level" };
  if (a < 90) return { text: `${who} is slightly better`, tone: "slight" };
  if (a < 250) return { text: `${who} is clearly better`, tone: "clear" };
  if (a < 600) return { text: `${who} is winning`, tone: "decisive" };
  return { text: `${who} is completely winning`, tone: "decisive" };
}

const PAWNS = (line, whiteToMove) => {
  if (!line || line.mate != null) return null;
  const cp = (line.cp ?? 0) * (whiteToMove ? 1 : -1);
  const p = Math.abs(cp) / 100;
  if (p < 0.3) return null;
  return `about ${p.toFixed(1)} ${p < 1.5 ? "pawn" : "pawns"} worth of advantage`;
};
import Captured from "../ui/Captured.jsx";
import { playMove } from "../ui/sound.js";

/** Render a UCI principal variation as SAN from a given position. */
function pvToSan(pos, pv, max = 8) {
  const out = [];
  let s = pos;
  for (const uci of pv.slice(0, max)) {
    const mv = legalMoves(s).find((m) => uciOf(m) === uci);
    if (!mv) break;
    out.push({ san: toSAN(s, mv), num: s.turn === "w" ? s.full : null, black: s.turn === "b" && out.length === 0 });
    s = makeMove(s, mv);
  }
  return out;
}

export default function Analyse() {
  const [history, setHistory] = useState(() => [parseFEN(START_FEN)]);
  const [ply, setPly] = useState(0);
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(true);
  const [orientation, setOrientation] = useState("white");
  const [multipv, setMultipv] = useState(3);
  const [lastMove, setLastMove] = useState(null);
  const [fenInput, setFenInput] = useState("");
  const [err, setErr] = useState("");

  const pos = history[ply];

  useEffect(() => onProgress(setLines), []);

  // Restart the search whenever the position or line count changes.
  useEffect(() => {
    setLines([]);
    if (!running) { stop(); return; }
    const over = isMate(pos) || isStalemate(pos) || insufficientMaterial(pos);
    if (over) return;
    analyse(toFEN(pos), { multipv, depth: 26 }).catch((e) => setErr(String(e)));
  }, [pos, multipv, running]);

  const onMove = useCallback(
    (from, to) => {
      const cands = legalMoves(pos).filter((m) => sqName(m.from) === from && sqName(m.to) === to);
      if (!cands.length) return;
      const mv = cands.find((m) => !m.promo || m.promo === "q") || cands[0];
      const next = makeMove(pos, mv);
      setHistory((h) => [...h.slice(0, ply + 1), next]);
      setPly((p) => p + 1);
      setLastMove({ from, to });
      playMove(pos, next, mv, { isMate: isMate(next), inCheck: inCheck(next, next.turn) });
    },
    [pos, ply]
  );

  const jump = (target) => {
    const t = Math.max(0, Math.min(history.length - 1, target));
    setPly(t);
    setLastMove(null);
  };

  const loadFen = () => {
    const text = fenInput.trim();
    if (!text) return;
    try {
      const p = parseFEN(text);
      if (p.board.filter((x) => x && x.t === "k").length !== 2) throw new Error("needs exactly two kings");
      setHistory([p]);
      setPly(0);
      setLastMove(null);
      setErr("");
      setOrientation(p.turn === "w" ? "white" : "black");
    } catch (e) {
      setErr("Bad FEN: " + e.message);
    }
  };

  const top = lines[0];
  const whiteToMove = pos.turn === "w";
  const bar = scoreToBar(top, whiteToMove);

  const arrows = useMemo(() => {
    if (!top || !top.pv.length) return [];
    const u = top.pv[0];
    return [{ from: u.slice(0, 2), to: u.slice(2, 4), brush: "paleBlue" }];
  }, [top]);

  const over = isMate(pos)
    ? `${pos.turn === "w" ? "Black" : "White"} wins by checkmate`
    : isStalemate(pos)
    ? "Stalemate"
    : insufficientMaterial(pos)
    ? "Draw by insufficient material"
    : null;

  const checking = inCheck(pos, pos.turn);
  const topPlayer = orientation === "white" ? "b" : "w";
  const bottomPlayer = orientation === "white" ? "w" : "b";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px max-content var(--panel)", gap: 16, justifyContent: "center", alignItems: "start" }}>
      {/* evaluation bar */}
      <div style={{ height: "var(--board)", width: 26, border: `1px solid ${C.line}`, background: C.ink, position: "relative" }}>
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            height: `${bar * 100}%`, background: "#F4F2EA",
            transition: "height 220ms ease",
          }}
        />
        <div
          style={{
            position: "absolute", left: 0, right: 0, top: "50%",
            borderTop: `1px solid ${C.amber}`, opacity: 0.7,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player={topPlayer} />
        <Board
          pos={pos}
          orientation={orientation}
          onMove={onMove}
          lastMove={lastMove}
          check={checking}
          arrows={arrows}
          mated={isMate(pos) ? pos.turn : null}
        />
        <Captured pos={pos} player={bottomPlayer} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 300 }}>
        <div style={card({ background: C.paper })}>
          <div style={label()}>what this tab is for</div>
          <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.7, margin: "6px 0 0", color: C.ink }}>
            Set up any position — drag pieces on the board or paste a FEN — and the engine tells you
            who stands better and what it would play. The <strong>green arrow</strong> is its first
            choice. Play moves on the board to explore, and use ◀ ▶ to step back and forth.
          </p>
        </div>

        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={label()}>who is better</div>
            <div style={label()}>{top ? `depth ${top.depth}/${top.seldepth}` : running ? "thinking" : "paused"}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, marginTop: 4, color: over ? C.red : C.ink }}>
            {over || verdict(top, whiteToMove).text}
          </div>
          {!over && PAWNS(top, whiteToMove) && (
            <div style={label({ marginTop: 3 })}>{PAWNS(top, whiteToMove)}</div>
          )}
          {!over && (
            <div style={{ display: "flex", gap: 16, marginTop: 10, alignItems: "baseline" }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: C.indigo, fontVariantNumeric: "tabular-nums" }}>
                  {formatScore(top, whiteToMove)}
                </div>
                <div style={label()}>score in pawns</div>
              </div>
              {top && (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {top.depth}
                  </div>
                  <div style={label()}>moves ahead</div>
                </div>
              )}
            </div>
          )}
          {over && <div style={{ fontFamily: MONO, fontSize: 13, color: C.red, marginTop: 6 }}>{over}</div>}
        </div>

        <div style={card({ padding: 0, overflow: "hidden" })}>
          <div style={{ padding: "10px 14px 6px" }}>
            <div style={label()}>what the engine would play</div>
            <div style={label({ fontSize: 9, marginTop: 3, textTransform: "none", letterSpacing: 0 })}>
              best first · the number is who stands better afterwards
            </div>
          </div>
          {lines.length === 0 && (
            <div style={{ padding: "0 14px 12px", fontFamily: MONO, fontSize: 12, color: C.mute }}>
              {over ? "Game over." : "…"}
            </div>
          )}
          {lines.map((l) => {
            const san = pvToSan(pos, l.pv);
            return (
              <div key={l.multipv} style={{ padding: "8px 14px", borderTop: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span
                    style={{
                      fontFamily: MONO, fontSize: 13, fontWeight: 600, minWidth: 52,
                      color: C.indigo, fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatScore(l, whiteToMove)}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                    {san.map((m, i) => (
                      <span key={i}>
                        {m.num ? <span style={{ color: C.mute }}>{m.num}.</span> : null}
                        {m.black ? <span style={{ color: C.mute }}>…</span> : null}
                        {m.san}{" "}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Small onClick={() => jump(0)}>⏮</Small>
          <Small onClick={() => jump(ply - 1)} disabled={ply === 0}>◀</Small>
          <Small onClick={() => jump(ply + 1)} disabled={ply >= history.length - 1}>▶</Small>
          <Small onClick={() => jump(history.length - 1)}>⏭</Small>
          <Small onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>flip</Small>
          <Small onClick={() => setRunning((r) => !r)}>{running ? "pause" : "run"}</Small>
        </div>

        <div style={card()}>
          <div style={label()}>how many options to show</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {[1, 3, 5].map((n) => (
              <Small key={n} onClick={() => setMultipv(n)} active={multipv === n}>
                {n}
              </Small>
            ))}
          </div>
          <div style={label({ marginTop: 12 })}>load position</div>
          <input
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadFen()}
            placeholder="paste FEN, press enter"
            style={{
              width: "100%", marginTop: 6, padding: "8px 10px", boxSizing: "border-box",
              fontFamily: MONO, fontSize: 11, border: `1px solid ${C.line}`,
              borderRadius: 2, background: C.paper, color: C.ink,
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Small onClick={loadFen}>load</Small>
            <Small onClick={() => { setHistory([parseFEN(START_FEN)]); setPly(0); setLastMove(null); setErr(""); }}>
              reset
            </Small>
            <Small onClick={() => navigator.clipboard?.writeText(toFEN(pos))}>copy fen</Small>
          </div>
          {err && <div style={{ fontFamily: MONO, fontSize: 11, color: C.red, marginTop: 8 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

function Small({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...label({ color: active ? "#F7F5EF" : C.ink }),
        background: active ? C.indigo : "transparent",
        border: `1px solid ${active ? C.indigo : C.line}`,
        padding: "7px 10px", borderRadius: 2,
        opacity: disabled ? 0.3 : 1, cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
