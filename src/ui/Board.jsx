/**
 * Chessground wrapper.
 *
 * Chessground owns the DOM inside its container, so React must not re-render
 * its children. We mount once and drive it through the imperative API.
 * Legality comes from our own generator, not from chessground.
 */
import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import { legalMoves, sqName, toFEN } from "../engine/core.js";

/* Chessground wants a Map of origin square -> array of destination squares.
   Kept unexported: Fast Refresh only handles modules whose exports are all
   components, and a stray helper export forces a full reload on every edit. */
function destinations(pos) {
  const dests = new Map();
  for (const m of legalMoves(pos)) {
    const from = sqName(m.from);
    if (!dests.has(from)) dests.set(from, []);
    dests.get(from).push(sqName(m.to));
  }
  return dests;
}

export default function Board({
  pos,
  orientation = "white",
  onMove,
  lastMove = null,
  /* Boolean, or "white"/"black". NOT a square name: chessground resolves the
     king itself, and a key here silently matches no piece, leaving the check
     highlight switched off entirely. */
  check = false,
  interactive = true,
  arrows = [],
  highlight = [],
  /** "w" | "b" — the side that has been mated, which drives the end animation. */
  mated = null,
  size = "var(--board)",
}) {
  const host = useRef(null);
  const api = useRef(null);
  const handler = useRef(onMove);
  handler.current = onMove;

  useEffect(() => {
    if (!host.current) return;
    /* Seed the real position at construction. Chessground otherwise starts from
       the standard opening array and animates across to whatever we set next,
       so every mount showed pieces sliding in and spare knights fading out. */
    api.current = Chessground(host.current, {
      fen: toFEN(pos).split(" ")[0],
      orientation,
      turnColor: pos.turn === "w" ? "white" : "black",
      // Seeded here too, so the first synchronous render already carries the
      // check highlight instead of waiting a frame for the update effect.
      check: check || false,
      coordinates: true,
      addPieceZIndex: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true },
      draggable: { enabled: true, showGhost: true },
      drawable: { enabled: true, visible: true },
      events: {
        move: (from, to) => handler.current && handler.current(from, to),
      },
    });
    return () => {
      api.current && api.current.destroy();
      api.current = null;
    };
    // Mount only: later positions arrive through the update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Callers pass these as inline literals, so compare by value: identity alone
     would re-issue a chessground update on every parent render and interrupt
     piece animations mid-flight. */
  const shapeKey = JSON.stringify([arrows, highlight]);

  useEffect(() => {
    const cg = api.current;
    if (!cg || !pos) return;
    const turn = pos.turn === "w" ? "white" : "black";
    cg.set({
      fen: toFEN(pos).split(" ")[0],
      orientation,
      turnColor: turn,
      check: check || false,
      lastMove: lastMove ? [lastMove.from, lastMove.to] : undefined,
      movable: {
        free: false,
        color: interactive ? turn : undefined,
        dests: interactive ? destinations(pos) : new Map(),
        showDests: true,
      },
      drawable: {
        autoShapes: [
          ...arrows.map((a) => ({ orig: a.from, dest: a.to, brush: a.brush || "green" })),
          ...highlight.map((h) => ({ orig: h.square, brush: h.brush || "yellow" })),
        ],
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, orientation, lastMove, check, interactive, shapeKey]);

  /* The class is absent between games, and removing then re-adding it is what
     restarts the one-shot mate animation. Do NOT key this element off `mated`
     to force that: React would swap the node while chessground still holds a
     ref to the old one, and the board would vanish. */
  const cls =
    "cl-board" +
    (mated ? ` is-mate mate-${mated === "w" ? "white" : "black"}` : "");

  return (
    <div
      className={cls}
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        border: `2px solid #2E3260`,
        boxSizing: "content-box",
        /* Room for the coordinates, which sit outside the board. Generous
           enough that the letters clear the border rather than resting on it. */
        marginLeft: 28,
        marginBottom: 28,
      }}
    >
      <div ref={host} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
