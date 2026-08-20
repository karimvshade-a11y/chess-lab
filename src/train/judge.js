/**
 * Turning engine evaluations into a verdict on each move.
 *
 * Centipawn loss alone misjudges lopsided positions: dropping 300cp while
 * already winning by a queen changes nothing about the result, and calling that
 * a blunder trains the wrong instinct. So losses are measured in *win
 * probability*, which flattens out at the extremes the way the actual result
 * does. The conversion is Lichess's, kept so numbers here mean the same thing
 * they do there.
 */

/** Centipawns (side to move) -> chance of winning, 0..100. */
export function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** A mate score is worth more than any material count, but must stay finite. */
export function scoreToCp(line) {
  if (!line) return 0;
  if (line.mate != null) return line.mate > 0 ? 10000 : -10000;
  return line.cp ?? 0;
}

/** Evaluation from White's point of view, whoever is to move. */
export function whiteCp(line, whiteToMove) {
  return scoreToCp(line) * (whiteToMove ? 1 : -1);
}

export const KINDS = {
  blunder: { label: "Blunder", mark: "??", drop: 20, color: "#A8241C" },
  mistake: { label: "Mistake", mark: "?", drop: 10, color: "#B0791A" },
  inaccuracy: { label: "Inaccuracy", mark: "?!", drop: 5, color: "#8A7A3A" },
};

export function classify(dropPct) {
  if (dropPct >= KINDS.blunder.drop) return "blunder";
  if (dropPct >= KINDS.mistake.drop) return "mistake";
  if (dropPct >= KINDS.inaccuracy.drop) return "inaccuracy";
  return null;
}

/**
 * Judge a game from one evaluation per position.
 *
 * `evals[i]` is the engine's verdict on the position *before* move `i`, so a
 * game of N moves needs N+1 entries. Each eval is `{ cp, mate, pv }` as the
 * engine reported it, from the side to move's point of view.
 *
 * The move played is judged by comparing what was available (the eval of the
 * position it was played from) against what was actually reached (the eval of
 * the next position, negated, since the opponent is now to move).
 */
export function judgeGame(moves, evals, startWhiteToMove = true) {
  const out = [];
  let whiteToMove = startWhiteToMove;

  for (let i = 0; i < moves.length; i++) {
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) {
      out.push(null);
      whiteToMove = !whiteToMove;
      continue;
    }

    // Both normalised to the mover's point of view.
    const bestCp = scoreToCp(before);
    const playedCp = -scoreToCp(after);

    const bestPct = winPercent(bestCp);
    const playedPct = winPercent(playedCp);
    const drop = Math.max(0, bestPct - playedPct);

    const bestMove = before.pv && before.pv.length ? before.pv[0] : null;
    // Playing the engine's own choice is never a mistake, whatever the numbers
    // say — a shallower search on the next position can otherwise manufacture
    // a phantom loss.
    const playedBest = bestMove && bestMove === moves[i];

    out.push({
      ply: i,
      uci: moves[i],
      mover: whiteToMove ? "w" : "b",
      bestMove,
      bestCp,
      playedCp,
      drop,
      kind: playedBest ? null : classify(drop),
    });
    whiteToMove = !whiteToMove;
  }
  return out;
}

/**
 * Average win-probability lost per move, as an accuracy percentage.
 * Not Lichess's exact accuracy curve, but the same idea and same direction.
 */
export function accuracy(judged, colour) {
  const mine = judged.filter((j) => j && j.mover === colour);
  if (!mine.length) return null;
  const avgDrop = mine.reduce((n, j) => n + j.drop, 0) / mine.length;
  return Math.max(0, Math.min(100, 100 - avgDrop * 2.5));
}

export function summarise(judged, colour) {
  const mine = judged.filter((j) => j && j.mover === colour);
  const count = (k) => mine.filter((j) => j.kind === k).length;
  return {
    moves: mine.length,
    blunders: count("blunder"),
    mistakes: count("mistake"),
    inaccuracies: count("inaccuracy"),
    accuracy: accuracy(judged, colour),
  };
}
