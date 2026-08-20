/**
 * Game review: load a PGN, let the local engine walk it, and see where it went
 * wrong. Mistakes can be filed into the blunder book for spaced repetition.
 *
 * One evaluation per position, not two per move: the move played is judged by
 * comparing the position it came from against the position it produced.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Board from "../ui/Board.jsx";
import Captured from "../ui/Captured.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import {
  parseFEN, makeMove, legalMoves, uciOf, toSAN, toFEN, inCheck, isMate, START_FEN,
} from "../engine/core.js";
import { parsePGN, mainline } from "../engine/pgn.js";
import { evaluate, stop } from "../stockfish/client.js";
import { judgeGame, summarise, KINDS, whiteCp } from "./judge.js";
import { play as sfx } from "../ui/sound.js";

const SPEEDS = [
  { name: "Quick", depth: 12, note: "a few seconds" },
  { name: "Normal", depth: 16, note: "under a minute" },
  { name: "Deep", depth: 20, note: "a few minutes" },
];

const fmtEval = (cp) => {
  if (cp >= 9000) return "M";
  if (cp <= -9000) return "-M";
  return (cp > 0 ? "+" : "") + (cp / 100).toFixed(1);
};

export default function Review({ onFiled }) {
  const [pgn, setPgn] = useState("");
  const [game, setGame] = useState(null);
  const [err, setErr] = useState("");
  const [speed, setSpeed] = useState(1);

  const [evals, setEvals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ply, setPly] = useState(0);
  const [filed, setFiled] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; stop(); }, []);

  /* Positions[i] is the position before move i; the last entry is the final
     position, which is why there is always one more of these than moves. */
  const positions = useMemo(() => {
    if (!game) return [];
    const out = [parseFEN(game.start)];
    for (const node of game.line) out.push(node.after);
    return out;
  }, [game]);

  const load = useCallback((text) => {
    setErr("");
    setEvals([]);
    setProgress(0);
    setPly(0);
    setFiled(0);
    const trimmed = text.trim();
    if (!trimmed) { setGame(null); return; }
    try {
      const t = parsePGN(trimmed);
      const line = mainline(t);
      if (!line.length) {
        setErr(t.errors[0] || "No moves found in that PGN.");
        setGame(null);
        return;
      }
      setGame({
        headers: t.headers,
        start: t.start,
        line,
        errors: t.errors,
      });
    } catch (e) {
      setErr("Could not read that PGN: " + e.message);
      setGame(null);
    }
  }, []);

  const run = useCallback(async () => {
    if (!game || busy) return;
    setBusy(true);
    cancelled.current = false;
    const depth = SPEEDS[speed].depth;
    const got = [];
    try {
      for (let i = 0; i < positions.length; i++) {
        if (cancelled.current) break;
        const p = positions[i];
        // A finished position has nothing to search; record it as settled.
        if (isMate(p) || legalMoves(p).length === 0) {
          got.push({ cp: isMate(p) ? -10000 : 0, mate: null, pv: [] });
        } else {
          const { lines } = await evaluate(toFEN(p), { multipv: 1, depth });
          got.push(lines[0] || { cp: 0, mate: null, pv: [] });
        }
        setEvals([...got]);
        setProgress(Math.round(((i + 1) / positions.length) * 100));
      }
      if (!cancelled.current) sfx("correct");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, [game, busy, positions, speed]);

  const judged = useMemo(() => {
    if (!game || evals.length < 2) return [];
    return judgeGame(game.line.map((n) => n.uci), evals, parseFEN(game.start).turn === "w");
  }, [game, evals]);

  const done = game && evals.length === positions.length && positions.length > 0;
  const flagged = judged.filter((j) => j && j.kind);

  const fileAll = async (colour) => {
    const items = flagged
      .filter((j) => (colour ? j.mover === colour : true))
      .map((j) => ({
        fen: toFEN(positions[j.ply]),
        best: j.bestMove || "",
        played: j.uci,
        loss: j.drop,
        kind: j.kind,
        source: `${game.headers.White || "?"} vs ${game.headers.Black || "?"}`,
        mover: j.mover,
      }))
      .filter((i) => i.best);
    if (!items.length) return;
    const n = await invoke("save_blunders", { items });
    setFiled(n);
    onFiled && onFiled();
  };

  const pos = positions[ply] || parseFEN(START_FEN);
  const orientation = "white";
  const current = ply > 0 ? judged[ply - 1] : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player="b" />
        <Board
          pos={pos}
          orientation={orientation}
          interactive={false}
          check={inCheck(pos, pos.turn)}
          mated={isMate(pos) ? pos.turn : null}
          lastMove={
            ply > 0 && game
              ? { from: game.line[ply - 1].uci.slice(0, 2), to: game.line[ply - 1].uci.slice(2, 4) }
              : null
          }
          arrows={
            current && current.kind && current.bestMove
              ? [{ from: current.bestMove.slice(0, 2), to: current.bestMove.slice(2, 4), brush: "green" }]
              : []
          }
        />
        <Captured pos={pos} player="w" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 320 }}>
        {!game && (
          <div style={card()}>
            <div style={label()}>paste a pgn</div>
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
              rows={9}
              style={{
                width: "100%", marginTop: 8, padding: 10, boxSizing: "border-box",
                fontFamily: MONO, fontSize: 11, lineHeight: 1.5,
                border: `1px solid ${C.line}`, borderRadius: 2,
                background: C.paper, color: C.ink, resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <Btn onClick={() => load(pgn)} kind="primary">Load game</Btn>
              <label
                style={{
                  ...label({ color: C.ink }), border: `1px solid ${C.line}`,
                  padding: "9px 12px", borderRadius: 2, cursor: "pointer",
                }}
              >
                open file
                <input
                  type="file"
                  accept=".pgn,text/plain"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => { setPgn(String(r.result)); load(String(r.result)); };
                    r.readAsText(f);
                  }}
                />
              </label>
            </div>
            <p style={{ ...label(), marginTop: 10, lineHeight: 1.7, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
              Export a game from anywhere and paste it here. Nothing leaves the machine.
            </p>
          </div>
        )}

        {err && (
          <div style={card({ borderColor: C.red })}>
            <div style={label({ color: C.red })}>problem</div>
            <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 6 }}>{err}</div>
          </div>
        )}

        {game && (
          <>
            <div style={card()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={label()}>{game.headers.Event || "game"}</div>
                  <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, marginTop: 3 }}>
                    {game.headers.White || "White"} — {game.headers.Black || "Black"}
                  </div>
                  <div style={label({ marginTop: 3 })}>
                    {game.line.length} moves · {game.headers.Result || "*"}
                  </div>
                </div>
                <Btn onClick={() => { setGame(null); setPgn(""); }}>new</Btn>
              </div>

              {!done && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {SPEEDS.map((s, i) => (
                      <button
                        key={s.name}
                        onClick={() => setSpeed(i)}
                        disabled={busy}
                        style={{
                          ...label({ color: i === speed ? "#F7F5EF" : C.ink }),
                          background: i === speed ? C.indigo : "transparent",
                          border: `1px solid ${i === speed ? C.indigo : C.line}`,
                          padding: "6px 9px", borderRadius: 2,
                          cursor: busy ? "default" : "pointer", opacity: busy ? 0.4 : 1,
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div style={label({ marginTop: 6 })}>
                    depth {SPEEDS[speed].depth} · {SPEEDS[speed].note}
                  </div>

                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {!busy && <Btn onClick={run} kind="primary" full>Analyse game</Btn>}
                    {busy && (
                      <Btn onClick={() => { cancelled.current = true; stop(); }} full>
                        Stop ({progress}%)
                      </Btn>
                    )}
                  </div>
                  {busy && (
                    <div style={{ height: 3, background: C.line, marginTop: 10 }}>
                      <div style={{ height: "100%", width: `${progress}%`, background: C.indigo, transition: "width 200ms" }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {done && (
              <div style={card()}>
                <div style={label()}>report</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "6px 12px", marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
                  <span />
                  <span style={label()}>white</span>
                  <span style={label()}>black</span>
                  {[
                    ["accuracy", (s) => (s.accuracy == null ? "--" : s.accuracy.toFixed(1) + "%")],
                    ["blunders", (s) => s.blunders],
                    ["mistakes", (s) => s.mistakes],
                    ["inaccuracies", (s) => s.inaccuracies],
                  ].map(([name, get]) => (
                    <Row key={name} name={name} w={get(summarise(judged, "w"))} b={get(summarise(judged, "b"))} />
                  ))}
                </div>

                {flagged.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <Btn onClick={() => fileAll("w")}>file white's</Btn>
                    <Btn onClick={() => fileAll("b")}>file black's</Btn>
                  </div>
                )}
                {filed > 0 && (
                  <div style={{ ...label({ color: C.green }), marginTop: 8 }}>
                    {filed} filed for review
                  </div>
                )}
              </div>
            )}

            <div style={card({ padding: 0, maxHeight: 340, overflowY: "auto" })}>
              <div style={{ ...label(), padding: "10px 14px 6px" }}>moves</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 4px", padding: "0 12px 12px" }}>
                {game.line.map((node, i) => {
                  const j = judged[i];
                  const kind = j && j.kind;
                  const tone = kind ? KINDS[kind].color : C.ink;
                  const active = ply === i + 1;
                  return (
                    <button
                      key={i}
                      onClick={() => setPly(i + 1)}
                      title={
                        j
                          ? `${fmtEval(whiteCp(evals[i], node.before.turn === "w"))} → ${fmtEval(
                              whiteCp(evals[i + 1], node.after.turn === "w")
                            )}${kind ? `  ${KINDS[kind].label}, best was ${j.bestMove}` : ""}`
                          : undefined
                      }
                      style={{
                        fontFamily: MONO, fontSize: 12,
                        background: active ? C.indigo : "transparent",
                        color: active ? "#F7F5EF" : tone,
                        fontWeight: kind ? 700 : 400,
                        border: "none", borderRadius: 2, padding: "3px 5px", cursor: "pointer",
                      }}
                    >
                      {node.before.turn === "w" && (
                        <span style={{ color: active ? "rgba(247,245,239,.6)" : C.mute }}>
                          {node.before.full}.
                        </span>
                      )}
                      {node.san}
                      {kind ? KINDS[kind].mark : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <Btn onClick={() => setPly(0)}>⏮</Btn>
              <Btn onClick={() => setPly((p) => Math.max(0, p - 1))}>◀</Btn>
              <Btn onClick={() => setPly((p) => Math.min(game.line.length, p + 1))}>▶</Btn>
              <Btn onClick={() => setPly(game.line.length)}>⏭</Btn>
            </div>

            {current && current.kind && (
              <div style={card({ borderColor: KINDS[current.kind].color })}>
                <div style={label({ color: KINDS[current.kind].color })}>
                  {KINDS[current.kind].label} · {current.drop.toFixed(0)}% win chance lost
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13, marginTop: 6 }}>
                  Better was{" "}
                  <strong>
                    {(() => {
                      const from = positions[current.ply];
                      const mv = legalMoves(from).find((m) => uciOf(m) === current.bestMove);
                      return mv ? toSAN(from, mv) : current.bestMove;
                    })()}
                  </strong>
                  <span style={{ color: C.mute }}> (shown in green)</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ name, w, b }) {
  return (
    <>
      <span style={label()}>{name}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{w}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{b}</span>
    </>
  );
}

function Btn({ children, onClick, kind = "quiet", full, disabled }) {
  const styles = {
    primary: { background: C.indigo, color: "#F7F5EF", border: `1px solid ${C.indigo}` },
    quiet: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, ...label({ color: styles.color }),
        padding: "9px 12px", borderRadius: 2, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1, flex: full ? 1 : "none",
      }}
    >
      {children}
    </button>
  );
}
