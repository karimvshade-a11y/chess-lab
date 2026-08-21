/**
 * Opening drill. Lessons are plain PGN with commentary, parsed locally, and
 * the drill asks you to recall each move of the line rather than watch it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import { legalMoves, uciOf, makeMove, sqName, parseFEN, isMate, inCheck, START_FEN } from "../engine/core.js";
import { parsePGN, mainline } from "../engine/pgn.js";
import { playMove, play as sfx } from "../ui/sound.js";
import lessonsText from "../data/lessons.pgn?raw";

function loadLessons(text) {
  return text
    .split(/\n(?=\[Event )/)
    .filter((s) => s.trim())
    .map((g) => {
      const t = parsePGN(g);
      return {
        name: t.headers.Event || "Untitled",
        family: t.headers.Family || "",
        side: t.headers.PlayAs || "White",
        summary: t.headers.Summary || "",
        line: mainline(t),
        errors: t.errors,
      };
    })
    .filter((l) => l.line.length && !l.errors.length);
}

/* max-content keeps the board column at its real width; `auto` would let it
   swallow the leftover space and strand the board on the left. */
const LAYOUT = {
  display: "grid",
  gridTemplateColumns: "max-content var(--panel)",
  gap: 24,
  justifyContent: "center",
  alignItems: "start",
};
export default function Openings() {
  const lessons = useMemo(() => loadLessons(lessonsText), []);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState(() => parseFEN(START_FEN));
  const [lastMove, setLastMove] = useState(null);
  const [wrong, setWrong] = useState(null);
  const [done, setDone] = useState(false);
  const [reveal, setReveal] = useState(false);
  /* The note belonging to the move just played, so every move gets explained
     as it happens rather than one summary at the start of the lesson. */
  const [lastNote, setLastNote] = useState(null);
  const timers = useRef([]);

  const lesson = lessons[idx];
  const mySide = lesson && lesson.side === "White" ? "w" : "b";

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const restart = (i = idx) => {
    timers.current.forEach(clearTimeout);
    setIdx(i);
    setStep(0);
    setPos(parseFEN(START_FEN));
    setLastMove(null);
    setWrong(null);
    setDone(false);
    setReveal(false);
    setLastNote(null);
  };

  // When the line opens with the other side, play their move first.
  useEffect(() => {
    if (!lesson) return;
    if (step >= lesson.line.length) { setDone(true); return; }
    const node = lesson.line[step];
    const mover = pos.turn;
    if (mover === mySide) return;
    const t = setTimeout(() => {
      const mv = legalMoves(pos).find((m) => uciOf(m) === node.uci);
      if (!mv) return;
      const after = makeMove(pos, mv);
      setPos(after);
      setLastMove({ from: sqName(mv.from), to: sqName(mv.to) });
      setStep((s) => s + 1);
      setLastNote({ san: node.san, text: node.comment, mine: false });
      playMove(pos, after, mv, { isMate: isMate(after), inCheck: inCheck(after, after.turn) });
    }, 420);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [lesson, step, pos, mySide]);

  const onMove = (from, to) => {
    if (!lesson || done) return;
    const node = lesson.line[step];
    if (!node) return;
    const cands = legalMoves(pos).filter((m) => sqName(m.from) === from && sqName(m.to) === to);
    if (!cands.length) return;
    const mv = cands.find((m) => uciOf(m) === node.uci) || cands[0];

    if (uciOf(mv) !== node.uci) {
      setWrong(node.san);
      sfx("wrong");
      timers.current.push(setTimeout(() => setWrong(null), 1400));
      return;
    }
    setWrong(null);
    const after = makeMove(pos, mv);
    setPos(after);
    setLastMove({ from, to });
    setStep((s) => s + 1);
    setLastNote({ san: node.san, text: node.comment, mine: true });
    setReveal(false);
    playMove(pos, after, mv, { isMate: isMate(after), inCheck: inCheck(after, after.turn) });
  };

  if (!lesson) {
    return <div style={card({ ...label() })}>No lessons found. Run: npm run lessons</div>;
  }

  const node = lesson.line[step];
  const progress = Math.round((step / lesson.line.length) * 100);

  return (
    <div style={LAYOUT}>
      <Board
        pos={pos}
        orientation={mySide === "w" ? "white" : "black"}
        onMove={onMove}
        lastMove={lastMove}
        interactive={!done && pos.turn === mySide}
        highlight={reveal && node ? [{ square: node.uci.slice(0, 2), brush: "yellow" }] : []}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card()}>
          <div style={label()}>{lesson.family} · play as {lesson.side.toLowerCase()}</div>
          <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, marginTop: 4 }}>{lesson.name}</div>
          <div style={{ height: 3, background: C.line, marginTop: 10 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: C.indigo, transition: "width 200ms" }} />
          </div>
          <div style={label({ marginTop: 6 })}>
            {done ? "line complete" : `move ${step + 1} of ${lesson.line.length}`}
          </div>
        </div>

        {lesson.summary && step === 0 && (
          <div style={card()}>
            <div style={label()}>what this opening is about</div>
            <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: C.ink, margin: "6px 0 0" }}>
              {lesson.summary}
            </p>
          </div>
        )}

        {lastNote && lastNote.text && (
          <div style={card({ borderColor: lastNote.mine ? C.green : C.line })}>
            <div style={label({ color: lastNote.mine ? C.green : C.mute })}>
              {lastNote.mine ? `you played ${lastNote.san}` : `opponent played ${lastNote.san}`}
            </div>
            <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: C.ink, margin: "6px 0 0" }}>
              {lastNote.text}
            </p>
          </div>
        )}

        {reveal && node && !done && (
          <div style={card({ borderColor: C.amber })}>
            <div style={label({ color: C.amber })}>what to play, and why</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, marginTop: 5 }}>{node.san}</div>
            {node.comment && (
              <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, color: C.ink, margin: "6px 0 0" }}>
                {node.comment}
              </p>
            )}
          </div>
        )}

        <div style={card()}>
          <div style={label()}>status</div>
          <div style={{ fontFamily: MONO, fontSize: 15, marginTop: 6, color: done ? C.green : wrong ? C.red : C.ink }}>
            {done
              ? "You played the whole line."
              : wrong
              ? "Not this line — try again."
              : pos.turn === mySide
              ? "Your move"
              : "…"}
          </div>

        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <Small onClick={() => setReveal((r) => !r)}>{reveal ? "hide" : "explain this move"}</Small>
          <Small onClick={() => restart()}>restart</Small>
        </div>

        <div style={card({ maxHeight: 230, overflowY: "auto" })}>
          <div style={label()}>lessons</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
            {lessons.map((l, i) => (
              <button
                key={l.name}
                onClick={() => restart(i)}
                style={{
                  textAlign: "left", background: i === idx ? C.paper : "transparent",
                  border: "none", borderLeft: `2px solid ${i === idx ? C.amber : "transparent"}`,
                  padding: "6px 8px", cursor: "pointer",
                  fontFamily: MONO, fontSize: 12, color: i === idx ? C.ink : C.mute,
                }}
              >
                {l.name}
              </button>
            ))}
          </div>
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
