/**
 * Game review. Picks up games played in this app, walks them with the engine,
 * and explains what went wrong rather than only marking it.
 *
 * The teaching content is not invented: for a flagged move, the line the engine
 * gives from the position *after* it is the refutation — the concrete way the
 * mistake gets punished — and the line from the position *before* it is what
 * should have been played. Showing both turns "that was a blunder" into
 * "here is what your opponent does to you, and here is what you missed".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import Captured from "../ui/Captured.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import {
  parseFEN, makeMove, legalMoves, uciOf, toSAN, toFEN, inCheck, isMate, START_FEN,
} from "../engine/core.js";
import { parsePGN, mainline } from "../engine/pgn.js";
import { evaluate, stop, listGames, markReviewed, saveBlunders } from "../stockfish/client.js";
import { judgeGame, summarise, KINDS, winPercent } from "./judge.js";
import { play as sfx } from "../ui/sound.js";

const SPEEDS = [
  { name: "Quick", depth: 12, note: "seconds" },
  { name: "Normal", depth: 16, note: "a minute" },
  { name: "Deep", depth: 20, note: "several minutes" },
];

/** Render a UCI line as SAN from a position, for showing refutations. */
function lineToSan(from, pv, max = 6) {
  const out = [];
  let s = from;
  for (const uci of (pv || []).slice(0, max)) {
    const mv = legalMoves(s).find((m) => uciOf(m) === uci);
    if (!mv) break;
    out.push({ san: toSAN(s, mv), white: s.turn === "w", num: s.full });
    s = makeMove(s, mv);
  }
  return out;
}

const sanOf = (pos, uci) => {
  const mv = legalMoves(pos).find((m) => uciOf(m) === uci);
  return mv ? toSAN(pos, mv) : uci;
};

/** Plain-language reading of how far the position moved. */
function swingWords(drop) {
  if (drop >= 40) return "threw the game away";
  if (drop >= 25) return "lost most of your advantage";
  if (drop >= 15) return "handed over a serious edge";
  if (drop >= 8) return "gave up a real chunk";
  return "let a little slip";
}

export default function Review({ openGameId, onOpened, onFiled, onPractise }) {
  const [games, setGames] = useState([]);
  const [pgn, setPgn] = useState("");
  const [game, setGame] = useState(null);
  const [meta, setMeta] = useState(null);      // { id, mySide } when it is one of yours
  const [err, setErr] = useState("");
  const [speed, setSpeed] = useState(1);

  const [evals, setEvals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ply, setPly] = useState(0);
  const [filed, setFiled] = useState(0);
  const [showPaste, setShowPaste] = useState(false);
  const cancelled = useRef(false);
  const autoRan = useRef(false);

  useEffect(() => () => { cancelled.current = true; stop(); }, []);

  const refreshGames = useCallback(() => {
    listGames(40).then(setGames).catch(() => {});
  }, []);
  useEffect(refreshGames, [refreshGames]);

  const positions = useMemo(() => {
    if (!game) return [];
    return [parseFEN(game.start), ...game.line.map((n) => n.after)];
  }, [game]);

  const load = useCallback((text, info = null) => {
    setErr(""); setEvals([]); setProgress(0); setPly(0); setFiled(0);
    autoRan.current = false;
    const trimmed = (text || "").trim();
    if (!trimmed) { setGame(null); setMeta(null); return false; }
    try {
      const t = parsePGN(trimmed);
      const line = mainline(t);
      if (!line.length) {
        setErr(t.errors[0] || "No moves found in that PGN.");
        setGame(null); setMeta(null);
        return false;
      }
      setGame({ headers: t.headers, start: t.start, line });
      setMeta(info);
      return true;
    } catch (e) {
      setErr("Could not read that PGN: " + e.message);
      setGame(null); setMeta(null);
      return false;
    }
  }, []);

  // Play handed us a game: open it straight away.
  useEffect(() => {
    if (openGameId == null) return;
    listGames(40)
      .then((all) => {
        const g = all.find((x) => x.id === openGameId);
        if (g) load(g.pgn, { id: g.id, mySide: g.my_side });
        setGames(all);
        onOpened && onOpened();
      })
      .catch(() => onOpened && onOpened());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGameId]);

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
  const mySide = meta ? meta.mySide : null;
  const mine = judged.filter((j) => j && j.kind && (!mySide || j.mover === mySide));

  /* File the player's own mistakes automatically. Asking first only meant the
     blunder book stayed empty, which is what it was for. */
  useEffect(() => {
    if (!done || !game || filed > 0) return;
    const items = mine
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
    if (!items.length) { setFiled(-1); return; }
    saveBlunders(items)
      .then((n) => { setFiled(n); onFiled && onFiled(); })
      .catch(() => {});
    if (meta) markReviewed(meta.id).then(refreshGames).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const pos = positions[ply] || parseFEN(START_FEN);
  const current = ply > 0 ? judged[ply - 1] : null;
  const flaggedNow = current && current.kind ? current : null;

  const jumpTo = (j) => setPly(j.ply + 1);
  const nextMistake = () => {
    const after = mine.find((j) => j.ply + 1 > ply);
    if (after) setPly(after.ply + 1);
    else if (mine.length) setPly(mine[0].ply + 1);
  };

  /* ---------- game chooser ---------- */
  if (!game) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={card()}>
          <div style={label()}>your games</div>
          <p style={{ fontFamily: MONO, fontSize: 12, color: C.mute, margin: "8px 0 0", lineHeight: 1.7 }}>
            Every game you play under <strong style={{ color: C.ink }}>Play</strong> is saved here.
            Pick one and the engine will walk through it move by move, show you where it went
            wrong, and put those positions into <strong style={{ color: C.ink }}>My Blunders</strong> to
            practise.
          </p>
        </div>

        {games.length === 0 && (
          <div style={card({ marginTop: 12 })}>
            <div style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>No games yet.</div>
            <p style={{ fontFamily: MONO, fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.7 }}>
              Go to <strong style={{ color: C.ink }}>Play</strong>, play a game against the engine, and
              it will appear here the moment it ends — or press "Review this game" mid-game.
            </p>
          </div>
        )}

        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => load(g.pgn, { id: g.id, mySide: g.my_side })}
            style={{
              ...card({ marginTop: 8, cursor: "pointer", width: "100%", textAlign: "left" }),
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>
                {g.white} — {g.black}
              </span>
              <span style={label({ marginLeft: 10 })}>
                {g.moves} moves · {g.result}
              </span>
            </span>
            <span style={label({ color: g.reviewed ? C.green : C.amber })}>
              {g.reviewed ? "reviewed" : "not reviewed"}
            </span>
          </button>
        ))}

        <div style={card({ marginTop: 16 })}>
          <button
            onClick={() => setShowPaste((v) => !v)}
            style={{ ...label({ color: C.ink }), background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            {showPaste ? "− " : "+ "}review a game from somewhere else
          </button>
          {showPaste && (
            <>
              <textarea
                value={pgn}
                onChange={(e) => setPgn(e.target.value)}
                placeholder={'[Event "..."]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
                rows={8}
                style={{
                  width: "100%", marginTop: 10, padding: 10, boxSizing: "border-box",
                  fontFamily: MONO, fontSize: 11, lineHeight: 1.5,
                  border: `1px solid ${C.line}`, borderRadius: 2,
                  background: C.paper, color: C.ink, resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Btn onClick={() => load(pgn)} kind="primary">Load</Btn>
                <label style={{ ...label({ color: C.ink }), border: `1px solid ${C.line}`, padding: "9px 12px", borderRadius: 2, cursor: "pointer" }}>
                  open file
                  <input
                    type="file" accept=".pgn,text/plain" style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => load(String(r.result));
                      r.readAsText(f);
                    }}
                  />
                </label>
              </div>
            </>
          )}
          {err && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red, marginTop: 8 }}>{err}</div>}
        </div>
      </div>
    );
  }

  /* ---------- the review itself ---------- */
  const w = summarise(judged, "w");
  const b = summarise(judged, "b");
  const meSummary = mySide === "w" ? w : mySide === "b" ? b : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "max-content minmax(360px, 440px)", gap: 24, justifyContent: "center", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player={mySide === "b" ? "b" : "w"} />
        <Board
          pos={pos}
          orientation={mySide === "b" ? "black" : "white"}
          interactive={false}
          check={inCheck(pos, pos.turn)}
          mated={isMate(pos) ? pos.turn : null}
          lastMove={ply > 0 ? { from: game.line[ply - 1].uci.slice(0, 2), to: game.line[ply - 1].uci.slice(2, 4) } : null}
          arrows={
            flaggedNow && flaggedNow.bestMove
              ? [
                  { from: flaggedNow.uci.slice(0, 2), to: flaggedNow.uci.slice(2, 4), brush: "red" },
                  { from: flaggedNow.bestMove.slice(0, 2), to: flaggedNow.bestMove.slice(2, 4), brush: "green" },
                ]
              : []
          }
        />
        <Captured pos={pos} player={mySide === "b" ? "w" : "b"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>
                {game.headers.White} — {game.headers.Black}
              </div>
              <div style={label({ marginTop: 3 })}>{game.line.length} moves · {game.headers.Result || "*"}</div>
            </div>
            <Btn onClick={() => { setGame(null); setMeta(null); refreshGames(); }}>back</Btn>
          </div>
        </div>

        {!done && (
          <div style={card()}>
            <div style={label()}>how carefully?</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {SPEEDS.map((sp, i) => (
                <button
                  key={sp.name}
                  onClick={() => setSpeed(i)}
                  disabled={busy}
                  style={{
                    ...label({ color: i === speed ? "#F7F5EF" : C.ink }),
                    background: i === speed ? C.indigo : "transparent",
                    border: `1px solid ${i === speed ? C.indigo : C.line}`,
                    padding: "6px 9px", borderRadius: 2, cursor: busy ? "default" : "pointer",
                  }}
                >
                  {sp.name}
                </button>
              ))}
            </div>
            <div style={label({ marginTop: 6 })}>takes {SPEEDS[speed].note}</div>
            <div style={{ marginTop: 10 }}>
              {!busy
                ? <Btn onClick={run} kind="primary" full>Analyse this game</Btn>
                : <Btn onClick={() => { cancelled.current = true; stop(); }} full>Stop ({progress}%)</Btn>}
            </div>
            {busy && (
              <div style={{ height: 3, background: C.line, marginTop: 10 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: C.indigo, transition: "width 200ms" }} />
              </div>
            )}
          </div>
        )}

        {done && (
          <>
            <div style={card()}>
              <div style={label()}>your report</div>
              {meSummary ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: C.indigo, marginTop: 4 }}>
                    {meSummary.accuracy == null ? "--" : meSummary.accuracy.toFixed(0) + "%"}
                    <span style={label({ marginLeft: 8 })}>accuracy</span>
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                    <Tally n={meSummary.blunders} what="blunders" tone={KINDS.blunder.color} />
                    <Tally n={meSummary.mistakes} what="mistakes" tone={KINDS.mistake.color} />
                    <Tally n={meSummary.inaccuracies} what="inaccuracies" tone={KINDS.inaccuracy.color} />
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", gap: 20, marginTop: 8, fontFamily: MONO, fontSize: 12 }}>
                  <span>White {w.accuracy?.toFixed(0)}% · {w.blunders} blunders</span>
                  <span>Black {b.accuracy?.toFixed(0)}% · {b.blunders} blunders</span>
                </div>
              )}
              {filed > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                  <div style={{ ...label({ color: C.green }) }}>
                    {filed} position{filed === 1 ? "" : "s"} added to My Blunders
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Btn onClick={onPractise} full>Practise them now</Btn>
                  </div>
                </div>
              )}
              {filed === -1 && (
                <div style={{ ...label({ color: C.green, marginTop: 12 }) }}>
                  Nothing serious enough to drill. Well played.
                </div>
              )}
            </div>

            {mine.length > 0 && (
              <div style={card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={label()}>your mistakes</div>
                  <button
                    onClick={nextMistake}
                    style={{ ...label({ color: C.indigo }), background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    next →
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {mine.map((j) => (
                    <button
                      key={j.ply}
                      onClick={() => jumpTo(j)}
                      style={{
                        fontFamily: MONO, fontSize: 11,
                        background: ply === j.ply + 1 ? KINDS[j.kind].color : "transparent",
                        color: ply === j.ply + 1 ? "#F7F5EF" : KINDS[j.kind].color,
                        border: `1px solid ${KINDS[j.kind].color}`,
                        borderRadius: 2, padding: "4px 7px", cursor: "pointer",
                      }}
                    >
                      {Math.floor(j.ply / 2) + 1}. {sanOf(positions[j.ply], j.uci)}{KINDS[j.kind].mark}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {flaggedNow && <Lesson j={flaggedNow} positions={positions} evals={evals} />}
          </>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => setPly(0)}>⏮</Btn>
          <Btn onClick={() => setPly((p) => Math.max(0, p - 1))}>◀</Btn>
          <Btn onClick={() => setPly((p) => Math.min(game.line.length, p + 1))}>▶</Btn>
          <Btn onClick={() => setPly(game.line.length)}>⏭</Btn>
        </div>

        <div style={card({ padding: 0, maxHeight: 220, overflowY: "auto" })}>
          <div style={{ ...label(), padding: "10px 14px 6px" }}>moves</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 4px", padding: "0 12px 12px" }}>
            {game.line.map((node, i) => {
              const j = judged[i];
              const kind = j && j.kind;
              const active = ply === i + 1;
              return (
                <button
                  key={i}
                  onClick={() => setPly(i + 1)}
                  style={{
                    fontFamily: MONO, fontSize: 12,
                    background: active ? C.indigo : "transparent",
                    color: active ? "#F7F5EF" : kind ? KINDS[kind].color : C.ink,
                    fontWeight: kind ? 700 : 400,
                    border: "none", borderRadius: 2, padding: "3px 5px", cursor: "pointer",
                  }}
                >
                  {node.before.turn === "w" && (
                    <span style={{ color: active ? "rgba(247,245,239,.6)" : C.mute }}>{node.before.full}.</span>
                  )}
                  {node.san}{kind ? KINDS[kind].mark : ""}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The explanation panel: what you played, what it costs, and what to do. */
function Lesson({ j, positions, evals }) {
  const before = positions[j.ply];
  const after = positions[j.ply + 1];
  const kind = KINDS[j.kind];

  const played = sanOf(before, j.uci);
  const best = j.bestMove ? sanOf(before, j.bestMove) : null;

  // The engine's line from AFTER the move is exactly how it gets punished.
  const punish = lineToSan(after, evals[j.ply + 1] && evals[j.ply + 1].pv);
  // The line from BEFORE is what should have happened instead.
  const better = lineToSan(before, evals[j.ply] && evals[j.ply].pv);

  const beforePct = Math.round(winPercent(j.bestCp));
  const afterPct = Math.round(winPercent(j.playedCp));

  return (
    <div style={card({ borderColor: kind.color })}>
      <div style={label({ color: kind.color })}>{kind.label}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, marginTop: 6, lineHeight: 1.7 }}>
        You played <strong style={{ color: C.red }}>{played}</strong> and {swingWords(j.drop)} —
        your winning chances went from <strong>{beforePct}%</strong> to <strong>{afterPct}%</strong>.
      </div>

      {punish.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={label()}>why it fails</div>
          <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 4, lineHeight: 1.6, color: C.ink }}>
            {punish.map((m, i) => (
              <span key={i}>
                {m.white && <span style={{ color: C.mute }}>{m.num}.</span>}
                {i === 0 && !m.white && <span style={{ color: C.mute }}>{m.num}…</span>}
                {m.san}{" "}
              </span>
            ))}
          </div>
          <div style={label({ marginTop: 4 })}>your opponent's best continuation</div>
        </div>
      )}

      {best && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
          <div style={label({ color: C.green })}>play this instead</div>
          <div style={{ fontFamily: MONO, fontSize: 15, marginTop: 4, color: C.green, fontWeight: 600 }}>
            {best}
          </div>
          {better.length > 1 && (
            <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 6, lineHeight: 1.6, color: C.mute }}>
              {better.map((m, i) => (
                <span key={i}>
                  {m.white && <span>{m.num}.</span>}
                  {i === 0 && !m.white && <span>{m.num}…</span>}
                  {m.san}{" "}
                </span>
              ))}
            </div>
          )}
          <div style={label({ marginTop: 6 })}>green arrow on the board · red is what you played</div>
        </div>
      )}
    </div>
  );
}

function Tally({ n, what, tone }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: n ? tone : C.mute }}>{n}</div>
      <div style={label()}>{what}</div>
    </div>
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
        opacity: disabled ? 0.4 : 1, flex: full ? 1 : "none", width: full ? "100%" : undefined,
      }}
    >
      {children}
    </button>
  );
}
