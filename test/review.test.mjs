/**
 * End-to-end check of the game-review pipeline on a real game: PGN in,
 * positions and verdicts out. Uses synthetic evaluations so it stays fast and
 * deterministic — the engine itself is covered by the perft and puzzle suites.
 */
import { parsePGN, mainline } from "../src/engine/pgn.js";
import { parseFEN, toFEN, isMate, legalMoves, uciOf } from "../src/engine/core.js";
import { judgeGame, summarise } from "../src/train/judge.js";

// A real 26-move game ending in mate.
const PGN = `[Event "Casual game"]
[White "soegun"]
[Black "dugu2727"]
[Result "0-1"]

1. e4 Nf6 2. d3 e5 3. Nf3 Nc6 4. b3 d5 5. exd5 Nd4 6. Nxe5 Qe7 7. f4 Ng4
8. c3 Nxe5 9. cxd4 Nxd3+ 10. Kd2 Nf2 11. Qe1 Nxh1 12. Bb5+ Kd8 13. Qxh1 Qf6
14. Qe1 Qxd4+ 15. Kc2 Bf5+ 16. Qe4 Qxe4+ 17. Kd1 Bd6 18. Nd2 Qd4 19. Bb2 Bg4+
20. Ke1 Qxb2 21. Rd1 Qc2 22. Ne4 Qxd1+ 23. Kf2 Qd4+ 24. Kf1 Bb4 25. Nc5 Qa1+
26. Kf2 Qe1# 0-1`;

let bad = 0;
const ok = (c, what) => { if (!c) { console.log("FAIL " + what); bad++; } };

const tree = parsePGN(PGN);
ok(tree.errors.length === 0, "PGN parses without errors: " + tree.errors.join("; "));

const line = mainline(tree);
ok(line.length === 52, `26 moves is 52 plies (got ${line.length})`);
ok(tree.headers.White === "soegun", "headers read");

// Every move must be legal from the position before it.
let illegal = 0;
for (const node of line) {
  if (!legalMoves(node.before).some((m) => uciOf(m) === node.uci)) illegal++;
}
ok(illegal === 0, `every move legal in sequence (${illegal} bad)`);

// The game really does end in mate.
ok(isMate(line[line.length - 1].after), "final position is checkmate");
ok(line[line.length - 1].san === "Qe1#", `last move renders as Qe1# (got ${line[line.length-1].san})`);

// Positions array: one more than moves, as the reviewer builds it.
const positions = [parseFEN(tree.start), ...line.map((n) => n.after)];
ok(positions.length === line.length + 1, "one more position than moves");
ok(toFEN(positions[0]).startsWith("rnbqkbnr"), "starts from the opening position");

/* Feed it evaluations: level until White errs at ply 20, decisive for Black
   afterwards. The evaluation must STAY decisive rather than spike once -
   every eval is from the mover's point of view, so a lone spike reads as
   Black throwing the win straight back and flags two moves instead of one. */
const evals = positions.map((p, i) => ({
  cp: i <= 20 ? 10 : i % 2 === 1 ? 800 : -800,
  mate: null,
  pv: ["a2a3"],
}));
const judged = judgeGame(line.map((n) => n.uci), evals, true);
ok(judged.length === line.length, "a verdict slot per move");

const w = summarise(judged, "w");
const b = summarise(judged, "b");
ok(w.moves + b.moves === line.length, "verdicts split across both sides");
ok(w.blunders === 1, `white owns the one blunder (got ${w.blunders})`);
ok(b.blunders === 0, `black owns none (got ${b.blunders})`);
ok(judged[20].mover === "w", "ply 20 is a white move");
ok(w.accuracy != null && w.accuracy < 100, "accuracy reflects the error");

console.log(bad ? `\n${bad} FAILURE(S)` : "\nreview: pipeline holds on a real game");
process.exit(bad ? 1 : 0);
