/**
 * The techniques library: pick a pattern, read what it is, see it on a board,
 * then go and drill it.
 *
 * Every entry has a worked example — a real position with the move that
 * demonstrates the idea — because a definition on its own does not stick.
 * Examples are checked against the move generator at load, so a mistyped FEN
 * shows up as a missing diagram rather than a broken board.
 */
import { useMemo, useState } from "react";
import Board from "../ui/Board.jsx";
import { C, MONO, label, card } from "../ui/theme.js";
import { parseFEN, legalMoves, uciOf, toSAN, makeMove, inCheck, isMate } from "../engine/core.js";
import { THEMES } from "./themes.js";
import { EXAMPLES } from "./examples.js";

/* The order a coach would teach them in, not alphabetical. */
const GROUPS = [
  {
    title: "Winning material",
    blurb: "The patterns that win a piece. Nearly every club game turns on one of these.",
    keys: ["hangingPiece", "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "trappedPiece", "capturingDefender", "xRayAttack"],
  },
  {
    title: "Forcing the issue",
    blurb: "Ways to make your opponent do what you want, usually by giving something up.",
    keys: ["deflection", "attraction", "clearance", "interference", "sacrifice", "intermezzo", "quietMove", "zugzwang"],
  },
  {
    title: "Mating patterns",
    blurb: "Finishes worth knowing by sight. Once you have seen each one, you spot it forever.",
    keys: ["backRankMate", "smotheredMate", "hookMate", "anastasiaMate", "arabianMate", "bodenMate", "doubleBishopMate"],
  },
  {
    title: "Attacking the king",
    blurb: "How attacks are built, and the squares they aim at.",
    keys: ["exposedKing", "attackingF2F7", "kingsideAttack", "queensideAttack"],
  },
  {
    title: "Pawns",
    blurb: "The slow ideas that decide endgames.",
    keys: ["advancedPawn", "promotion", "underPromotion"],
  },
];

export default function Learn({ onPractise }) {
  const [openKey, setOpenKey] = useState("fork");

  const entry = THEMES[openKey];
  const example = EXAMPLES[openKey];

  /* Validate the example against the real rules rather than trusting the data. */
  const demo = useMemo(() => {
    if (!example) return null;
    try {
      const pos = parseFEN(example.fen);
      const mv = legalMoves(pos).find((m) => uciOf(m) === example.play);
      if (!mv) return null;
      return { pos, mv, san: toSAN(pos, mv), after: makeMove(pos, mv) };
    } catch {
      return null;
    }
  }, [example]);

  const [showAnswer, setShowAnswer] = useState(false);
  const shown = showAnswer && demo ? demo.after : demo && demo.pos;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px minmax(420px, 1fr)", gap: 24, alignItems: "start", maxWidth: 1200, margin: "0 auto" }}>
      {/* ---- contents ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={card()}>
          <div style={label()}>the techniques</div>
          <p style={{ fontFamily: MONO, fontSize: 11.5, color: C.mute, margin: "6px 0 0", lineHeight: 1.7 }}>
            Pick one to read what it is, see it happen, and drill it.
          </p>
        </div>

        {GROUPS.map((g) => (
          <div key={g.title} style={card({ padding: "12px 0 8px" })}>
            <div style={{ ...label(), padding: "0 14px" }}>{g.title}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
              {g.keys.filter((k) => THEMES[k]).map((k) => (
                <button
                  key={k}
                  onClick={() => { setOpenKey(k); setShowAnswer(false); }}
                  style={{
                    textAlign: "left", cursor: "pointer", border: "none",
                    background: k === openKey ? C.paper : "transparent",
                    borderLeft: `2px solid ${k === openKey ? C.amber : "transparent"}`,
                    padding: "7px 12px", fontFamily: MONO, fontSize: 12.5,
                    color: k === openKey ? C.ink : C.mute,
                    fontWeight: k === openKey ? 600 : 400,
                  }}
                >
                  {THEMES[k].name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ---- the lesson ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card()}>
          <div style={label({ color: C.indigo })}>technique</div>
          <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, marginTop: 4 }}>
            {entry ? entry.name : "—"}
          </div>
          <p style={{ fontFamily: MONO, fontSize: 14, lineHeight: 1.8, margin: "12px 0 0", color: C.ink }}>
            {entry && entry.what}
          </p>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={label()}>how to spot it</div>
            <p style={{ fontFamily: MONO, fontSize: 13.5, lineHeight: 1.8, margin: "6px 0 0", color: C.ink }}>
              {entry && entry.look}
            </p>
          </div>
        </div>

        {demo ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
            <div>
              <Board
                pos={shown}
                orientation={demo.pos.turn === "w" ? "white" : "black"}
                interactive={false}
                size="min(46vh, 380px)"
                check={inCheck(shown, shown.turn)}
                mated={isMate(shown) ? shown.turn : null}
                arrows={
                  !showAnswer
                    ? []
                    : [{ from: example.play.slice(0, 2), to: example.play.slice(2, 4), brush: "green" }]
                }
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card()}>
                <div style={label()}>worked example</div>
                <div style={{ fontFamily: MONO, fontSize: 13, marginTop: 6, color: C.ink }}>
                  {demo.pos.turn === "w" ? "White" : "Black"} to play.
                </div>
                <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, margin: "8px 0 0", color: C.mute }}>
                  {example.setup}
                </p>

                {showAnswer ? (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                    <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: C.green }}>
                      {demo.san}
                    </div>
                    <p style={{ fontFamily: MONO, fontSize: 12.5, lineHeight: 1.7, margin: "6px 0 0", color: C.ink }}>
                      {example.why}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAnswer(true)}
                    style={{
                      ...label({ color: "#F7F5EF" }), background: C.indigo,
                      border: `1px solid ${C.indigo}`, borderRadius: 2,
                      padding: "10px 12px", marginTop: 14, cursor: "pointer", width: "100%",
                    }}
                  >
                    Show the move
                  </button>
                )}
                {showAnswer && (
                  <button
                    onClick={() => setShowAnswer(false)}
                    style={{
                      ...label({ color: C.ink }), background: "transparent",
                      border: `1px solid ${C.line}`, borderRadius: 2,
                      padding: "8px 10px", marginTop: 12, cursor: "pointer", width: "100%",
                    }}
                  >
                    hide again
                  </button>
                )}
              </div>

              <div style={card()}>
                <div style={label()}>now drill it</div>
                <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.7, margin: "6px 0 10px", color: C.mute }}>
                  Reading is not learning. Solve real positions until you see it without looking.
                </p>
                <button
                  onClick={() => onPractise && onPractise(openKey)}
                  style={{
                    ...label({ color: "#F7F5EF" }), background: C.green,
                    border: `1px solid ${C.green}`, borderRadius: 2,
                    padding: "11px 12px", cursor: "pointer", width: "100%",
                  }}
                >
                  Practise {entry ? entry.name.toLowerCase() : ""} puzzles
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={card()}>
            <div style={label()}>now drill it</div>
            <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.7, margin: "6px 0 10px", color: C.mute }}>
              No worked example for this one yet — the puzzles are the lesson.
            </p>
            <button
              onClick={() => onPractise && onPractise(openKey)}
              style={{
                ...label({ color: "#F7F5EF" }), background: C.green,
                border: `1px solid ${C.green}`, borderRadius: 2,
                padding: "11px 12px", cursor: "pointer", width: "100%",
              }}
            >
              Practise {entry ? entry.name.toLowerCase() : ""} puzzles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
