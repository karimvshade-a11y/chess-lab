# Third-party components

Chess Lab bundles the following. Each is redistributable, but the terms differ,
so read this before sharing a build with anyone else.

## Stockfish 18 — GPL-3.0-or-later

The chess engine. Ships as a **separate executable** that Chess Lab launches and
talks to over UCI on standard input and output. It is not linked into the
application and shares no address space with it.

Full licence text: `src-tauri/resources/stockfish-COPYING.txt`
Authors: `src-tauri/resources/stockfish-AUTHORS.txt`
Source: https://github.com/official-stockfish/Stockfish

**If you distribute a build of Chess Lab**, the GPL obliges you to make the
corresponding source of *that* Stockfish binary available to whoever receives
it. The simplest way to comply is to pass along the official release archive you
downloaded — it contains the full source in `src/` alongside the executable —
or to point recipients at the exact tagged release on GitHub (`sf_18`).

Running a GPL program as a separate process does not put Chess Lab's own code
under the GPL. Linking it in would; that is the reason for the sidecar.

## Lichess puzzle database — CC0 1.0 (public domain)

20,000 puzzles sampled from the Lichess open puzzle database. CC0 waives
copyright entirely, so there are no conditions on use or redistribution.
Attribution is not required, but is offered here because it is deserved.

Source: https://database.lichess.org/

## chessground — GPL-3.0-or-later

The board renderer, from the Lichess project. This one *is* linked into the
front-end bundle, so a distributed build of Chess Lab must itself be offered
under the GPL-3.0-or-later.

Source: https://github.com/lichess-org/chessground

## cburnett piece set — GPL-2.0-or-later

The piece graphics, embedded as data URIs inside chessground's stylesheet.
Originally by Colin M.L. Burnett.

## React — MIT

Source: https://github.com/facebook/react

---

Sounds are synthesised at runtime by `src/ui/sound.js`; no audio files are
bundled and none are third-party. The move generator, SAN parser and PGN parser
in `src/engine/` are original to this project.
