/**
 * Validates the built puzzle database against the move generator.
 * Every FEN must parse, and every move in every solution must be legal in
 * sequence. A single bad row here would be a puzzle that soft-locks the trainer.
 */
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { parseFEN, makeMove, legalMoves, uciOf, toSAN, isMate, inCheck } from "../src/engine/core.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(HERE, "..", "src-tauri", "resources", "puzzles.db");

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare("SELECT id, fen, moves, rating, themes FROM puzzle").all();

let checked = 0, badFen = 0, badMove = 0, mateOk = 0, mateClaimed = 0;
const failures = [];

for (const r of rows) {
  let pos;
  try {
    pos = parseFEN(r.fen);
  } catch (e) {
    badFen++;
    if (failures.length < 10) failures.push(`${r.id}: FEN failed to parse - ${e.message}`);
    continue;
  }
  if (pos.board.filter((p) => p && p.t === "k").length !== 2) {
    badFen++;
    if (failures.length < 10) failures.push(`${r.id}: position does not have exactly two kings`);
    continue;
  }

  const moves = r.moves.split(" ");
  let ok = true;
  for (let i = 0; i < moves.length; i++) {
    const mv = legalMoves(pos).find((m) => uciOf(m) === moves[i]);
    if (!mv) {
      badMove++;
      ok = false;
      if (failures.length < 10) {
        failures.push(`${r.id}: move ${i + 1} "${moves[i]}" illegal (rating ${r.rating}) fen=${r.fen}`);
      }
      break;
    }
    // Exercise SAN rendering on real positions too.
    toSAN(pos, mv);
    pos = makeMove(pos, mv);
  }
  if (!ok) continue;

  // Puzzles tagged mateInN must actually finish in mate.
  if (/\bmate\b/.test(r.themes)) {
    mateClaimed++;
    if (isMate(pos)) mateOk++;
  }
  checked++;
}

const pct = (n, d) => (d ? ((n / d) * 100).toFixed(2) : "0") + "%";

console.log(`puzzles in db      ${rows.length.toLocaleString()}`);
console.log(`fully replayable   ${checked.toLocaleString()}  (${pct(checked, rows.length)})`);
console.log(`unparseable FEN    ${badFen}`);
console.log(`illegal move       ${badMove}`);
console.log(`"mate" themed      ${mateClaimed.toLocaleString()}, ending in mate ${mateOk.toLocaleString()} (${pct(mateOk, mateClaimed)})`);

if (failures.length) {
  console.log("\nfirst failures:");
  for (const f of failures) console.log("  " + f);
}

const fatal = badFen + badMove;
console.log(fatal ? `\nFAIL: ${fatal} unusable puzzle(s)` : "\nPASS: every puzzle replays cleanly");
process.exit(fatal ? 1 : 0);
