/**
 * Converts the opening book from the original single-file build into PGN
 * lessons, keeping the commentary. Generating rather than hand-writing means
 * the move text is produced by the same engine that validates it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFEN, makeMove, legalMoves, uciOf, toSAN, START_FEN } from "../src/engine/core.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUT = path.join(ROOT, "src", "data", "lessons.pgn");

const src = fs.readFileSync(path.join(ROOT, "chess-lab.jsx"), "utf8");
const DATA = JSON.parse(src.match(/const DATA = (\{.*?\});\n/s)[1]);

const games = [];
let errors = 0;

for (const o of DATA.openings) {
  let pos = parseFEN(START_FEN);
  const parts = [];

  for (let i = 0; i < o.uci.length; i++) {
    const mv = legalMoves(pos).find((m) => uciOf(m) === o.uci[i]);
    if (!mv) { console.error(`${o.name}: illegal ${o.uci[i]} at ply ${i + 1}`); errors++; break; }
    const san = toSAN(pos, mv);
    if (pos.turn === "w") parts.push(`${pos.full}.`);
    parts.push(san);
    // Attach the teaching note to the first move so it shows before you play.
    if (i === 0) parts.push(`{${o.note}}`);
    pos = makeMove(pos, mv);
  }

  games.push(
    [
      `[Event "${o.name}"]`,
      `[Site "Chess Lab"]`,
      `[Family "${o.family}"]`,
      `[PlayAs "${o.side}"]`,
      `[Result "*"]`,
      "",
      parts.join(" ") + " *",
      "",
    ].join("\n")
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, games.join("\n"));
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${games.length} lessons, ${errors} errors`);
