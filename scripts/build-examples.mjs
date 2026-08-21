/**
 * Picks one worked example per technique out of the puzzle database and writes
 * src/train/examples.js.
 *
 * Choosing real positions rather than inventing FENs means every diagram is
 * already known-good — the same rows the puzzle test suite replays. The
 * explanation is derived from the position too: what the move captures, whether
 * it checks, and what the piece hits once it lands. Nothing is asserted that
 * the board does not actually show.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import {
  parseFEN, makeMove, legalMoves, pseudoMoves, uciOf, toSAN, sqName,
  inCheck, isMate, toFEN,
} from "../src/engine/core.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DB = path.join(ROOT, "src-tauri", "resources", "puzzles.db");
const OUT = path.join(ROOT, "src", "train", "examples.js");

const WANTED = [
  "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "hangingPiece",
  "deflection", "attraction", "clearance", "interference", "xRayAttack",
  "backRankMate", "smotheredMate", "hookMate", "anastasiaMate", "arabianMate",
  "bodenMate", "doubleBishopMate", "sacrifice", "promotion", "underPromotion",
  "trappedPiece", "quietMove", "zugzwang", "intermezzo", "exposedKing",
  "attackingF2F7", "kingsideAttack", "queensideAttack", "advancedPawn",
  "capturingDefender",
];

const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/* Themes whose whole point is the mate. For everything else a mate-in-one is a
   bad illustration: it is tagged with the theme but demonstrates the finish
   rather than the pattern being taught. */
const MATING = new Set([
  "backRankMate", "smotheredMate", "hookMate", "anastasiaMate", "arabianMate",
  "bodenMate", "doubleBishopMate",
]);

/* Where the move itself can be checked against the idea, insist on it. */
const DEMONSTRATES = {
  /* The king counts here even though it is never captured — king-and-rook is
     the classic fork, and excluding it threw away almost every good example. */
  fork: (before, mv, after) => {
    const mover = before.board[mv.from];
    const targets = attacksFrom(after, mv.to)
      .map((sq) => after.board[sq])
      .filter((p) => p && p.c !== mover.c)
      .filter((p) => p.t === "k" || VALUE[p.t] >= VALUE[mover.t] || VALUE[p.t] >= 5);
    return targets.length >= 2;
  },
  hangingPiece: (before, mv) => !!before.board[mv.to],
  capturingDefender: (before, mv) => !!before.board[mv.to],
  promotion: (before, mv) => mv.promo === "q",
  underPromotion: (before, mv) => mv.promo && mv.promo !== "q",
  sacrifice: (before, mv, after) => {
    // Something of ours lands where it can be taken.
    const mover = before.board[mv.from];
    const taken = before.board[mv.to];
    if (VALUE[mover.t] <= (taken ? VALUE[taken.t] : 0)) return false;
    const asOpp = { ...after, turn: after.turn };
    return pseudoMoves(asOpp).some((m) => m.to === mv.to);
  },
  advancedPawn: (before, mv) => {
    const p = before.board[mv.from];
    if (!p || p.t !== "p") return false;
    const rank = 8 - Math.floor(mv.to / 8);
    return p.c === "w" ? rank >= 6 : rank <= 3;
  },
};
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

/** Squares the piece on `from` attacks, treating it as that side's turn. */
function attacksFrom(state, from) {
  const piece = state.board[from];
  if (!piece) return [];
  const asMover = { ...state, turn: piece.c };
  return pseudoMoves(asMover)
    .filter((m) => m.from === from)
    .map((m) => m.to);
}

/** A factual sentence about what the move does. */
function explain(before, mv) {
  const after = makeMove(before, mv);
  const mover = before.board[mv.from];
  const captured = before.board[mv.to];
  const bits = [];

  if (isMate(after)) {
    const n = NAME[mover.t];
    return `Mate. The ${n} lands on ${sqName(mv.to)} and the king has nowhere to go.`;
  }

  const checks = inCheck(after, after.turn);
  if (checks) bits.push("It comes with check, so the reply is forced");
  if (captured) bits.push(`it takes the ${NAME[captured.t]} on ${sqName(mv.to)}`);
  if (mv.promo) bits.push(`the pawn becomes a ${NAME[mv.promo]}`);

  // What the piece hits once it arrives.
  const hits = attacksFrom(after, mv.to)
    .map((sq) => ({ sq, p: after.board[sq] }))
    .filter((x) => x.p && x.p.c !== mover.c && x.p.t !== "k")
    .filter((x) => VALUE[x.p.t] >= VALUE[mover.t] || VALUE[x.p.t] >= 5)
    .sort((a, b) => VALUE[b.p.t] - VALUE[a.p.t]);

  if (hits.length >= 2) {
    bits.push(
      `and from ${sqName(mv.to)} it attacks both the ${NAME[hits[0].p.t]} on ${sqName(hits[0].sq)} and the ${NAME[hits[1].p.t]} on ${sqName(hits[1].sq)} — they cannot both be saved`
    );
  } else if (hits.length === 1) {
    bits.push(`and it now attacks the ${NAME[hits[0].p.t]} on ${sqName(hits[0].sq)}`);
  }

  if (!bits.length) return `The move is ${toSAN(before, mv)}. Play through it and watch what it threatens.`;
  const s = bits.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

const db = new DatabaseSync(DB, { readOnly: true });
const out = {};
let missing = [];

for (const theme of WANTED) {
  const rows = db
    .prepare(
      `SELECT id, fen, moves, rating, themes FROM puzzle
       WHERE themes LIKE ? AND rating < 1600
       ORDER BY popularity DESC, rating ASC LIMIT 40`
    )
    .all(`%${theme}%`);

  let chosen = null;
  for (const r of rows) {
    // Guard against substring collisions: "pin" must not match "pinnedPiece".
    if (!r.themes.split(" ").includes(theme)) continue;
    const moves = r.moves.split(" ");
    if (moves.length < 2) continue;
    try {
      const start = parseFEN(r.fen);
      const setup = legalMoves(start).find((m) => uciOf(m) === moves[0]);
      if (!setup) continue;
      const pos = makeMove(start, setup);
      const mv = legalMoves(pos).find((m) => uciOf(m) === moves[1]);
      if (!mv) continue;

      const after = makeMove(pos, mv);
      const mateNow = isMate(after);
      // A mate-in-one only illustrates a mating pattern.
      if (mateNow !== MATING.has(theme)) continue;

      const mover = pos.board[mv.from];
      const hits = attacksFrom(after, mv.to)
        .map((sq) => ({ sq, p: after.board[sq] }))
        .filter((x) => x.p && x.p.c !== mover.c && x.p.t !== "k")
        .filter((x) => VALUE[x.p.t] >= VALUE[mover.t] || VALUE[x.p.t] >= 5);

      const check = DEMONSTRATES[theme];
      if (check && !check(pos, mv, after, hits)) continue;

      chosen = {
        id: r.id,
        fen: toFEN(pos),
        play: moves[1],
        san: toSAN(pos, mv),
        rating: r.rating,
        why: explain(pos, mv),
      };
      break;
    } catch {
      /* skip anything that will not replay */
    }
  }

  if (!chosen) { missing.push(theme); continue; }
  out[theme] = chosen;
}

const body = Object.entries(out)
  .map(
    ([k, v]) =>
      `  ${k}: {\n` +
      `    fen: ${JSON.stringify(v.fen)},\n` +
      `    play: ${JSON.stringify(v.play)},\n` +
      `    setup: "A real position, rated ${v.rating}. The move is there — find it before you look.",\n` +
      `    why: ${JSON.stringify(v.why)},\n` +
      `    source: ${JSON.stringify(v.id)},\n` +
      `  },`
  )
  .join("\n");

fs.writeFileSync(
  OUT,
  `/**\n` +
    ` * Worked examples for the Learn tab, one per technique.\n` +
    ` *\n` +
    ` * Generated by scripts/build-examples.mjs from the puzzle database, so every\n` +
    ` * position is one the test suite already replays, and every explanation is\n` +
    ` * derived from what the board actually does. Do not edit by hand.\n` +
    ` */\n\n` +
    `export const EXAMPLES = {\n${body}\n};\n`
);

console.log(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(out).length} examples`);
if (missing.length) console.log(`  no suitable puzzle for: ${missing.join(", ")}`);
