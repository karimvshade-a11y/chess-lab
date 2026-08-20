import { winPercent, scoreToCp, judgeGame, classify, summarise, accuracy } from "../src/train/judge.js";

let bad = 0;
const ok = (cond, what) => { if (!cond) { console.log("FAIL " + what); bad++; } };
const near = (a, b, tol, what) => ok(Math.abs(a - b) <= tol, `${what} (got ${a}, want ~${b})`);

// Win probability: even at 0, saturating at the extremes, symmetric.
near(winPercent(0), 50, 0.01, "0cp is 50%");
near(winPercent(10000), 100, 0.5, "mate-ish is ~100%");
near(winPercent(-10000), 0, 0.5, "getting mated is ~0%");
near(winPercent(100) + winPercent(-100), 100, 0.01, "symmetric around 50");
ok(winPercent(300) > winPercent(100), "more cp is more win%");

// Mate scores must dominate material but stay finite.
ok(scoreToCp({ mate: 3 }) === 10000, "mate for us");
ok(scoreToCp({ mate: -1 }) === -10000, "mate against us");
ok(scoreToCp({ cp: 55 }) === 55, "plain cp passes through");
ok(Number.isFinite(scoreToCp({ mate: 1 })), "mate stays finite");

// Thresholds.
ok(classify(25) === "blunder", "25% drop is a blunder");
ok(classify(12) === "mistake", "12% is a mistake");
ok(classify(6) === "inaccuracy", "6% is an inaccuracy");
ok(classify(2) === null, "2% is just a move");

/* A hanging queen: even beforehand, disastrous after. Evals alternate point of
   view, so the position after a White blunder is a big plus for Black. */
let judged = judgeGame(
  ["e2e4", "d8h4"],
  [ { cp: 20, pv: ["d2d4"] }, { cp: 900, pv: ["h4e1"] }, { cp: -880, pv: ["b1c3"] } ]
);
ok(judged[0].mover === "w", "first move is white's");
ok(judged[1].mover === "b", "second is black's");
ok(judged[0].kind === "blunder", `white blundered (got ${judged[0].kind})`);
ok(judged[1].kind === null, `black's winning reply is not a mistake (got ${judged[1].kind})`);
ok(judged[0].bestMove === "d2d4", "engine's preference recorded");

/* Playing the engine's own top choice must never be flagged, even when the
   next search reports a worse number. */
judged = judgeGame(
  ["d2d4"],
  [ { cp: 30, pv: ["d2d4"] }, { cp: 200, pv: ["d7d5"] } ]
);
ok(judged[0].kind === null, `engine's own move is never a mistake (got ${judged[0].kind})`);
ok(judged[0].drop > 0, "the raw drop is still reported");

// A quiet, accurate game: nothing flagged, accuracy high.
// Deliberately never the engine's first choice, so the threshold is what
// clears these moves rather than the played-the-best-move shortcut.
judged = judgeGame(
  ["e2e4", "e7e5", "g1f3"],
  [ { cp: 20, pv: ["d2d4"] }, { cp: -18, pv: ["c7c5"] }, { cp: 22, pv: ["b1c3"] }, { cp: -20, pv: ["b8c6"] } ]
);
ok(judged.every((j) => j.kind === null), "clean game has no flags");
ok(judged.every((j) => j.bestMove !== j.uci), "and none of them was the top choice");
ok(accuracy(judged, "w") > 95, "clean play scores high");

// Losing side's collapse should not be blamed on the winner.
judged = judgeGame(
  ["a2a3", "h7h6"],
  [ { cp: 0, pv: ["d2d4"] }, { cp: 0, pv: ["d7d5"] }, { cp: 700, pv: ["e2e4"] } ]
);
const w = summarise(judged, "w"), b = summarise(judged, "b");
ok(b.blunders === 1, `black owns the blunder (got ${b.blunders})`);
ok(w.blunders === 0, `white owns none (got ${w.blunders})`);
ok(w.moves === 1 && b.moves === 1, "moves split by side");

// Missing evals must not throw.
judged = judgeGame(["e2e4", "e7e5"], [{ cp: 10, pv: ["e2e4"] }]);
ok(judged.length === 2 && judged[1] === null, "short eval list degrades quietly");
ok(summarise(judged, "w").moves >= 0, "summary survives nulls");

console.log(bad ? `\n${bad} FAILURE(S)` : "\njudge: all cases pass");
process.exit(bad ? 1 : 0);
