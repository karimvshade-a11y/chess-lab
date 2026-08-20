import { parseFEN } from "../src/engine/core.js";

/* Mirror of Captured.jsx's material(), which cannot be imported here because
   that module is JSX. Kept in step by this test failing if the rules change. */
const START = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = ["q", "r", "b", "n", "p"];

function material(board) {
  const have = { w: { p:0,n:0,b:0,r:0,q:0,k:0 }, b: { p:0,n:0,b:0,r:0,q:0,k:0 } };
  for (const sq of board) if (sq) have[sq.c][sq.t]++;
  const score = (c) => ORDER.reduce((n, t) => n + have[c][t] * VALUE[t], 0);
  const lost = (c) => Object.fromEntries(ORDER.map((t) => [t, Math.max(0, START[t] - have[c][t])]));
  return { white: score("w"), black: score("b"), lostWhite: lost("w"), lostBlack: lost("b") };
}

let bad = 0;
const eq = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log(`FAIL ${what}\n  got  ${g}\n  want ${w}`); bad++; }
};

// Opening position: nothing captured, dead level at 39 each.
let m = material(parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").board);
eq([m.white, m.black], [39, 39], "start material");
eq(m.lostWhite, { q:0, r:0, b:0, n:0, p:0 }, "start losses");

// Black has lost the a8 rook and two pawns; the b8 knight is still home.
m = material(parseFEN("1nbqkbnr/1ppp1ppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 1").board);
eq(m.lostBlack, { q:0, r:1, b:0, n:0, p:2 }, "black losses");
eq(m.white - m.black, 5 + 2, "white edge");

// Promotion: white has two queens and seven pawns. The extra queen must not
// read as a negative loss, and the score must still be right.
m = material(parseFEN("Q3k3/8/8/8/8/8/PPPPPPP1/RNBQKBNR w KQ - 0 1").board);
eq(m.lostWhite.q, 0, "promoted extra queen never goes negative");
eq(m.lostWhite.p, 1, "the promoted pawn counts as gone");
eq(m.white, 39 - 1 + 9, "score follows the board, not the start set");

// A bare-kings ending.
m = material(parseFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1").board);
eq([m.white, m.black], [0, 0], "bare kings");
eq(m.lostWhite, { q:1, r:2, b:2, n:2, p:8 }, "everything lost");

console.log(bad ? `\n${bad} FAILURE(S)` : "\nmaterial: all cases pass");
process.exit(bad ? 1 : 0);
