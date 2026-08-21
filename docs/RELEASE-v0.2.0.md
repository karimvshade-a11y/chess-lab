**Build your chess genius.**

An offline chess trainer that now teaches rather than only tests. Stockfish 18
runs locally, 20,000 rated puzzles live in a bundled database, and your games,
mistakes and progress never leave the machine.

The headline change since 0.1.0: **Play, Review and My Blunders are now one
loop.** Play a game, press one button, and the engine walks it move by move,
explains what went wrong, and turns your own mistakes into drills.

## Download

**Chess Lab_0.2.0_x64-setup.exe** — 71.8 MB, Windows x64

```
SHA-256  fe3920b69132f76415f3bd5cdb63902010a74081565c749e8f99c7b87942826b
```

The installer is unsigned, so SmartScreen will warn you: "More info" → "Run
anyway", or check the SHA-256 below first.

## New: Learn

A library of chess techniques, grouped the way a coach would teach them rather
than alphabetically — winning material, forcing the issue, mating patterns,
attacking the king, pawns.

Each technique gives you what it is, **how to spot it next time**, a worked
example from a real game to try before revealing the move, and a button that
drops you straight into puzzles filtered to that pattern.

The examples are not hand-written. A build step picks a real position per
technique out of the puzzle database and derives the explanation from what the
move actually does on the board, checking that the example genuinely
demonstrates the idea — a fork example has to attack two pieces at once, and a
mate in one is only used to illustrate a mating pattern.

## New: your games become your training

- **Play** saves every game and offers **Review this game**, mid-game or after.
- **Review** lists your games and walks them with the engine. For every mistake
  it shows what it cost in winning chances, **how it gets punished** (the
  engine's line from after your move) and **what to play instead**.
- Your mistakes are **filed automatically** into **My Blunders**, which serves
  them back as puzzles on a spaced schedule until you find the move you missed.

In 0.1.0 the blunder book could never fill up, because games were never saved
anywhere. That is fixed.

## Teaching everywhere else

- **Tactics** gains a three-rung hint ladder — which piece, then what the idea
  is, then the move — and explains the pattern afterwards whether you solved it
  or not. Around 45 techniques written up.
- **Openings** explains **every move**, not one summary per lesson: 180 notes
  across all 14 openings. And when the book line ends, **Play on from here**
  hands the position to the engine so the opening becomes a real game.
- **Analyse** leads with words instead of numbers: "White is clearly better",
  "about 1.4 pawns", "12 moves ahead".

## Look and feel

- **A wood board.** The classic tournament palette, switchable against the
  house slate from the header. Your choice is remembered.
- Captured pieces say whose haul they are, so a row of bishops beside a board
  with no bishops on it no longer reads as a bug.
- Coordinates moved outside the board — they used to sit on top of the pieces
  on the first rank.

## Fixes

- The board sat off-centre with a gap, and its bottom strip was clipped.
- Tactics was blank until you switched tabs and came back: tabs were mounting
  before the puzzle database had opened.
- Openings froze after "Play on from here" — the board stayed locked to the
  finished book line.
- A render crash now shows the error, the stack and a reload button instead of
  a blank window.

## Requirements

- **Windows 10 or 11, 64-bit**
- **A CPU with AVX2** — roughly Intel Haswell (2013) or later, AMD Excavator or
  Ryzen or later. The bundled engine is the AVX2 build; on an older processor it
  will not start.
- **WebView2**, which ships with Windows 11 and current Windows 10.

The engine takes cores minus two and about 1 GB of RAM for its hash table.

## Verified before release

- Move generation passes the five standard perft positions to depth 4.
- All 20,000 puzzles replay legally, and every puzzle tagged `mate` ends in
  mate.
- Every legal move's SAN round-trips through the parser across tens of
  thousands of positions.
- A new check confirms every file imports what it calls or renders. Two
  blank-screen bugs in this cycle were unimported identifiers, which the bundler
  cannot catch; the test is verified against both.

## Licensing

GPL-3.0-or-later. The board renderer (chessground, from Lichess) is GPL and
linked into the front end, so the whole work inherits those terms. Stockfish is
GPL too but runs as a separate process rather than linked code; if you
redistribute this installer, its corresponding source is in the official
[`sf_18`](https://github.com/official-stockfish/Stockfish/releases/tag/sf_18)
archive, and its licence ships inside. Puzzles are CC0 from the
[Lichess database](https://database.lichess.org/). Full list in
[THIRD-PARTY.md](../THIRD-PARTY.md).

## Known limitations

- Windows only. The code is cross-platform apart from the sidecar filename, but
  no macOS or Linux build has been produced or tested.
- The installer is unsigned.
- A fresh clone needs Stockfish and the puzzle database fetched before it
  builds; both are far too large to track. The README covers it.
- Deep review of a long game takes a few minutes.
