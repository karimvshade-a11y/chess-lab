/**
 * Turns the Lichess puzzle dump into a small local SQLite database.
 *
 * Input:  .assets/puzzles.csv.zst   (CC0, database.lichess.org)
 * Output: src-tauri/resources/puzzles.db
 *
 * Runs once at build time. The app itself never touches the network.
 * No dependencies: Node 24 ships both zstd and SQLite.
 *
 * Selection spreads puzzles across the whole rating range rather than taking a
 * global top-N, because a trainer that only holds 1500-rated puzzles cannot
 * follow you up as you improve or drop back when you stall.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { DatabaseSync } from "node:sqlite";
import { zstdLines } from "./zst-frames.mjs";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC = path.join(ROOT, ".assets", "puzzles.csv.zst");
const OUT_DIR = path.join(ROOT, "src-tauri", "resources");
const OUT = path.join(OUT_DIR, "puzzles.db");

const TARGET = Number(process.env.PUZZLE_COUNT || 20000);
const MIN_POPULARITY = 80;   // Lichess popularity, -100..100
const MIN_PLAYS = 50;        // enough attempts for the rating to mean something

// Weighted toward where most training happens, but the tails stay populated.
const BUCKETS = [
  [600, 1000, 0.10],
  [1000, 1300, 0.16],
  [1300, 1600, 0.22],
  [1600, 1900, 0.22],
  [1900, 2200, 0.16],
  [2200, 2600, 0.10],
  [2600, 3200, 0.04],
];

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC}`);
  console.error("Fetch it once (290 MB, CC0):");
  console.error("  curl -L --create-dirs -o .assets/puzzles.csv.zst \\");
  console.error("    https://database.lichess.org/lichess_db_puzzle.csv.zst");
  process.exit(1);
}

const quota = BUCKETS.map(([lo, hi, share]) => ({ lo, hi, want: Math.round(TARGET * share), got: [], seen: 0 }));

console.log(`Reading ${path.basename(SRC)} (${(fs.statSync(SRC).size / 1048576).toFixed(0)} MB)`);

let seen = 0, kept = 0, header = true;
const t0 = Date.now();

for (const line of zstdLines(SRC)) {
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
  if (header) { header = false; continue; }
  seen++;

  const f = line.split(",");
  if (f.length < 8) continue;

  const id = f[0], fen = f[1], moves = f[2];
  const rating = +f[3], pop = +f[5], plays = +f[6];
  const themes = (f[7] || "").trim();

  if (!Number.isFinite(rating) || !id || !fen) continue;
  if (pop < MIN_POPULARITY || plays < MIN_PLAYS) continue;
  // First move is the opponent's; a real puzzle needs at least one reply.
  if (moves.split(" ").length < 2) continue;

  const b = quota.find((q) => rating >= q.lo && rating < q.hi);
  if (!b) continue;

  /* Reservoir sample per bucket. Taking the first N that pass would draw every
     puzzle from the low ID range, i.e. only the oldest ones. */
  b.seen++;
  if (b.got.length < b.want) {
    b.got.push([id, fen, moves, rating, pop, themes]);
    kept++;
  } else {
    const j = Math.floor(Math.random() * b.seen);
    if (j < b.want) b.got[j] = [id, fen, moves, rating, pop, themes];
  }

  if (seen % 500000 === 0) process.stdout.write(`\r  scanned ${seen.toLocaleString()}  pool ${kept.toLocaleString()}`);
}
console.log(`\r  scanned ${seen.toLocaleString()}  kept ${kept.toLocaleString()}  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const q of quota) {
  const short = q.got.length < q.want ? `  (short by ${q.want - q.got.length})` : "";
  console.log(`    ${String(q.lo).padStart(4)}-${String(q.hi).padEnd(4)}  ${String(q.got.length).padStart(5)} / ${q.want}${short}`);
}

const rows = quota.flatMap((q) => q.got);
if (!rows.length) { console.error("No puzzles matched the filters."); process.exit(1); }

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT)) fs.rmSync(OUT);

const db = new DatabaseSync(OUT);
db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
db.exec(`CREATE TABLE puzzle (
  id TEXT PRIMARY KEY,
  fen TEXT NOT NULL,
  moves TEXT NOT NULL,
  rating INTEGER NOT NULL,
  popularity INTEGER NOT NULL,
  themes TEXT NOT NULL
)`);

const ins = db.prepare("INSERT INTO puzzle VALUES (?,?,?,?,?,?)");
db.exec("BEGIN");
for (const r of rows) ins.run(r[0], r[1], r[2], r[3], r[4], r[5]);
db.exec("COMMIT");

db.exec("CREATE INDEX puzzle_rating ON puzzle(rating)");
db.exec("CREATE INDEX puzzle_themes ON puzzle(themes)");

const counts = new Map();
for (const r of rows) for (const t of r[5].split(" ")) if (t) counts.set(t, (counts.get(t) || 0) + 1);

db.exec("CREATE TABLE theme_count (theme TEXT PRIMARY KEY, n INTEGER NOT NULL)");
const ti = db.prepare("INSERT INTO theme_count VALUES (?,?)");
db.exec("BEGIN");
for (const [t, n] of counts) ti.run(t, n);
db.exec("COMMIT");

db.exec("VACUUM");
db.close();

console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${rows.length.toLocaleString()} puzzles · ${counts.size} themes · ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
console.log(`  top themes: ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} (${n})`).join(", ")}`);
