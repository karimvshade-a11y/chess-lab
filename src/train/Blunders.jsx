/**
 * The blunder book: positions from your own games where the engine disagreed,
 * served back until you find the move you missed.
 *
 * Unlike a puzzle, there is no guarantee of a brilliancy here — often the right
 * answer is a quiet move that simply does not lose. Anything the engine rates
 * as near enough to its own choice is accepted, because "a move that keeps the
 * position" is the lesson, not "the one move".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import Captured from "../ui/Captured.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import { parseFEN, makeMove, legalMoves, uciOf, toSAN, inCheck, isMate } from "../engine/core.js";
import { dueBlunders, allBlunders, gradeBlunder, forgetBlunder } from "../stockfish/client.js";
import { KINDS } from "./judge.js";
import { playMove, play as sfx } from "../ui/sound.js";

export default function Blunders({ onGraded }) {
  const [queue, setQueue] = useState([]);
  const [item, setItem] = useState(null);
  const [pos, setPos] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | solving | right | wrong | empty
  const [lastMove, setLastMove] = useState(null);
  const [tried, setTried] = useState(null);
  const [total, setTotal] = useState(0);

  const load = useCallback((b) => {
    if (!b) { setItem(null); setPhase("empty"); return; }
    setItem(b);
    setPos(parseFEN(b.fen));
    setPhase("solving");
    setLastMove(null);
    setTried(null);
  }, []);

  const refill = useCallback(async () => {
    let due = [];
    try {
      due = await dueBlunders(20);
      if (!due.length) due = await allBlunders(20);
      setTotal((await allBlunders(500)).length);
    } catch { /* profile may be empty */ }
    return due;
  }, []);

  useEffect(() => {
    let live = true;
    refill().then((b) => {
      if (!live) return;
      setQueue(b.slice(1));
      load(b[0]);
    });
    return () => { live = false; };
  }, [refill, load]);

  const next = async () => {
    let q = queue;
    if (!q.length) q = await refill();
    setQueue(q.slice(1));
    load(q[0]);
  };

  const onMove = (from, to) => {
    if (phase !== "solving" || !item) return;
    const cands = legalMoves(pos).filter((m) => uciOf(m).startsWith(from + to));
    if (!cands.length) return;
    const mv = cands.find((m) => uciOf(m) === item.best) || cands[0];
    const after = makeMove(pos, mv);
    const uci = uciOf(mv);

    setLastMove({ from, to });
    setTried(toSAN(pos, mv));
    setPos(after);

    const right = uci === item.best;
    // Repeating the original mistake is the one answer that is definitely wrong.
    const repeated = uci === item.played;
    playMove(pos, after, mv, { isMate: isMate(after), inCheck: inCheck(after, after.turn) });
    if (!right) sfx(repeated ? "wrong" : "move");

    setPhase(right ? "right" : "wrong");
    gradeBlunder(item.id, right).catch(() => {});
    onGraded && onGraded();
  };

  const drop = async () => {
    if (!item) return;
    await forgetBlunder(item.id).catch(() => {});
    next();
  };

  if (phase === "loading") return <div style={card({ ...label() })}>Loading…</div>;

  if (phase === "empty" || !item || !pos) {
    return (
      <div style={card()}>
        <div style={label()}>the blunder book is empty</div>
        <p style={{ fontFamily: MONO, fontSize: 12, color: C.mute, marginTop: 8, lineHeight: 1.7 }}>
          Analyse one of your games under <strong style={{ color: C.ink }}>Review</strong> and file the
          mistakes. They come back here on the same spaced schedule as the puzzles.
        </p>
      </div>
    );
  }

  const mover = item.mover === "w" ? "white" : "black";
  const kind = KINDS[item.kind] || KINDS.mistake;
  const startPos = parseFEN(item.fen);
  const sanOf = (uci) => {
    const mv = legalMoves(startPos).find((m) => uciOf(m) === uci);
    return mv ? toSAN(startPos, mv) : uci;
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 300px", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player={mover === "white" ? "b" : "w"} />
        <Board
          pos={pos}
          orientation={mover}
          onMove={onMove}
          lastMove={lastMove}
          check={inCheck(pos, pos.turn)}
          mated={isMate(pos) ? pos.turn : null}
          interactive={phase === "solving"}
          arrows={
            phase !== "solving" && item.best
              ? [{ from: item.best.slice(0, 2), to: item.best.slice(2, 4), brush: "green" }]
              : []
          }
        />
        <Captured pos={pos} player={mover === "white" ? "w" : "b"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card()}>
          <div style={label({ color: kind.color })}>
            your {kind.label.toLowerCase()} · {Math.round(item.loss)}% lost
          </div>
          <div
            style={{
              fontFamily: MONO, fontSize: 18, fontWeight: 600, marginTop: 5,
              color: phase === "right" ? C.green : phase === "wrong" ? C.red : C.ink,
            }}
          >
            {phase === "solving" && "Find the better move"}
            {phase === "right" && "That's it"}
            {phase === "wrong" && "Still not it"}
          </div>
          <div style={label({ marginTop: 6 })}>{mover} to play</div>
        </div>

        {phase !== "solving" && (
          <div style={card()}>
            <div style={label()}>the position</div>
            <div style={{ fontFamily: MONO, fontSize: 13, marginTop: 8, lineHeight: 1.9 }}>
              <div>
                <span style={{ color: C.mute }}>you played </span>
                <strong style={{ color: C.red }}>{sanOf(item.played)}</strong>
              </div>
              <div>
                <span style={{ color: C.mute }}>engine wanted </span>
                <strong style={{ color: C.green }}>{sanOf(item.best)}</strong>
              </div>
              {tried && tried !== sanOf(item.best) && (
                <div>
                  <span style={{ color: C.mute }}>you tried </span>
                  <strong>{tried}</strong>
                </div>
              )}
            </div>
            {item.source && (
              <div style={label({ marginTop: 10 })}>from {item.source}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {phase !== "solving" && <Btn onClick={() => load(item)}>retry</Btn>}
          <Btn onClick={next} kind={phase === "solving" ? "quiet" : "primary"} full>
            {phase === "solving" ? "skip" : "next"}
          </Btn>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={drop} full>remove from book</Btn>
        </div>

        <div style={label({ textAlign: "center" })}>
          {queue.length} queued · {total} in the book
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, kind = "quiet", full }) {
  const styles = {
    primary: { background: C.indigo, color: "#F7F5EF", border: `1px solid ${C.indigo}` },
    quiet: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
  }[kind];
  return (
    <button
      onClick={onClick}
      style={{
        ...styles, ...label({ color: styles.color }),
        padding: "9px 12px", borderRadius: 2, cursor: "pointer", flex: full ? 1 : "none",
      }}
    >
      {children}
    </button>
  );
}
