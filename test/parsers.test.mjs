import { parseFEN, makeMove, legalMoves, toSAN, uciOf, START_FEN } from "../src/engine/core.js";
import { parseSAN } from "../src/engine/san.js";
import { parsePGN, mainline } from "../src/engine/pgn.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const HERE = path.dirname(fileURLToPath(import.meta.url));

let bad = 0;
const fail = (m) => { console.log("FAIL " + m); bad++; };

/* 1. Round-trip: every legal move's SAN must parse back to itself, across a
      random walk of real positions. */
let checked = 0;
for (let game = 0; game < 60; game++) {
  let s = parseFEN(START_FEN);
  for (let ply = 0; ply < 40; ply++) {
    const moves = legalMoves(s);
    if (!moves.length) break;
    for (const mv of moves) {
      const san = toSAN(s, mv);
      const back = parseSAN(s, san);
      if (!back || uciOf(back) !== uciOf(mv)) fail(`SAN roundtrip "${san}" in ${game}/${ply}`);
      checked++;
    }
    s = makeMove(s, moves[Math.floor(Math.random() * moves.length)]);
  }
}
console.log(`SAN round-trip: ${checked} moves checked`);

/* 2. Against the original opening book (UCI + SAN both stored). */
const src = fs.readFileSync(path.join(HERE, "..", "chess-lab.jsx"), "utf8");
const DATA = JSON.parse(src.match(/const DATA = (\{.*?\});\n/s)[1]);
let ob = 0;
for (const o of DATA.openings) {
  let s = parseFEN(START_FEN);
  for (let i = 0; i < o.san.length; i++) {
    const mv = parseSAN(s, o.san[i]);
    if (!mv) { fail(`opening ${o.name}: cannot parse SAN "${o.san[i]}"`); break; }
    if (uciOf(mv) !== o.uci[i]) { fail(`opening ${o.name}: "${o.san[i]}" -> ${uciOf(mv)}, expected ${o.uci[i]}`); break; }
    s = makeMove(s, mv); ob++;
  }
}
console.log(`opening book: ${ob} SAN moves resolved to the right UCI`);

/* 3. Disambiguation torture: two knights, three queens. */
const amb = [
  ["8/8/8/3k4/8/8/8/RN2K1NR w KQ - 0 1", "Nf3", "g1f3"],
  ["8/8/8/8/8/8/8/RN2K1NR w KQ - 0 1", "Nbd2", "b1d2"],
  ["3k4/8/8/8/Q6Q/8/8/3K3Q w - - 0 1", "Qh4d4", "h4d4"],
  ["3k4/8/8/8/Q6Q/8/8/3K3Q w - - 0 1", "Qad4", "a4d4"],
];
for (const [fen, san, expect] of amb) {
  const s = parseFEN(fen);
  const mv = parseSAN(s, san);
  if (!mv || uciOf(mv) !== expect) fail(`disambiguation "${san}" -> ${mv ? uciOf(mv) : "null"}, expected ${expect}`);
}
console.log("disambiguation: 4 cases");

/* 4. Illegal / garbage input must return null, never throw. */
for (const junk of ["Qz9", "", "xyz", "e9", "Ke2", "O-O-O-O", "42"]) {
  const s = parseFEN(START_FEN);
  let r; try { r = parseSAN(s, junk); } catch (e) { fail(`parseSAN threw on "${junk}": ${e.message}`); continue; }
  if (r !== null) fail(`parseSAN("${junk}") returned a move instead of null`);
}
console.log("garbage input: 7 cases rejected cleanly");

/* 5. PGN with variations, comments, NAGs, promotion, en passant. */
const pgn = `[Event "Lesson"]
[Site "offline"]
[White "Student"]
[Result "*"]

1. e4 {King's pawn. Grabs the centre and frees two pieces.} e5
2. Nf3 $1 (2. Bc4 {The Italian move order.} Nf6 3. d3) 2... Nc6
3. Bb5 {The Ruy Lopez.} a6 (3... Nf6 {Berlin Defence.} 4. O-O Nxe4) 4. Ba4 *`;
const t = parsePGN(pgn);
if (t.errors.length) fail("PGN errors: " + t.errors.join("; "));
const ml = mainline(t);
const got = ml.map((n) => n.san).join(" ");
const want = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4";
if (got !== want) fail(`PGN mainline "${got}" != "${want}"`);
if (t.headers.Event !== "Lesson") fail("PGN headers not read");
if (!ml[0].comment || !/King's pawn/.test(ml[0].comment)) fail("PGN comment not attached to e4");
console.log(`PGN: mainline "${got}", headers ok, comments ok`);

/* 6. PGN from a custom FEN, with promotion and en passant. */
const pgn2 = `[FEN "4k3/P6P/8/3pP3/8/8/8/4K3 w - d6 0 1"]

1. exd6 {en passant} Kd8 2. a8=Q+ Kd7 3. h8=N *`;
const t2 = parsePGN(pgn2);
if (t2.errors.length) fail("PGN2 errors: " + t2.errors.join("; "));
const ml2 = mainline(t2).map((n) => n.san).join(" ");
if (ml2 !== "exd6 Kd8 a8=Q+ Kd7 h8=N") fail(`PGN2 mainline "${ml2}"`);
console.log(`PGN ep+promotion: "${ml2}"`);

console.log(bad ? `\n${bad} FAILURE(S)` : "\nALL PASS");
