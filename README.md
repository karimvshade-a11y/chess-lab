# Chess Lab

An offline chess trainer. No network calls at runtime, no accounts, no API keys.
Everything — engine, puzzles, lessons, and your progress — lives on the machine.

## What it does

| Tab | What it is |
| --- | --- |
| **Tactics** | 20,000 rated Lichess puzzles with spaced repetition. Your rating moves with an Elo update against each puzzle's rating. |
| **Openings** | Recall drills built from PGN lessons — you play the line rather than watch it. |
| **Play** | Sparring against Stockfish 18, from ~1320 Elo to full strength. |
| **Analyse** | Multi-PV analysis of any position, with an evaluation bar and SAN principal variations. |
| **Progress** | Attempts, accuracy, and what is due for review. |

## Requirements

Rust, Node 22+, and on Windows the MSVC build tools plus the WebView2 runtime
(WebView2 ships with Windows 11). Node 22+ matters: the puzzle pipeline uses the
built-in `node:sqlite` and zstd support rather than third-party packages.

## Setup

The two large inputs are fetched once at build time. The application itself
never touches the network.

```bash
npm install

# Stockfish 18 (~73 MB). Pick the build that matches the CPU.
curl -L --create-dirs -o .assets/stockfish.zip \
  https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64-avx2.zip
unzip -o .assets/stockfish.zip -d .assets
cp .assets/stockfish/stockfish-windows-x86-64-avx2.exe \
   src-tauri/binaries/stockfish-x86_64-pc-windows-msvc.exe

# Lichess puzzle database (~290 MB, CC0)
curl -L --create-dirs -o .assets/puzzles.csv.zst \
  https://database.lichess.org/lichess_db_puzzle.csv.zst

npm run puzzles   # 6.1M puzzles in  ->  20,000 sampled out (4 MB)
npm run lessons   # opening book     ->  src/data/lessons.pgn
```

Then:

```bash
npm run app        # dev
npm run app:build  # installer in src-tauri/target/release/bundle
```

### Choosing a Stockfish build

Match the binary to the CPU, and note the usual trap: on Zen 1 and Zen 2 (Ryzen
1000/2000 series) the `bmi2` build is *slower* than `avx2`, because `pext` is
microcoded on those chips. Use `avx2` there. `sse41-popcnt` is the safe fallback
for anything older.

## How it fits together

```
src/engine/      move generation, SAN, PGN — no dependencies
src/stockfish/   typed wrapper over the Tauri commands
src/train/       the five tabs
src-tauri/       Rust: UCI process management, SQLite access
scripts/         build-time data pipeline
test/            correctness checks
```

The engine is the original perft-verified generator from the single-file
prototype, not a library. Stockfish evaluates; the local generator decides what
is legal. They cross-check each other in the test suite.

### Two things worth knowing

**Lichess puzzles start one move early.** The first UCI move in a puzzle's move
list belongs to the *opponent*; playing it produces the position you actually
solve. The trainer plays that move for you on load.

**The puzzle dump is not a single zstd stream.** It is 68 data frames with 34
skippable frames interleaved. Node's decoder stops after the first frame and
returns nothing at all when a skippable frame leads, so both the streaming and
one-shot APIs silently hand back a fraction of the file — about 181k of 6.1M
rows. `scripts/zst-frames.mjs` walks the container and decompresses frame by
frame, which also caps peak memory at one frame instead of the full ~1 GB.

## Tests

```bash
npm test
```

- `test/perft.test.mjs` — move generation against the five standard perft
  positions, to depth 4.
- `test/parsers.test.mjs` — every legal move's SAN round-trips through the
  parser across thousands of real positions; PGN variations, comments, en
  passant, and underpromotion.
- `test/material.test.mjs` — captured-piece and material accounting, including the
  promotion case where naive counting reports a negative loss.
- `test/puzzles.test.mjs` — replays all 20,000 puzzles through the generator.
  Every move must be legal in sequence, and every `mate`-themed puzzle must
  actually end in mate.

## Visual harness

```bash
npm run visual
```

Opens `/visual.html`: the board on its own, with a checkmate and a plain check
side by side, no engine and no database behind it. Board states are awkward to
assert from unit tests, and this caught two bugs that unit tests could not:

- **Never animate `transform` on a `<square>` or `<piece>`.** Chessground
  positions both with an inline `style.transform = translate(x, y)`, and CSS
  animations outrank inline styles — so a keyframe touching `transform`
  discards the position and the element jumps to the board's top-left corner.
  Animate `opacity`, `background`, `filter`, or `box-shadow` instead, and put
  any scaling on a `::after` pseudo-element, which owns its own transform.
- **`check` takes a colour or a boolean, never a square.** Chessground finds
  the king itself. Passing a square key matches no piece colour, so the
  highlight silently never renders.

The harness is not part of the production build; Vite only bundles
`index.html`.

## Tuning

`npm run puzzles` takes `PUZZLE_COUNT` (default 20000). Rating spread and the
popularity floor are constants at the top of `scripts/build-puzzles.mjs`.
Engine threads and hash are chosen at startup in `src-tauri/src/lib.rs` —
cores minus two, 1 GB hash.

## Packaging

```bash
npm run app:build
```

Produces an NSIS installer under `src-tauri/target/release/bundle/nsis/`. The
Stockfish executable and `puzzles.db` are bundled with it, so an installed copy
needs no network and no separate setup.

Note that Tauri strips the target triple from a sidecar's filename when it
bundles: the dev tree needs `binaries/stockfish-<triple>.exe` for `externalBin`
to accept it, while the installed app receives plain `stockfish.exe`. Both names
are searched at runtime, along with several roots, so the same binary is found
either way.

## Licences

See [THIRD-PARTY.md](THIRD-PARTY.md). In short: Stockfish (GPL-3.0) runs as a
separate process rather than linked code, the puzzle set is CC0, and chessground
(GPL-3.0) is linked into the front end — which means a **distributed** build of
Chess Lab must itself be offered under GPL-3.0-or-later. Using it privately
carries no such obligation.
