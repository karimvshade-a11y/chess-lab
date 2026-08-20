/**
 * Play against the local engine at a chosen strength.
 *
 * Stockfish's UCI_Elo bottoms out at 1320, so weaker settings are reached by
 * capping search time as well. The point of this mode is a sparring partner
 * that is beatable but never random.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import {
  parseFEN, makeMove, legalMoves, uciOf, toSAN, sqName, toFEN,
  inCheck, isMate, isStalemate, insufficientMaterial, START_FEN,
} from "../engine/core.js";
import { play, onDone, stop } from "../stockfish/client.js";
import Captured from "../ui/Captured.jsx";
import { playMove, play as sfx } from "../ui/sound.js";

const LEVELS = [
  { name: "Casual", elo: 1320, ms: 100 },
  { name: "Club", elo: 1600, ms: 200 },
  { name: "Strong", elo: 1900, ms: 350 },
  { name: "Expert", elo: 2200, ms: 600 },
  { name: "Master", elo: 2500, ms: 900 },
  { name: "Full strength", elo: 3190, ms: 1500 },
];

export default function Spar() {
  const [level, setLevel] = useState(1);
  const [side, setSide] = useState("white");
  const [pos, setPos] = useState(() => parseFEN(START_FEN));
  const [moves, setMoves] = useState([]);       // SAN, for the scoresheet
  const [lastMove, setLastMove] = useState(null);
  const [thinking, setThinking] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  const mySide = side === "white" ? "w" : "b";
  const myTurn = pos.turn === mySide;

  const over = isMate(pos)
    ? `${pos.turn === "w" ? "Black" : "White"} wins by checkmate`
    : isStalemate(pos)
    ? "Stalemate"
    : insufficientMaterial(pos)
    ? "Draw by insufficient material"
    : pos.half >= 100
    ? "Draw by the fifty-move rule"
    : null;

  /* Checkmate gets its sound from the move that delivered it. The quiet endings
     - stalemate, insufficient material, fifty moves - have no such moment, so
     announce them once when the game state settles. */
  const announced = useRef(null);
  useEffect(() => {
    if (over && over !== announced.current && !/checkmate/.test(over)) sfx("draw");
    announced.current = over;
  }, [over]);

  // Engine replies whenever it is not our turn.
  useEffect(() => {
    if (over || myTurn) return;
    setThinking(true);
    const { elo, ms } = LEVELS[level];
    play(toFEN(pos), { elo, movetime: ms }).catch(() => setThinking(false));
  }, [pos, myTurn, over, level]);

  useEffect(
    () =>
      onDone(({ best }) => {
        setThinking(false);
        if (!best) return;
        const p = posRef.current;
        const mv = legalMoves(p).find((m) => uciOf(m) === best);
        if (!mv) return;
        const after = makeMove(p, mv);
        setMoves((list) => [...list, { san: toSAN(p, mv), num: p.turn === "w" ? p.full : null }]);
        setLastMove({ from: best.slice(0, 2), to: best.slice(2, 4) });
        setPos(after);
        playMove(p, after, mv, { isMate: isMate(after), inCheck: inCheck(after, after.turn) });
      }),
    []
  );

  const onMove = useCallback(
    (from, to) => {
      if (!myTurn || over) return;
      const cands = legalMoves(pos).filter((m) => sqName(m.from) === from && sqName(m.to) === to);
      if (!cands.length) return;
      const mv = cands.find((m) => !m.promo || m.promo === "q") || cands[0];
      const after = makeMove(pos, mv);
      setMoves((list) => [...list, { san: toSAN(pos, mv), num: pos.turn === "w" ? pos.full : null }]);
      setLastMove({ from, to });
      setPos(after);
      playMove(pos, after, mv, { isMate: isMate(after), inCheck: inCheck(after, after.turn) });
    },
    [pos, myTurn, over]
  );

  const reset = (asSide = side) => {
    stop();
    setSide(asSide);
    setPos(parseFEN(START_FEN));
    setMoves([]);
    setLastMove(null);
    setThinking(false);
  };

  const checking = inCheck(pos, pos.turn);
  const mated = isMate(pos) ? pos.turn : null;
  // Whoever sits at each end of the board, from this orientation.
  const topPlayer = side === "white" ? "b" : "w";
  const bottomPlayer = side === "white" ? "w" : "b";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 300px", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player={topPlayer} />
        <Board
          pos={pos}
          orientation={side}
          onMove={onMove}
          lastMove={lastMove}
          check={checking}
          interactive={myTurn && !over}
          mated={mated}
        />
        <Captured pos={pos} player={bottomPlayer} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card()}>
          <div style={label()}>opponent strength</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {LEVELS.map((l, i) => (
              <button
                key={l.name}
                onClick={() => setLevel(i)}
                style={{
                  ...label({ color: i === level ? "#F7F5EF" : C.ink }),
                  background: i === level ? C.indigo : "transparent",
                  border: `1px solid ${i === level ? C.indigo : C.line}`,
                  padding: "6px 9px", borderRadius: 2, cursor: "pointer",
                }}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div style={label({ marginTop: 8 })}>
            elo {LEVELS[level].elo} · {LEVELS[level].ms}ms/move
          </div>
        </div>

        <div style={card()}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={label()}>status</div>
            {thinking && <div style={label({ color: C.amber })}>thinking…</div>}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 16, marginTop: 6, color: over ? C.red : C.ink }}>
            {over || (myTurn ? "Your move" : "Engine to move")}
          </div>
        </div>

        <div style={card({ maxHeight: 240, overflowY: "auto" })}>
          <div style={label()}>scoresheet</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 8px", marginTop: 6, fontFamily: MONO, fontSize: 12 }}>
            {moves.map((m, i) => (
              <span key={i}>
                {m.num ? <span style={{ color: C.mute }}>{m.num}.</span> : null}
                {m.san}
              </span>
            ))}
            {moves.length === 0 && <span style={{ color: C.mute }}>No moves yet.</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Small onClick={() => reset("white")}>new as white</Small>
          <Small onClick={() => reset("black")}>new as black</Small>
        </div>
      </div>
    </div>
  );
}

function Small({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...label({ color: C.ink }), background: "transparent",
        border: `1px solid ${C.line}`, padding: "8px 10px",
        borderRadius: 2, cursor: "pointer", flex: 1,
      }}
    >
      {children}
    </button>
  );
}
