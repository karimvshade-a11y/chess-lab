Chess Lab is a desktop chess trainer that works with no network connection at
all. Stockfish 18 runs as a local process, 20,000 rated puzzles live in a
bundled database, and your progress stays on your machine. There is no account,
no telemetry, and nothing to sign up for.

## Download

**[Chess Lab_0.1.0_x64-setup.exe](../../releases/download/v0.1.0/Chess.Lab_0.1.0_x64-setup.exe)** — 71.7 MB, Windows x64

```
SHA-256  4e4c327ccd4b0878fd9611bf958a8a71e5eee77ec4bef0165f822bf6ce799992
```

The installer is unsigned, so SmartScreen will warn you. "More info" → "Run
anyway", or verify the checksum above first.

## What's in it

| | |
| --- | --- |
| **Tactics** | 20,000 Lichess puzzles, sampled across the whole rating range. Your rating moves by Elo against each puzzle's rating, and everything you miss returns on a Leitner schedule. Filterable by theme, sorted by *your* accuracy so weak spots surface first. |
| **My Blunders** | Positions from your own games where the engine disagreed, drilled until you find the move you missed. |
| **Openings** | Recall drills built from PGN lessons — you play the line rather than watch it. |
| **Play** | Sparring against Stockfish from about 1320 Elo up to full strength. |
| **Review** | Paste a PGN and the engine walks the whole game, marking blunders, mistakes and inaccuracies, and showing what you should have played. |
| **Analyse** | Multi-PV analysis of any position with an evaluation bar. |
| **Progress** | Attempts, accuracy, and what is due for review. |

Mistakes are graded on **win probability lost**, not raw centipawns. Giving up
300 centipawns while already a queen up does not change the result, and calling
that a blunder would teach the wrong lesson.

## Requirements

- **Windows 10 or 11, 64-bit**
- **A CPU with AVX2.** This matters: the bundled engine is the AVX2 build.
  Roughly, Intel Haswell (2013) or later, AMD Excavator/Ryzen or later. On an
  older processor the engine will not start and the app will report that it
  cannot find a working Stockfish.
- **WebView2**, which ships with Windows 11 and current Windows 10.

The engine claims about 1 GB of RAM for its hash table and takes cores minus
two. On a 6-core machine that is 4 threads.

## Verified before release

- Move generation passes the five standard perft positions to depth 4.
- All 20,000 puzzles replay legally through that generator, and every puzzle
  tagged `mate` genuinely ends in mate.
- Every legal move's SAN round-trips through the parser across tens of
  thousands of real positions.
- The packaged build was run from a clean directory with no source tree present,
  confirming it finds its engine and database from bundled assets alone.

## Licensing

Chess Lab is **GPL-3.0-or-later**. The board renderer (chessground, from
Lichess) is GPL and linked into the front end, so the whole work inherits those
terms.

Stockfish is also GPL-3.0 and is bundled here as a **separate executable**,
launched over UCI rather than linked. If you redistribute this installer, the
GPL asks you to make the corresponding source of that engine binary available;
the official [`sf_18`](https://github.com/official-stockfish/Stockfish/releases/tag/sf_18)
release archive contains it, and its licence and AUTHORS files ship inside this
installer.

The puzzle set comes from the [Lichess open puzzle
database](https://database.lichess.org/) under CC0. Full component list in
[THIRD-PARTY.md](../THIRD-PARTY.md).

## Known limitations

- Windows only for now. The code is cross-platform apart from the sidecar
  filename, but no macOS or Linux build has been produced or tested.
- The installer is unsigned.
- A fresh clone of the repository does not build without first fetching
  Stockfish and the puzzle database — both are far too large to track. The
  README covers it, but that path has not been tested on a second machine.
- Review analyses a game move by move at a fixed depth. A long game at the
  deepest setting takes a few minutes.
