/**
 * Puzzle trainer over the local Lichess set.
 *
 * Lichess puzzles start one move BEFORE the position you solve: the first UCI
 * move is the opponent's, and playing it produces the puzzle. Then moves
 * alternate - yours, theirs, yours - so a puzzle can be several moves deep.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Board from "../ui/Board.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import { parseFEN, makeMove, legalMoves, uciOf, toSAN, sqName, inCheck, isMate } from "../engine/core.js";
import { pickPuzzles, dueReviews, recordAttempt } from "../stockfish/client.js";
import ThemePicker from "./ThemePicker.jsx";
import { THEMES, primaryTheme, prettyTheme } from "./themes.js";
import Captured from "../ui/Captured.jsx";
import { playMove, play as sfx } from "../ui/sound.js";

const START_RATING = 1200;

/* Elo-style update so the puzzle rating you see tracks real performance. */
function nextRating(mine, puzzle, won) {
  const expected = 1 / (1 + Math.pow(10, (puzzle - mine) / 400));
  const k = mine < 1600 ? 32 : mine < 2000 ? 24 : 16;
  return Math.round(mine + k * ((won ? 1 : 0) - expected));
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
export default function Tactics({ rating, setRating, onSolved, theme, setTheme }) {
  const [queue, setQueue] = useState([]);
  const [puzzle, setPuzzle] = useState(null);
  const [pos, setPos] = useState(null);
  const [step, setStep] = useState(0);          // index into puzzle.moves
  const [phase, setPhase] = useState("loading"); // loading | solving | wrong | solved | empty
  const [lastMove, setLastMove] = useState(null);
  const [played, setPlayed] = useState([]);
  /* 0 none · 1 which piece · 2 what the idea is · 3 the move itself.
     One button that dumps the answer teaches nothing; each rung here asks you
     to do a bit more of the work before the next is offered. */
  const [hintLevel, setHintLevel] = useState(0);
  const [orientation, setOrientation] = useState("white");
  const startedAt = useRef(Date.now());
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const refill = useCallback(async () => {
    // Spaced repetition first: anything due comes back before new material.
    let batch = [];
    try {
      batch = await dueReviews(6);
    } catch { /* profile db may be empty on first run */ }
    // A single theme has far fewer candidates, so widen the rating band.
    const spread = theme ? 350 : 120;
    try {
      const fresh = await pickPuzzles(rating, spread, theme, 14, true);
      batch = batch.concat(fresh);
    } catch (e) {
      console.error("pickPuzzles failed", e);
    }
    return batch;
  }, [rating, theme]);

  const load = useCallback((p) => {
    if (!p) { setPhase("empty"); return; }
    // Play the opponent's set-up move, then hand the board over.
    const initial = parseFEN(p.fen);
    const opening = legalMoves(initial).find((m) => uciOf(m) === p.moves[0]);
    if (!opening) { setPhase("empty"); return; }
    const after = makeMove(initial, opening);

    setPuzzle(p);
    setPos(after);
    setStep(1);
    setPhase("solving");
    setLastMove({ from: sqName(opening.from), to: sqName(opening.to) });
    setPlayed([]);
    setHintLevel(0);
    
    setOrientation(after.turn === "w" ? "white" : "black");
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const batch = await refill();
      if (!live) return;
      setQueue(batch.slice(1));
      load(batch[0]);
    })();
    return () => { live = false; };
    // Refill on theme change, but not on every rating tick: that would swap the
    // puzzle out from under you mid-solve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const advance = useCallback(async () => {
    let q = queue;
    if (q.length === 0) {
      q = await refill();
    }
    setQueue(q.slice(1));
    load(q[0]);
  }, [queue, refill, load]);

  const finish = useCallback(
    (won) => {
      setPhase(won ? "solved" : "wrong");
      const ms = Date.now() - startedAt.current;
      const updated = nextRating(rating, puzzle.rating, won && !(hintLevel > 0));
      setRating(updated);
      recordAttempt(puzzle.id, won, ms, (hintLevel > 0), updated).catch(() => {});
      if (won) onSolved && onSolved();
    },
    [rating, puzzle, hintLevel, setRating, onSolved]
  );

  const onMove = useCallback(
    (from, to) => {
      if (phase !== "solving" || !puzzle) return;

      const candidates = legalMoves(pos).filter(
        (m) => sqName(m.from) === from && sqName(m.to) === to
      );
      if (!candidates.length) return;
      // Auto-queen unless the puzzle explicitly wants an underpromotion.
      const want = puzzle.moves[step];
      const mv = candidates.find((m) => uciOf(m) === want)
        || candidates.find((m) => !m.promo || m.promo === "q")
        || candidates[0];

      const san = toSAN(pos, mv);
      const after = makeMove(pos, mv);
      setLastMove({ from, to });
      

      const correct = uciOf(mv) === want;
      // Mate ends the puzzle regardless of which mate you found.
      const alsoFine = !correct && isMate(after) && step === puzzle.moves.length - 1;

      if (!correct && !alsoFine) {
        setPos(after);
        setPlayed((p) => [...p, { san, bad: true }]);
        sfx("wrong");
        finish(false);
        return;
      }

      setPos(after);
      setPlayed((p) => [...p, { san, good: true }]);

      const mateNow = isMate(after);
      playMove(pos, after, mv, { isMate: mateNow, inCheck: inCheck(after, after.turn) });

      const nextIdx = step + 1;
      if (nextIdx >= puzzle.moves.length) {
        // Mate already has its own sound; anything else gets the solved chime.
        if (!mateNow) later(() => sfx("correct"), 180);
        finish(true);
        return;
      }

      // Opponent replies, then it is your turn again.
      later(() => {
        const reply = legalMoves(after).find((m) => uciOf(m) === puzzle.moves[nextIdx]);
        if (!reply) { finish(true); return; }
        const afterReply = makeMove(after, reply);
        setPos(afterReply);
        setLastMove({ from: sqName(reply.from), to: sqName(reply.to) });
        setPlayed((p) => [...p, { san: toSAN(after, reply) }]);
        setStep(nextIdx + 1);
        playMove(after, afterReply, reply, {
          isMate: isMate(afterReply),
          inCheck: inCheck(afterReply, afterReply.turn),
        });
      }, 340);
    },
    [phase, puzzle, pos, step, finish]
  );

  /* Each press buys one more rung: which piece, then the idea, then the move. */
  const nextHint = () => {
    if (phase !== "solving" || !puzzle) return;
    setHintLevel((l) => Math.min(3, l + 1));
  };

  const retry = () => load(puzzle);

  if (phase === "loading") {
    return <div style={{ ...card(), ...label() }}>Loading puzzles…</div>;
  }
  if (phase === "empty" || !pos) {
    return (
      <div style={card()}>
        <div style={label()}>No puzzles available</div>
        <p style={{ fontFamily: MONO, fontSize: 12, color: C.mute, marginTop: 8 }}>
          Build the local database first: <code>npm run puzzles</code>
        </p>
      </div>
    );
  }

  const checking = inCheck(pos, pos.turn);
  const toMoveLabel = pos.turn === "w" ? "White to play" : "Black to play";

  const mated = isMate(pos) ? pos.turn : null;
  const themeKey = primaryTheme(puzzle.themes);
  const lesson = themeKey ? THEMES[themeKey] : null;
  const solutionSan = (() => {
    const want = puzzle.moves[step];
    if (!want) return null;
    const mv = legalMoves(pos).find((m) => uciOf(m) === want);
    return mv ? toSAN(pos, mv) : want;
  })();
  const topPlayer = orientation === "white" ? "b" : "w";
  const bottomPlayer = orientation === "white" ? "w" : "b";

  return (
    <div style={LAYOUT}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Captured pos={pos} player={topPlayer} />
        <Board
          pos={pos}
          orientation={orientation}
          onMove={onMove}
          lastMove={lastMove}
          check={checking}
          interactive={phase === "solving"}
          highlight={
            hintLevel >= 1 && phase === "solving" && puzzle.moves[step]
              ? [{ square: puzzle.moves[step].slice(0, 2), brush: "yellow" }]
              : []
          }
          mated={mated}
        />
        <Captured pos={pos} player={bottomPlayer} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ThemePicker value={theme} onChange={setTheme} />

        <div style={card()}>
          <div style={label()}>{phase === "solving" ? toMoveLabel : "Result"}</div>
          <div
            style={{
              fontFamily: MONO, fontSize: 20, fontWeight: 600, marginTop: 6,
              color: phase === "solved" ? C.green : phase === "wrong" ? C.red : C.ink,
            }}
          >
            {phase === "solving" && "Find the move"}
            {phase === "solved" && ((hintLevel > 0) ? "Solved with a hint" : "Solved")}
            {phase === "wrong" && "Not the move"}
          </div>

          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <div>
              <div style={label()}>puzzle</div>
              <div style={{ fontFamily: MONO, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                {puzzle.rating}
              </div>
            </div>
            <div>
              <div style={label()}>you</div>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.indigo, fontVariantNumeric: "tabular-nums" }}>
                {rating}
              </div>
            </div>
            <div>
              <div style={label()}>depth</div>
              <div style={{ fontFamily: MONO, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                {Math.ceil((puzzle.moves.length - 1) / 2)} move{puzzle.moves.length > 3 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {played.length > 0 && (
          <div style={card()}>
            <div style={label()}>your line</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 6, fontFamily: MONO, fontSize: 13 }}>
              {played.map((m, i) => (
                <span key={i} style={{ color: m.bad ? C.red : m.good ? C.green : C.mute }}>
                  {m.san}
                </span>
              ))}
            </div>
          </div>
        )}

        {phase === "solving" && hintLevel >= 1 && (
          <div style={card({ borderColor: C.amber })}>
            <div style={label({ color: C.amber })}>hint {hintLevel} of 3</div>
            {hintLevel >= 1 && (
              <div style={{ fontFamily: MONO, fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
                Move the piece on <strong>{puzzle.moves[step].slice(0, 2)}</strong> — highlighted on
                the board.
              </div>
            )}
            {hintLevel >= 2 && lesson && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                <div style={label()}>the idea: {lesson.name}</div>
                <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, margin: "5px 0 0", color: C.ink }}>
                  {lesson.what}
                </p>
              </div>
            )}
            {hintLevel >= 3 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                <div style={label({ color: C.red })}>the move</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, marginTop: 4 }}>
                  {solutionSan || puzzle.moves[step]}
                </div>
              </div>
            )}
          </div>
        )}

        {phase !== "solving" && (
          <div style={card()}>
            {lesson ? (
              <>
                <div style={label({ color: C.indigo })}>{lesson.name}</div>
                <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, margin: "6px 0 0", color: C.ink }}>
                  {lesson.what}
                </p>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                  <div style={label()}>how to spot it next time</div>
                  <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, margin: "5px 0 0", color: C.ink }}>
                    {lesson.look}
                  </p>
                </div>
              </>
            ) : (
              <div style={label()}>themes</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {puzzle.themes.slice(0, 8).map((t) => (
                <span
                  key={t}
                  style={{
                    ...label({ color: C.ink }), fontSize: 9,
                    border: `1px solid ${C.line}`, padding: "3px 7px", borderRadius: 2,
                  }}
                >
                  {prettyTheme(t)}
                </span>
              ))}
            </div>
            {phase === "wrong" && (
              <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>
                The move was <strong style={{ color: C.green }}>{solutionSan || puzzle.moves[step]}</strong>.
                <span style={{ color: C.mute }}> This one comes back tomorrow.</span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {phase === "solving" && (
            <Btn onClick={nextHint} disabled={hintLevel >= 3}>
              {hintLevel === 0 ? "Hint" : hintLevel === 1 ? "Another hint" : hintLevel === 2 ? "Show the move" : "Shown"}
            </Btn>
          )}
          {phase === "wrong" && <Btn onClick={retry}>Retry</Btn>}
          <Btn onClick={advance} kind={phase === "solving" ? "quiet" : "primary"} full>
            {phase === "solving" ? "Skip" : "Next puzzle"}
          </Btn>
        </div>

        <div style={label({ textAlign: "center" })}>
          {queue.length} queued · lichess {puzzle.id}
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, kind = "quiet", disabled, full }) {
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
        padding: "10px 14px", borderRadius: 2,
        opacity: disabled ? 0.35 : 1, flex: full ? 1 : "none",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
