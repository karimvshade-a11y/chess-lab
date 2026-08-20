import { useState, useEffect, useMemo, useRef } from "react";

/* ============================ engine (perft-verified) ============================ */
const FILES = "abcdefgh";
const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const nameSq = (s) => (8 - parseInt(s[1], 10)) * 8 + FILES.indexOf(s[0]);

function parseFEN(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of placement) {
    if (ch === "/") continue;
    if (/\d/.test(ch)) { i += parseInt(ch, 10); continue; }
    board[i++] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? "w" : "b" };
  }
  return {
    board, turn,
    castling: { K: castling.includes("K"), Q: castling.includes("Q"), k: castling.includes("k"), q: castling.includes("q") },
    ep: ep && ep !== "-" ? nameSq(ep) : null,
    half: parseInt(half || "0", 10), full: parseInt(full || "1", 10),
  };
}

const KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const BI = [[-1,-1],[-1,1],[1,-1],[1,1]];
const RO = [[-1,0],[1,0],[0,-1],[0,1]];
const KI = [...BI, ...RO];
const rf = (i) => [Math.floor(i / 8), i % 8];
const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;

function isAttacked(s, sq, by) {
  const [r, f] = rf(sq);
  for (const [dr, df] of KN) {
    const nr = r + dr, nf = f + df;
    if (!inb(nr, nf)) continue;
    const p = s.board[nr * 8 + nf];
    if (p && p.c === by && p.t === "n") return true;
  }
  for (const [dr, df] of KI) {
    const nr = r + dr, nf = f + df;
    if (!inb(nr, nf)) continue;
    const p = s.board[nr * 8 + nf];
    if (p && p.c === by && p.t === "k") return true;
  }
  const pd = by === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    const nr = r + pd, nf = f + df;
    if (!inb(nr, nf)) continue;
    const p = s.board[nr * 8 + nf];
    if (p && p.c === by && p.t === "p") return true;
  }
  for (const [dirs, types] of [[BI, "bq"], [RO, "rq"]]) {
    for (const [dr, df] of dirs) {
      let nr = r + dr, nf = f + df;
      while (inb(nr, nf)) {
        const p = s.board[nr * 8 + nf];
        if (p) { if (p.c === by && types.includes(p.t)) return true; break; }
        nr += dr; nf += df;
      }
    }
  }
  return false;
}

const kingSq = (s, c) => s.board.findIndex((p) => p && p.t === "k" && p.c === c);
const inCheck = (s, c) => { const k = kingSq(s, c); return k >= 0 && isAttacked(s, k, c === "w" ? "b" : "w"); };

function pseudoMoves(s) {
  const me = s.turn, opp = me === "w" ? "b" : "w";
  const out = [];
  const push = (from, to, extra = {}) => out.push({ from, to, ...extra });
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p || p.c !== me) continue;
    const [r, f] = rf(i);
    if (p.t === "p") {
      const dir = me === "w" ? -1 : 1;
      const startRank = me === "w" ? 6 : 1;
      const promoRank = me === "w" ? 0 : 7;
      const one = (r + dir) * 8 + f;
      if (inb(r + dir, f) && !s.board[one]) {
        if (r + dir === promoRank) for (const q of "qrbn") push(i, one, { promo: q });
        else {
          push(i, one);
          const two = (r + 2 * dir) * 8 + f;
          if (r === startRank && !s.board[two]) push(i, two, { dbl: true });
        }
      }
      for (const df of [-1, 1]) {
        const nr = r + dir, nf = f + df;
        if (!inb(nr, nf)) continue;
        const t = nr * 8 + nf, tp = s.board[t];
        if (tp && tp.c === opp) {
          if (nr === promoRank) for (const q of "qrbn") push(i, t, { promo: q });
          else push(i, t);
        } else if (!tp && s.ep === t) push(i, t, { ep: true });
      }
    } else if (p.t === "n" || p.t === "k") {
      for (const [dr, df] of p.t === "n" ? KN : KI) {
        const nr = r + dr, nf = f + df;
        if (!inb(nr, nf)) continue;
        const t = nr * 8 + nf;
        if (!s.board[t] || s.board[t].c === opp) push(i, t);
      }
    } else {
      const dirs = p.t === "b" ? BI : p.t === "r" ? RO : KI;
      for (const [dr, df] of dirs) {
        let nr = r + dr, nf = f + df;
        while (inb(nr, nf)) {
          const t = nr * 8 + nf, tp = s.board[t];
          if (!tp) push(i, t);
          else { if (tp.c === opp) push(i, t); break; }
          nr += dr; nf += df;
        }
      }
    }
  }
  const rank = me === "w" ? 7 : 0;
  const kSq = rank * 8 + 4;
  const canK = me === "w" ? s.castling.K : s.castling.k;
  const canQ = me === "w" ? s.castling.Q : s.castling.q;
  const kp = s.board[kSq];
  if (kp && kp.t === "k" && kp.c === me && !isAttacked(s, kSq, opp)) {
    if (canK && !s.board[kSq + 1] && !s.board[kSq + 2] && !isAttacked(s, kSq + 1, opp) && !isAttacked(s, kSq + 2, opp)) {
      const rk = s.board[rank * 8 + 7];
      if (rk && rk.t === "r" && rk.c === me) push(kSq, kSq + 2, { castle: "k" });
    }
    if (canQ && !s.board[kSq - 1] && !s.board[kSq - 2] && !s.board[kSq - 3] && !isAttacked(s, kSq - 1, opp) && !isAttacked(s, kSq - 2, opp)) {
      const rk = s.board[rank * 8];
      if (rk && rk.t === "r" && rk.c === me) push(kSq, kSq - 2, { castle: "q" });
    }
  }
  return out;
}

function makeMove(s, m) {
  const board = s.board.slice();
  const p = board[m.from], me = p.c;
  const castling = { ...s.castling };
  board[m.to] = m.promo ? { t: m.promo, c: me } : p;
  board[m.from] = null;
  if (m.ep) board[m.to + (me === "w" ? 1 : -1) * 8] = null;
  if (m.castle) {
    const rank = Math.floor(m.from / 8);
    if (m.castle === "k") { board[rank * 8 + 5] = board[rank * 8 + 7]; board[rank * 8 + 7] = null; }
    else { board[rank * 8 + 3] = board[rank * 8]; board[rank * 8] = null; }
  }
  if (p.t === "k") { if (me === "w") { castling.K = castling.Q = false; } else { castling.k = castling.q = false; } }
  const corners = { 56: "Q", 63: "K", 0: "q", 7: "k" };
  for (const sq of [m.from, m.to]) if (corners[sq]) castling[corners[sq]] = false;
  return {
    board, turn: me === "w" ? "b" : "w", castling,
    ep: m.dbl ? (m.from + m.to) / 2 : null,
    half: p.t === "p" || s.board[m.to] ? 0 : s.half + 1,
    full: me === "b" ? s.full + 1 : s.full,
  };
}

const legalMoves = (s) => pseudoMoves(s).filter((m) => !inCheck(makeMove(s, m), s.turn));
const isMate = (s) => inCheck(s, s.turn) && legalMoves(s).length === 0;
const uciOf = (m) => sqName(m.from) + sqName(m.to) + (m.promo || "");

function toSAN(s, m) {
  const p = s.board[m.from];
  const after = makeMove(s, m);
  const suffix = isMate(after) ? "#" : inCheck(after, after.turn) ? "+" : "";
  if (m.castle) return (m.castle === "k" ? "O-O" : "O-O-O") + suffix;
  const capture = !!s.board[m.to] || m.ep;
  if (p.t === "p") {
    const base = capture ? FILES[m.from % 8] + "x" + sqName(m.to) : sqName(m.to);
    return base + (m.promo ? "=" + m.promo.toUpperCase() : "") + suffix;
  }
  const others = legalMoves(s).filter(
    (x) => x.to === m.to && x.from !== m.from && s.board[x.from] && s.board[x.from].t === p.t && s.board[x.from].c === p.c
  );
  let dis = "";
  if (others.length) {
    const sameFile = others.some((x) => x.from % 8 === m.from % 8);
    const sameRank = others.some((x) => Math.floor(x.from / 8) === Math.floor(m.from / 8));
    dis = !sameFile ? FILES[m.from % 8] : !sameRank ? String(8 - Math.floor(m.from / 8)) : sqName(m.from);
  }
  return p.t.toUpperCase() + dis + (capture ? "x" : "") + sqName(m.to) + suffix;
}

/* ===== content: every position verified independently by python-chess and by the
   perft-tested generator above ===== */
const DATA = {"tactics":[{"id":"t0","fen":"6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1","sol":["e1e8"],"san":"Re8#","type":"m1","theme":"Back rank","d":1,"note":"The pawn shield that protects also imprisons. This is why players spend a tempo on h3."},{"id":"t1","fen":"7k/6pp/8/8/8/8/8/R5K1 w - - 0 1","sol":["a1a8"],"san":"Ra8#","type":"m1","theme":"Back rank","d":1,"note":"Bare bones version of the most common mate in club chess."},{"id":"t2","fen":"k7/8/1K6/8/8/8/8/7R w - - 0 1","sol":["h1h8"],"san":"Rh8#","type":"m1","theme":"Ladder mate","d":1,"note":"King takes away the escape squares, rook delivers. Learn this before anything else."},{"id":"t3","fen":"2k5/8/2K5/8/8/8/8/7R w - - 0 1","sol":["h1h8"],"san":"Rh8#","type":"m1","theme":"Opposition","d":1,"note":"Direct opposition means the enemy king has nowhere to run when the rook arrives."},{"id":"t4","fen":"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4","sol":["f3f7"],"san":"Qxf7#","type":"m1","theme":"Scholar's mate","d":1,"note":"Two pieces hitting f7, the weakest square in the opening. Know it so you never fall for it."},{"id":"t5","fen":"2r3k1/5ppp/8/8/8/8/5PPP/2Q3K1 w - - 0 1","sol":["c1c8"],"san":"Qxc8#","type":"m1","theme":"Back rank","d":1,"note":"The rook defends the back rank alone. Removing it is mate, so it was never really defending."},{"id":"t6","fen":"3r2k1/pp3ppp/8/8/8/8/PP3PPP/3RR1K1 w - - 0 1","sol":["d1d8"],"san":"Rxd8#","type":"m1","theme":"Doubling","d":1,"note":"Doubled rooks on an open file: the first one is expendable."},{"id":"t7","fen":"2b2b2/1p2p2r/k6p/p1PKPp2/2PR1P2/1P4R1/PB5P/8 b - - 1 45","sol":["e7e6"],"san":"e6#","type":"m1","theme":"Pawn mate","d":1,"note":""},{"id":"t8","fen":"8/ppNb4/3p4/P4ppp/5p2/P3kP2/4P2P/B3K2R w K - 1 45","sol":["c7d5"],"san":"Nd5#","type":"m1","theme":"Knight mate","d":2,"note":""},{"id":"t9","fen":"r1bq1br1/1p1p4/6pk/p2NKp1p/P1PP1P1P/2N1P3/6B1/R7 b - - 0 42","sol":["d7d6"],"san":"d6#","type":"m1","theme":"Pawn mate","d":2,"note":""},{"id":"t10","fen":"r3k2N/pp1p4/n7/2pP3p/2P2p2/1P1P1P2/P2q2PP/6K1 b - - 3 30","sol":["d2e1"],"san":"Qe1#","type":"m1","theme":"Back rank","d":2,"note":""},{"id":"t11","fen":"rk3br1/ppp1p1p1/6pp/2P5/B1bR1P1P/P7/1PP3P1/R1K5 w - - 9 30","sol":["d4d8"],"san":"Rd8#","type":"m1","theme":"Back rank","d":2,"note":""},{"id":"t12","fen":"rn2k1r1/pp1b3p/3p1p2/K1p5/2PpPpPP/PP6/R2P4/2B2B2 b - - 2 41","sol":["b7b6"],"san":"b6#","type":"m1","theme":"Pawn mate","d":2,"note":""},{"id":"t13","fen":"1rbk1bQ1/1pqpp3/p7/1pP1pP1p/1P2P2P/P5K1/6P1/5RR1 w - - 3 43","sol":["g8f8"],"san":"Qxf8#","type":"m1","theme":"Back rank","d":2,"note":""},{"id":"t14","fen":"3r2nr/1p4pp/p7/P3p3/2p1kp1b/2P4P/1P2K2P/5B2 b - - 9 37","sol":["f4f3"],"san":"f3#","type":"m1","theme":"Pawn mate","d":2,"note":""},{"id":"t15","fen":"rnQ2q1k/pp5p/5pp1/5p2/P2p1P2/8/1PPP2PP/R1B2KR1 w - - 1 26","sol":["c8f8"],"san":"Qxf8#","type":"m1","theme":"Queen mate","d":2,"note":""},{"id":"t16","fen":"r1bq2r1/1p1p4/6pk/p1bNKp1p/P1P2P1P/2N1P3/3P2B1/R7 b - - 1 41","sol":["d7d6"],"san":"d6#","type":"m1","theme":"Pawn mate","d":2,"note":""},{"id":"t17","fen":"4kb2/1p5r/pN6/B2Ppbpp/2K2p2/1P6/P1P1PPPP/4RBR1 b - - 7 32","sol":["h7c7"],"san":"Rc7#","type":"m1","theme":"Rook mate","d":2,"note":""},{"id":"t18","fen":"rk6/1p6/8/p1K1Pb1p/P1P4p/1Q1R4/1P1P3P/2B4B w - - 1 46","sol":["b3b7"],"san":"Qxb7#","type":"m1","theme":"Kiss of death","d":3,"note":""},{"id":"t19","fen":"5b1r/1p1k3p/4p1p1/p3Kp2/P4P1P/8/RP2P2P/2r4B b - - 1 40","sol":["f8g7"],"san":"Bg7#","type":"m1","theme":"Bishop mate","d":3,"note":""},{"id":"t20","fen":"qn3b2/3ppppr/8/2pPPP1p/pkB1QB2/5K1P/PP2R1P1/8 w - - 4 46","sol":["f4d2"],"san":"Bd2#","type":"m1","theme":"Bishop mate","d":3,"note":""},{"id":"t21","fen":"r1bQ4/1ppp2pp/8/p2K4/2PP1k2/bP1B4/P2P2PP/R5NR w - - 4 29","sol":["d8h4"],"san":"Qh4#","type":"m1","theme":"Queen mate","d":3,"note":""},{"id":"t22","fen":"8/p3Q1pp/8/P1p5/1bP1pk1P/7R/2pP1P2/R1B1K3 w - - 21 46","sol":["e7g5"],"san":"Qg5#","type":"m1","theme":"Kiss of death","d":3,"note":""},{"id":"t23","fen":"2b1kr2/3p3p/1p3P2/p1p1PB2/2P1Kb2/1P6/P6P/5q2 b - - 10 44","sol":["c8b7"],"san":"Bb7#","type":"m1","theme":"Bishop mate","d":3,"note":""},{"id":"t24","fen":"4Q3/4p2p/pkp5/5Bp1/1P1Pp3/P3P3/6PP/R4KR1 w - - 0 40","sol":["e8b8"],"san":"Qb8#","type":"m1","theme":"Queen mate","d":3,"note":""},{"id":"t25","fen":"1r6/p3pk1p/2r2b2/2P2p1p/K2p1P1P/P5P1/1P2NN2/7R b - - 6 40","sol":["c6a6"],"san":"Ra6#","type":"m1","theme":"Rook mate","d":3,"note":""},{"id":"t26","fen":"1rbk3N/pppp4/6pp/1Pb5/2P1QNP1/7K/P2PP2P/2B5 w - - 3 35","sol":["h8f7"],"san":"Nf7#","type":"m1","theme":"Knight mate","d":3,"note":""},{"id":"t27","fen":"r1b3r1/3pk2p/pp3b2/2p1pPp1/K1P1n1P1/PP1P3P/q7/2B5 b - - 0 35","sol":["e4c3"],"san":"Nc3#","type":"m1","theme":"Knight mate","d":3,"note":""},{"id":"t28","fen":"rn6/1p3k1p/p5p1/P1b5/2bprP2/7P/1P1P3R/K7 b - - 1 45","sol":["e4e1"],"san":"Re1#","type":"m1","theme":"Rook mate","d":3,"note":""},{"id":"t29","fen":"Nnbk4/1p4p1/pKn4r/P1P4p/7P/6P1/QP2P3/2q5 b - - 8 45","sol":["b8d7"],"san":"Nd7#","type":"m1","theme":"Knight mate","d":3,"note":""},{"id":"t30","fen":"4k2r/3p3p/bp3P1b/p1p1P3/2P1q3/3B4/PP5P/RK6 b - - 2 34","sol":["e4d3"],"san":"Qxd3#","type":"m1","theme":"Back rank","d":3,"note":""},{"id":"t31","fen":"N1bk2nr/1p1p2p1/p3n3/P1b2p1p/Q1P4P/5KP1/1P1PP3/2q2B2 b - - 0 26","sol":["c1f1"],"san":"Qxf1#","type":"m1","theme":"Queen mate","d":3,"note":""},{"id":"t32","fen":"r1b1k1r1/pp1pb1pp/8/2p1P3/q1P2p2/6nP/PP1P2P1/RNK5 b q - 10 27","sol":["g3e2"],"san":"Ne2#","type":"m1","theme":"Knight mate","d":3,"note":""},{"id":"t33","fen":"r7/1p4p1/p3bk1p/5p1P/3KpP2/P5P1/4P3/2q5 b - - 4 38","sol":["a8d8"],"san":"Rd8#","type":"m1","theme":"Rook mate","d":3,"note":""},{"id":"t34","fen":"5k1r/rpp1p3/6P1/p1PQPn2/3P1B1p/8/PP5P/R3KB1R w KQ - 4 32","sol":["d5f7"],"san":"Qf7#","type":"m1","theme":"Kiss of death","d":3,"note":""},{"id":"t35","fen":"5k2/rpp1p3/6P1/pBP1Pn1r/2QP1B2/7p/PP5P/R4RK1 w - - 0 36","sol":["c4f7"],"san":"Qf7#","type":"m1","theme":"Kiss of death","d":3,"note":""},{"id":"t36","fen":"6k1/pqp5/1p3p1Q/3P1B1p/P1RPP1p1/1P4P1/5K1P/7R w - - 7 42","sol":["f5e6"],"san":"Be6#","type":"m1","theme":"Bishop mate","d":3,"note":""},{"id":"t37","fen":"1q4k1/p1p5/1p3p1Q/3P1B1p/P1RPP1p1/1P4P1/5K1P/6R1 w - - 13 45","sol":["f5e6"],"san":"Be6#","type":"m1","theme":"Bishop mate","d":3,"note":""},{"id":"t38","fen":"3k1b2/4ppp1/2Q5/p1p2P1p/2p2P2/6P1/P1P4P/1RB1K3 w - - 9 46","sol":["b1b8"],"san":"Rb8#","type":"m1","theme":"Rook mate","d":3,"note":""},{"id":"t39","fen":"B3q3/p2p2pp/bp1r1k2/2p5/P1Pn1bP1/8/1P1PPP2/RQB1K3 b - - 2 31","sol":["e8e2"],"san":"Qxe2#","type":"m1","theme":"Back rank","d":3,"note":""},{"id":"t40","fen":"3r4/1p4p1/p3bk1p/2q2p1P/4pP2/P5P1/4P3/4K3 b - - 18 45","sol":["c5g1"],"san":"Qg1#","type":"m1","theme":"Queen mate","d":3,"note":""},{"id":"t41","fen":"r1b2k1r/pp1p1ppp/2n5/1KP5/4qbPP/1P6/PR1P1n2/2B2B2 b - - 2 35","sol":["e4b4"],"san":"Qb4#","type":"m1","theme":"Kiss of death","d":3,"note":""},{"id":"t42","fen":"5br1/p2bk1pp/3p4/6K1/2P1PPP1/P7/7P/6r1 b - - 2 42","sol":["g1g4"],"san":"Rxg4+","type":"m2","theme":"Rook mate","d":3,"note":""},{"id":"t43","fen":"8/p7/1k6/1ppK2pp/8/RP3P1B/QPN4P/7R w - - 2 43","sol":["a3a7"],"san":"Rxa7","type":"m2","theme":"Rook mate","d":3,"note":""},{"id":"t44","fen":"r7/1p4p1/p3bk1p/5p1P/3qpP2/P5P1/4P3/2K5 b - - 14 43","sol":["e6a2"],"san":"Ba2","type":"m2","theme":"Bishop mate","d":3,"note":""},{"id":"t45","fen":"6r1/1p2k1p1/1P2p3/1K3p2/2r2P1p/5P1P/P5P1/6b1 b - - 15 37","sol":["g8c8"],"san":"Rgc8","type":"m2","theme":"Rook mate","d":3,"note":""},{"id":"t46","fen":"8/p4ppk/8/1p2P2p/3p1P1P/1P4PK/P3Pq2/8 b - - 7 44","sol":["f2g1"],"san":"Qg1","type":"m2","theme":"Queen mate","d":3,"note":""}],"openings":[{"id":"o0","name":"Italian Game","family":"e4 e5","side":"White","note":"The friendliest way to play 1.e4. Bishop eyes f7, c3 and d3 build a slow, solid centre you can push with d4 later.","uci":["e2e4","e7e5","g1f3","b8c6","f1c4","f8c5","c2c3","g8f6","d2d3","d7d6","e1g1","e8g8"],"san":["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d3","d6","O-O","O-O"]},{"id":"o1","name":"Ruy Lopez, Morphy Defence","family":"e4 e5","side":"White","note":"The most respected 1.e4 opening. Bb5 pressures the knight that defends e5; the a6/b5 chase gains time but loosens the queenside.","uci":["e2e4","e7e5","g1f3","b8c6","f1b5","a7a6","b5a4","g8f6","e1g1","f8e7","f1e1","b7b5","a4b3","d7d6","c2c3","e8g8"],"san":["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7","Re1","b5","Bb3","d6","c3","O-O"]},{"id":"o2","name":"Scotch Game","family":"e4 e5","side":"White","note":"Rips the centre open immediately. Great if you hate memorising 20 moves of Ruy Lopez theory.","uci":["e2e4","e7e5","g1f3","b8c6","d2d4","e5d4","f3d4","f8c5","c1e3","d8f6","c2c3","g8e7"],"san":["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Bc5","Be3","Qf6","c3","Nge7"]},{"id":"o3","name":"Sicilian Najdorf","family":"e4 c5","side":"Black","note":"Black trades a wing pawn for a centre pawn and gets the half-open c-file. a6 stops Nb5 and prepares queenside expansion.","uci":["e2e4","c7c5","g1f3","d7d6","d2d4","c5d4","f3d4","g8f6","b1c3","a7a6"],"san":["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"]},{"id":"o4","name":"Caro-Kann, Classical","family":"e4 c6","side":"Black","note":"Solid as a brick. Unlike the French, Black develops the light-squared bishop outside the pawn chain before playing e6.","uci":["e2e4","c7c6","d2d4","d7d5","b1c3","d5e4","c3e4","c8f5","e4g3","f5g6","h2h4","h7h6"],"san":["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5","Ng3","Bg6","h4","h6"]},{"id":"o5","name":"French Defence","family":"e4 e6","side":"Black","note":"Concede space, then hit the base of White's chain with c5 and f6. Your light-squared bishop is the problem piece.","uci":["e2e4","e7e6","d2d4","d7d5","b1c3","g8f6","c1g5","f8e7","e4e5","f6d7"],"san":["e4","e6","d4","d5","Nc3","Nf6","Bg5","Be7","e5","Nfd7"]},{"id":"o6","name":"Queen's Gambit Declined","family":"d4 d5","side":"Black","note":"Not really a gambit: after dxc5 White regains the pawn. Declining with e6 keeps a rock-solid centre.","uci":["d2d4","d7d5","c2c4","e7e6","b1c3","g8f6","c1g5","f8e7","e2e3","e8g8","g1f3","h7h6"],"san":["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","e3","O-O","Nf3","h6"]},{"id":"o7","name":"London System","family":"d4 d5","side":"White","note":"Same setup against almost anything. Get the bishop outside the pawn chain before e3 or you'll bury it.","uci":["d2d4","d7d5","g1f3","g8f6","c1f4","e7e6","e2e3","c7c5","c2c3","b8c6","b1d2","f8d6"],"san":["d4","d5","Nf3","Nf6","Bf4","e6","e3","c5","c3","Nc6","Nbd2","Bd6"]},{"id":"o8","name":"King's Indian Defence","family":"d4 Nf6","side":"Black","note":"Hand White the centre, then blow it up. Black castles fast and storms the kingside with f5.","uci":["d2d4","g8f6","c2c4","g7g6","b1c3","f8g7","e2e4","d7d6","g1f3","e8g8","f1e2","e7e5"],"san":["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Nf3","O-O","Be2","e5"]},{"id":"o9","name":"Nimzo-Indian","family":"d4 Nf6","side":"Black","note":"Pin the knight, damage the structure, play on the light squares. A favourite of positional players.","uci":["d2d4","g8f6","c2c4","e7e6","b1c3","f8b4","e2e3","e8g8","f1d3","d7d5","g1f3","c7c5"],"san":["d4","Nf6","c4","e6","Nc3","Bb4","e3","O-O","Bd3","d5","Nf3","c5"]},{"id":"o10","name":"Légal's Mate","family":"Traps","side":"White","note":"White gives up the queen to mate with three minor pieces. The trap springs because Black grabs the queen instead of taking the knight.","uci":["e2e4","e7e5","g1f3","b8c6","f1c4","d7d6","b1c3","c8g4","h2h3","g4h5","f3e5","h5d1","c4f7","e8e7","c3d5"],"san":["e4","e5","Nf3","Nc6","Bc4","d6","Nc3","Bg4","h3","Bh5","Nxe5","Bxd1","Bxf7+","Ke7","Nd5#"]},{"id":"o11","name":"Fried Liver Attack","family":"Traps","side":"White","note":"White sacs a knight to drag the king out. Black must know the Traxler or the Kd5 defence to survive.","uci":["e2e4","e7e5","g1f3","b8c6","f1c4","g8f6","f3g5","d7d5","e4d5","f6d5","g5f7","e8f7","d1f3","f7e6","b1c3"],"san":["e4","e5","Nf3","Nc6","Bc4","Nf6","Ng5","d5","exd5","Nxd5","Nxf7","Kxf7","Qf3+","Ke6","Nc3"]},{"id":"o12","name":"Englund Gambit Trap","family":"Traps","side":"Black","note":"The trap Black is hoping for. If White plays Qd2 the queen gets trapped on the back rank.","uci":["d2d4","e7e5","d4e5","b8c6","g1f3","d8e7","c1f4","e7b4","f4d2","b4b2","d2c3","f8b4","d1d2","b4c3","d2c3","b2c1"],"san":["d4","e5","dxe5","Nc6","Nf3","Qe7","Bf4","Qb4+","Bd2","Qxb2","Bc3","Bb4","Qd2","Bxc3","Qxc3","Qc1#"]},{"id":"o13","name":"Blackburne Shilling Trap","family":"Traps","side":"Black","note":"Named after the pennies Blackburne won with it. White's greed on f7 costs the game.","uci":["e2e4","e7e5","g1f3","b8c6","f1c4","c6d4","f3e5","d8g5","e5f7","g5g2","h1f1","g2e4","c4e2","d4f3"],"san":["e4","e5","Nf3","Nc6","Bc4","Nd4","Nxe5","Qg5","Nxf7","Qxg2","Rf1","Qxe4+","Be2","Nf3#"]}],"endgames":[{"id":"e0","fen":"8/8/8/8/8/8/K1k1P3/8 w - - 0 1","sol":["e2e4"],"san":"e4","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e1","fen":"8/8/8/P7/3k1K2/8/8/8 w - - 0 1","sol":["a5a6"],"san":"a6","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e2","fen":"3k4/8/4K3/8/1P6/8/8/8 w - - 0 1","sol":["e6d6"],"san":"Kd6","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e3","fen":"8/8/8/8/8/1P6/2k5/5K2 w - - 0 1","sol":["b3b4"],"san":"b4","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e4","fen":"3k4/8/8/PK6/8/8/8/8 w - - 0 1","sol":["a5a6"],"san":"a6","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e5","fen":"8/8/2k5/8/1K6/4P3/8/8 w - - 0 1","sol":["b4c4"],"san":"Kc4","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e6","fen":"4K3/8/8/3k4/6P1/8/8/8 w - - 0 1","sol":["e8f7"],"san":"Kf7","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e7","fen":"8/8/6k1/8/7K/8/6P1/8 w - - 0 1","sol":["h4g4"],"san":"Kg4","res":"win","turn":"w","prompt":"White to play and win. Only one move does it."},{"id":"e8","fen":"8/2K5/8/7P/4k3/8/8/8 b - - 0 1","sol":["e4f5"],"san":"Kf5","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."},{"id":"e9","fen":"2k5/8/P4K2/8/8/8/8/8 b - - 0 1","sol":["c8b8"],"san":"Kb8","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."},{"id":"e10","fen":"8/8/3K4/8/6k1/8/4P3/8 b - - 0 1","sol":["g4f4"],"san":"Kf4","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."},{"id":"e11","fen":"6k1/8/8/4PK2/8/8/8/8 b - - 0 1","sol":["g8f7"],"san":"Kf7","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."},{"id":"e12","fen":"8/1k6/8/3K4/8/1P6/8/8 b - - 0 1","sol":["b7b6"],"san":"Kb6","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."},{"id":"e13","fen":"1K6/8/4P3/2k5/8/8/8/8 b - - 0 1","sol":["c5d6"],"san":"Kd6","res":"draw","turn":"b","prompt":"Black to play and draw. Only one move holds."}]};

/* ============================ design tokens ============================ */
const C = {
  paper: "#EFEDE6", card: "#FBFAF6", ink: "#14161C", mute: "#6E6B63", line: "#D8D3C5",
  indigo: "#2E3260", sqL: "#E7E2D5", sqD: "#767BA0",
  red: "#A8241C", green: "#2C6B4E", amber: "#B0791A",
};
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif';
const GLYPH = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };

const label = (extra = {}) => ({
  fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
  color: C.mute, ...extra,
});

/* ============================ storage ============================ */
const KEY = "chesslab:v2";
const blank = () => ({
  rating: 1000, best: 1000, streak: 0, bestStreak: 0, day: "", todaySolved: 0,
  solved: 0, attempts: 0, themes: {}, review: {}, seen: {}, openings: {}, endgames: {},
});

async function loadState() {
  try {
    const r = await window.storage.get(KEY);
    if (r && r.value) return { ...blank(), ...JSON.parse(r.value) };
  } catch (e) { /* first run: nothing stored yet */ }
  return blank();
}
async function saveState(s) {
  try { await window.storage.set(KEY, JSON.stringify(s)); } catch (e) { /* keep playing offline */ }
}

const today = () => new Date().toISOString().slice(0, 10);
const DAY = 86400000;
const BOX = [0, DAY, 3 * DAY, 7 * DAY, 21 * DAY];

/* ============================ board ============================ */
function Board({ pos, orient = "w", selected, targets = [], last, flash, onTap, checkSq }) {
  const order = [];
  for (let i = 0; i < 64; i++) order.push(orient === "w" ? i : 63 - i);
  return (
    <div
      style={{
        width: "100%", display: "grid", gridTemplateColumns: "repeat(8, 1fr)",
        border: `2px solid ${C.indigo}`, aspectRatio: "1 / 1",
        boxShadow: flash === "ok" ? `0 0 0 3px ${C.green}` : flash === "bad" ? `0 0 0 3px ${C.red}` : "none",
        transition: "box-shadow 140ms ease",
      }}
    >
      {order.map((sq) => {
        const [r, f] = [Math.floor(sq / 8), sq % 8];
        const dark = (r + f) % 2 === 1;
        const p = pos.board[sq];
        const isTarget = targets.includes(sq);
        const cap = isTarget && (!!p || (pos.ep === sq && p === null));
        const showFile = orient === "w" ? r === 7 : r === 0;
        const showRank = orient === "w" ? f === 0 : f === 7;
        return (
          <div
            key={sq}
            onClick={() => onTap && onTap(sq)}
            style={{
              position: "relative", background: dark ? C.sqD : C.sqL,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: onTap ? "pointer" : "default", userSelect: "none",
            }}
          >
            {last && (last.from === sq || last.to === sq) && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(176,121,26,0.30)" }} />
            )}
            {selected === sq && <div style={{ position: "absolute", inset: 0, background: "rgba(176,121,26,0.55)" }} />}
            {checkSq === sq && <div style={{ position: "absolute", inset: 0, background: "rgba(168,36,28,0.40)" }} />}
            {isTarget && !cap && (
              <div style={{ position: "absolute", width: "26%", height: "26%", borderRadius: "50%", background: "rgba(20,22,28,0.34)" }} />
            )}
            {cap && (
              <div style={{ position: "absolute", inset: "6%", borderRadius: "50%", border: "3px solid rgba(20,22,28,0.34)" }} />
            )}
            {p && (
              <span
                style={{
                  position: "relative", fontSize: "min(7.4vw, 34px)", lineHeight: 1,
                  color: p.c === "w" ? "#FCFBF7" : C.ink,
                  textShadow: p.c === "w"
                    ? "0 1px 0 #14161C, 0 -1px 0 #14161C, 1px 0 0 #14161C, -1px 0 0 #14161C, 0 2px 3px rgba(0,0,0,.25)"
                    : "0 1px 2px rgba(255,255,255,.28)",
                }}
              >
                {GLYPH[p.t]}
              </span>
            )}
            {showFile && (
              <span style={{ position: "absolute", bottom: 1, right: 3, fontFamily: MONO, fontSize: 8, opacity: 0.55, color: C.ink }}>
                {FILES[f]}
              </span>
            )}
            {showRank && (
              <span style={{ position: "absolute", top: 1, left: 3, fontFamily: MONO, fontSize: 8, opacity: 0.55, color: C.ink }}>
                {8 - r}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================ small parts ============================ */
function Btn({ children, onClick, kind = "quiet", disabled, full }) {
  const styles = {
    primary: { background: C.indigo, color: "#F7F5EF", border: `1px solid ${C.indigo}` },
    quiet: { background: "transparent", color: C.ink, border: `1px solid ${C.line}` },
    warn: { background: "transparent", color: C.amber, border: `1px solid ${C.amber}` },
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, ...label({ color: styles.color }), padding: "10px 14px", borderRadius: 2,
        opacity: disabled ? 0.35 : 1, flex: full ? 1 : "none", cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Scoresheet({ moves }) {
  if (!moves.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", fontFamily: MONO, fontSize: 12, color: C.ink }}>
      {moves.map((m, i) => (
        <span key={i} style={{ color: m.bad ? C.red : m.good ? C.green : C.ink }}>
          {m.num ? <span style={{ color: C.mute }}>{m.num}.</span> : null}
          {m.san}
          {m.mark ? <span style={{ color: m.bad ? C.red : C.amber }}>{m.mark}</span> : null}
        </span>
      ))}
    </div>
  );
}

function Bar({ pct, tone }) {
  return (
    <div style={{ height: 4, background: C.line, width: "100%" }}>
      <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, background: tone }} />
    </div>
  );
}

/* ============================ interactive board ============================ */
function PlayBoard({ pos, orient, last, flash, locked, onMove, hintSq }) {
  const [sel, setSel] = useState(null);
  const [promo, setPromo] = useState(null);
  const moves = useMemo(() => (locked ? [] : legalMoves(pos)), [pos, locked]);
  useEffect(() => { setSel(null); setPromo(null); }, [pos]);

  const fromSel = moves.filter((m) => m.from === sel);
  const checkSq = inCheck(pos, pos.turn) ? kingSq(pos, pos.turn) : null;

  const tap = (sq) => {
    if (locked) return;
    const opts = fromSel.filter((m) => m.to === sq);
    if (opts.length > 1) { setPromo({ from: sel, to: sq, opts }); return; }
    if (opts.length === 1) { onMove(opts[0]); setSel(null); return; }
    setSel(moves.some((m) => m.from === sq) ? sq : null);
  };

  return (
    <div style={{ position: "relative" }}>
      <Board
        pos={pos} orient={orient} selected={sel != null ? sel : hintSq}
        targets={fromSel.map((m) => m.to)} last={last} flash={flash}
        checkSq={checkSq} onTap={tap}
      />
      {promo && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(20,22,28,0.72)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {["q", "r", "b", "n"].map((t) => (
            <button
              key={t}
              onClick={() => { const m = promo.opts.find((x) => x.promo === t); setPromo(null); if (m) onMove(m); }}
              style={{ background: C.card, border: "none", padding: "10px 12px", fontSize: 28, lineHeight: 1, color: C.ink, cursor: "pointer" }}
            >
              {GLYPH[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ tactics ============================ */
const THEME_NOTE = {
  "Back rank": "A back rank is only defended if the defender cannot be removed, deflected or overloaded.",
  "Rook mate": "Rooks mate on the edge. Cut the king off first, then bring the second attacker.",
  "Queen mate": "The queen never mates alone. Find the piece or pawn covering her escape squares.",
  "Kiss of death": "The queen steps right next to the king, protected by a friend. No flight squares, no capture.",
  "Knight mate": "A king can never step out of a knight's attack by moving one square. That is why knight mates feel invisible.",
  "Smothered": "His own pieces take away every flight square. The knight only has to arrive.",
  "Bishop mate": "Bishops mate along the long diagonal once the king is already boxed in by its own men.",
  "Pawn mate": "If a pawn is delivering mate, every other escape was already covered. Count the flight squares first.",
  "Ladder mate": "King takes the escape squares, rook delivers. The first mate worth knowing cold.",
  "Opposition": "Direct opposition means the enemy king has nowhere to run when the heavy piece arrives.",
};
const noteFor = (it) => it.note || THEME_NOTE[it.theme] || "Pattern logged for review.";

const BANDS = (r) => (r < 1150 ? [1] : r < 1400 ? [1, 2] : [1, 2, 3]);

function pickTactic(stats, avoidId) {
  const now = Date.now();
  const due = DATA.tactics.filter((t) => stats.review[t.id] && stats.review[t.id].due <= now && t.id !== avoidId);
  if (due.length) return due[Math.floor(Math.random() * due.length)];
  const band = BANDS(stats.rating);
  const acc = (theme) => {
    const s = stats.themes[theme];
    return s && s.tries >= 2 ? s.ok / s.tries : 0.5;
  };
  let pool = DATA.tactics.filter((t) => band.includes(t.d) && !stats.seen[t.id] && t.id !== avoidId);
  if (!pool.length) {
    pool = DATA.tactics.filter((t) => t.id !== avoidId);
    pool.sort((a, b) => (stats.seen[a.id] || 0) - (stats.seen[b.id] || 0));
    pool = pool.slice(0, 12);
  }
  pool.sort((a, b) => acc(a.theme) - acc(b.theme));
  const weak = pool.slice(0, Math.max(3, Math.ceil(pool.length / 2)));
  return weak[Math.floor(Math.random() * weak.length)];
}

function Tactics({ stats, update }) {
  const [item, setItem] = useState(() => pickTactic(stats, null));
  const [pos, setPos] = useState(() => parseFEN(item.fen));
  const [phase, setPhase] = useState("solve");
  const [last, setLast] = useState(null);
  const [flash, setFlash] = useState(null);
  const [sheet, setSheet] = useState([]);
  const [hint, setHint] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const load = (it) => {
    setItem(it); setPos(parseFEN(it.fen)); setPhase("solve");
    setLast(null); setFlash(null); setSheet([]); setHint(false);
  };

  const finish = (won) => {
    setPhase(won ? "solved" : "failed");
    setFlash(won ? "ok" : "bad");
    update((s) => {
      const th = s.themes[item.theme] || { ok: 0, tries: 0 };
      const rv = s.review[item.id] || { box: 0, due: 0 };
      const gain = won ? (hint ? 4 : 8 + item.d * 5) : -(6 + item.d * 2);
      const box = won ? Math.min(4, rv.box + 1) : 1;
      return {
        ...s,
        rating: Math.max(600, Math.min(2400, s.rating + gain)),
        best: Math.max(s.best, s.rating + gain),
        streak: won ? s.streak + 1 : 0,
        bestStreak: Math.max(s.bestStreak, won ? s.streak + 1 : 0),
        solved: s.solved + (won ? 1 : 0),
        attempts: s.attempts + 1,
        todaySolved: s.todaySolved + (won ? 1 : 0),
        themes: { ...s.themes, [item.theme]: { ok: th.ok + (won ? 1 : 0), tries: th.tries + 1 } },
        seen: { ...s.seen, [item.id]: Date.now() },
        review: { ...s.review, [item.id]: { box, due: Date.now() + BOX[box] } },
      };
    });
  };

  const onMove = (m) => {
    const san = toSAN(pos, m);
    const after = makeMove(pos, m);
    setLast({ from: m.from, to: m.to });
    if (item.type === "m1") {
      setPos(after);
      const won = isMate(after);
      setSheet([{ san, num: pos.turn === "w" ? pos.full : null, good: won, bad: !won, mark: won ? "!" : "?" }]);
      finish(won);
      return;
    }
    if (phase === "solve") {
      if (uciOf(m) !== item.sol[0]) {
        setPos(after);
        setSheet([{ san, num: pos.turn === "w" ? pos.full : null, bad: true, mark: "?" }]);
        finish(false);
        return;
      }
      const replies = legalMoves(after);
      const rep = replies[Math.floor(Math.random() * replies.length)];
      const repSan = toSAN(after, rep);
      const next = makeMove(after, rep);
      setSheet([{ san, num: pos.turn === "w" ? pos.full : null, good: true, mark: "!" }, { san: repSan }]);
      setPos(after);
      setPhase("mid");
      timers.current.push(setTimeout(() => { setPos(next); setLast({ from: rep.from, to: rep.to }); }, 450));
      return;
    }
    setPos(after);
    const won = isMate(after);
    setSheet((s) => [...s, { san, num: pos.turn === "w" ? pos.full : null, good: won, bad: !won, mark: won ? "#" : "?" }]);
    finish(won);
  };

  const reveal = () => {
    const st = parseFEN(item.fen);
    const m = legalMoves(st).find((x) => uciOf(x) === item.sol[0]);
    setPos(st); setLast({ from: m.from, to: m.to });
    setSheet([{ san: item.san, num: st.turn === "w" ? st.full : null, mark: "\u25A1" }]);
    setPhase("shown");
  };

  const side = pos.turn === "w" ? "White" : "Black";
  const start = parseFEN(item.fen);
  const solving = phase === "solve" || phase === "mid";
  const myTurn = pos.turn === start.turn;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={label()}>
          {(start.turn === "w" ? "White" : "Black")} to play {item.type === "m2" ? "\u2014 mate in 2" : "\u2014 mate in 1"}
        </span>
        <span style={label({ color: C.amber })}>{"\u25CF".repeat(item.d)}</span>
      </div>

      <PlayBoard
        pos={pos} orient={start.turn} last={last} flash={flash} locked={!solving || !myTurn}
        onMove={onMove}
        hintSq={hint && solving ? nameSq(item.sol[0].slice(0, 2)) : null}
      />

      <Scoresheet moves={sheet} />

      <div style={{ minHeight: 62, fontFamily: SANS, fontSize: 14, color: C.ink, lineHeight: 1.45 }}>
        {phase === "solve" && <span style={{ color: C.mute }}>Find the move. {side} delivers mate.</span>}
        {phase === "mid" && <span style={{ color: C.mute }}>Good. Now finish it.</span>}
        {phase === "solved" && (
          <>
            <strong style={{ color: C.green }}>Solved — {item.theme}.</strong>{" "}
            {noteFor(item)}
          </>
        )}
        {(phase === "failed" || phase === "shown") && (
          <>
            <strong style={{ color: C.red }}>{item.theme}.</strong>{" "}
            {phase === "shown" ? `The move was ${item.san}. ` : "That one gets saved for review. "}
            {noteFor(item)}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {solving && <Btn kind="warn" onClick={() => setHint(true)} disabled={hint} full>Hint</Btn>}
        {phase === "failed" && <Btn kind="quiet" onClick={reveal} full>Show move</Btn>}
        <Btn kind="primary" full onClick={() => load(pickTactic(stats, item.id))}>
          {solving ? "Skip" : "Next"}
        </Btn>
      </div>
    </div>
  );
}

/* ============================ openings ============================ */
function Openings({ stats, update }) {
  const [line, setLine] = useState(null);
  const [pos, setPos] = useState(null);
  const [ply, setPly] = useState(0);
  const [sheet, setSheet] = useState([]);
  const [flash, setFlash] = useState(null);
  const [last, setLast] = useState(null);
  const [wrong, setWrong] = useState(0);
  const [wrongHere, setWrongHere] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const mySide = line ? (line.side === "Black" ? "b" : "w") : "w";

  const open = (l) => {
    setLine(l); setPos(parseFEN(START)); setPly(0); setSheet([]); setWrong(0); setWrongHere(0); setDone(false); setLast(null); setFlash(null);
  };

  const applyPly = (state, i) => {
    const m = legalMoves(state).find((x) => uciOf(x) === line.uci[i]);
    return { next: makeMove(state, m), m };
  };

  useEffect(() => {
    if (!line || done || !pos) return;
    const myTurn = pos.turn === mySide;
    if (myTurn || ply >= line.uci.length) return;
    const t = setTimeout(() => {
      const { next, m } = applyPly(pos, ply);
      setSheet((s) => [...s, { san: line.san[ply], num: pos.turn === "w" ? pos.full : null }]);
      setLast({ from: m.from, to: m.to });
      setPos(next);
      setPly(ply + 1);
    }, 420);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [line, pos, ply, done]);

  useEffect(() => {
    if (line && ply >= line.uci.length && !done) {
      setDone(true);
      update((s) => ({
        ...s,
        rating: Math.min(2400, s.rating + (wrong ? 2 : 6)),
        openings: { ...s.openings, [line.id]: { done: (s.openings[line.id]?.done || 0) + 1, errors: wrong } },
      }));
    }
  }, [ply, line, done]);

  const onMove = (m) => {
    if (uciOf(m) === line.uci[ply]) {
      setSheet((s) => [...s, { san: line.san[ply], num: pos.turn === "w" ? pos.full : null, good: true }]);
      setLast({ from: m.from, to: m.to });
      setPos(makeMove(pos, m));
      setPly(ply + 1);
      setWrongHere(0);
      setFlash("ok");
      timers.current.push(setTimeout(() => setFlash(null), 220));
    } else {
      setWrong((w) => w + 1);
      setWrongHere((w) => w + 1);
      setFlash("bad");
      timers.current.push(setTimeout(() => setFlash(null), 400));
    }
  };

  if (!line) {
    const fams = [...new Set(DATA.openings.map((o) => o.family))];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute, margin: 0, lineHeight: 1.5 }}>
          Play the line from your side. The opponent answers with the main line, and you have to recall the book move.
        </p>
        {fams.map((f) => (
          <div key={f} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={label({ color: C.indigo })}>{f}</div>
            {DATA.openings.filter((o) => o.family === f).map((o) => {
              const rec = stats.openings[o.id];
              return (
                <button
                  key={o.id} onClick={() => open(o)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    background: C.card, border: `1px solid ${C.line}`, borderRadius: 2,
                    padding: "11px 12px", textAlign: "left", cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: SANS, fontSize: 14, color: C.ink }}>{o.name}</span>
                  <span style={label({ color: rec ? C.green : C.mute })}>
                    {rec ? `\u2713 ${rec.done}` : o.side === "Black" ? "as black" : "as white"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={label({ color: C.indigo })}>{line.name}</span>
        <span style={label()}>{ply}/{line.uci.length}</span>
      </div>
      <PlayBoard pos={pos} orient={mySide} last={last} flash={flash} locked={done || pos.turn !== mySide} onMove={onMove} />
      <Scoresheet moves={sheet} />
      <div style={{ minHeight: 62, fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}>
        {done ? (
          <><strong style={{ color: C.green }}>Line complete.</strong> {line.note}</>
        ) : wrongHere ? (
          <span style={{ color: C.red }}>
            Not the book move.{wrongHere > 1 ? ` It is ${line.san[ply]}.` : " Try again."}
          </span>
        ) : (
          <span style={{ color: C.mute }}>
            {pos.turn === mySide ? "Your move." : "Opponent is replying\u2026"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn kind="quiet" full onClick={() => setLine(null)}>Repertoire</Btn>
        {done ? <Btn kind="primary" full onClick={() => open(line)}>Again</Btn>
              : <Btn kind="warn" full onClick={() => setWrongHere(2)}>Show move</Btn>}
      </div>
    </div>
  );
}

/* ============================ endgames ============================ */
const EG_NOTE = {
  win: "In king-and-pawn endings the pawn is not the hero \u2014 the king is. Winning means seizing the opposition or stepping onto a key square in front of the pawn before you push it.",
  draw: "The defence has exactly three resources: take the opposition, stay inside the square of the pawn, or run for the corner when it is a rook pawn. One of them is holding here.",
};

function Endgames({ stats, update }) {
  const remaining = DATA.endgames.filter((d) => !stats.endgames[d.id]);
  const [item, setItem] = useState(() => (remaining[0] || DATA.endgames[0]));
  const [pos, setPos] = useState(() => parseFEN(item.fen));
  const [phase, setPhase] = useState("solve");
  const [last, setLast] = useState(null);
  const [flash, setFlash] = useState(null);
  const [tried, setTried] = useState(null);

  const load = (it) => { setItem(it); setPos(parseFEN(it.fen)); setPhase("solve"); setLast(null); setFlash(null); setTried(null); };

  const next = () => {
    const pool = DATA.endgames.filter((d) => d.id !== item.id);
    const fresh = pool.filter((d) => !stats.endgames[d.id]);
    const arr = fresh.length ? fresh : pool;
    load(arr[Math.floor(Math.random() * arr.length)]);
  };

  const onMove = (m) => {
    const ok = uciOf(m) === item.sol[0];
    setLast({ from: m.from, to: m.to });
    setTried(toSAN(pos, m));
    setPos(makeMove(pos, m));
    setPhase(ok ? "right" : "wrong");
    setFlash(ok ? "ok" : "bad");
    update((s) => ({
      ...s,
      endgames: { ...s.endgames, [item.id]: { ok: ok || !!s.endgames[item.id]?.ok } },
      rating: Math.max(600, Math.min(2400, s.rating + (ok ? 6 : -4))),
    }));
  };

  const start = parseFEN(item.fen);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={label()}>King and pawn — only-move drill</span>
      <PlayBoard pos={pos} orient={start.turn} last={last} flash={flash} locked={phase !== "solve"} onMove={onMove} />
      <div style={{ minHeight: 84, fontFamily: SANS, fontSize: 14, lineHeight: 1.45 }}>
        {phase === "solve" && <span style={{ color: C.mute }}>{item.prompt}</span>}
        {phase === "right" && (
          <><strong style={{ color: C.green }}>{item.san} is the only one.</strong> {EG_NOTE[item.res]}</>
        )}
        {phase === "wrong" && (
          <>
            <strong style={{ color: C.red }}>{tried} throws it away.</strong>{" "}
            {item.san} was the move. {EG_NOTE[item.res]}
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {phase === "solve" && <Btn kind="quiet" full onClick={() => load(item)}>Reset</Btn>}
        <Btn kind="primary" full onClick={next}>{phase === "solve" ? "Skip" : "Next drill"}</Btn>
      </div>
    </div>
  );
}

/* ============================ progress ============================ */
function Progress({ stats, update }) {
  const [confirm, setConfirm] = useState(false);
  const themes = Object.entries(stats.themes).sort((a, b) => a[1].ok / a[1].tries - b[1].ok / b[1].tries);
  const due = DATA.tactics.filter((t) => stats.review[t.id] && stats.review[t.id].due <= Date.now()).length;
  const acc = stats.attempts ? Math.round((stats.solved / stats.attempts) * 100) : 0;
  const weakest = themes.find(([, v]) => v.tries >= 2);
  const openDone = Object.keys(stats.openings).length;
  const egDone = Object.values(stats.endgames).filter((e) => e.ok).length;

  const Row = ({ k, v }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={label()}>{k}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: C.ink }}>{v}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Row k="Puzzle rating" v={stats.rating} />
        <Row k="Peak" v={stats.best} />
        <Row k="Solved / attempts" v={`${stats.solved} / ${stats.attempts}  (${acc}%)`} />
        <Row k="Current streak" v={`${stats.streak}  \u00b7  best ${stats.bestStreak}`} />
        <Row k="Due for review" v={due} />
        <Row k="Lines learned" v={`${openDone} / ${DATA.openings.length}`} />
        <Row k="Endgame drills" v={`${egDone} / ${DATA.endgames.length}`} />
      </div>

      {themes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={label({ color: C.indigo })}>Accuracy by pattern</div>
          {themes.map(([name, v]) => {
            const pct = Math.round((v.ok / v.tries) * 100);
            return (
              <div key={name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 11, color: C.ink }}>
                  <span>{name}</span>
                  <span style={{ color: C.mute }}>{v.ok}/{v.tries}</span>
                </div>
                <Bar pct={pct} tone={pct >= 70 ? C.green : pct >= 40 ? C.amber : C.red} />
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontFamily: SANS, fontSize: 14, color: C.ink, lineHeight: 1.5, margin: 0 }}>
        {stats.attempts < 5
          ? "Solve a few more and this page will tell you which pattern is costing you games."
          : weakest
          ? `Weakest pattern: ${weakest[0].toLowerCase()}. Those puzzles are now weighted to come up more often.`
          : "Steady across every pattern so far. Push the difficulty by climbing the rating."}
      </p>

      {confirm ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="quiet" full onClick={() => setConfirm(false)}>Keep it</Btn>
          <Btn kind="warn" full onClick={() => { update(() => ({ ...blank(), day: today() })); setConfirm(false); }}>
            Erase everything
          </Btn>
        </div>
      ) : (
        <Btn kind="quiet" onClick={() => setConfirm(true)}>Reset progress</Btn>
      )}
    </div>
  );
}

/* ============================ app ============================ */
const TABS = [["train", "Tactics"], ["book", "Openings"], ["end", "Endgames"], ["stats", "Progress"]];

export default function ChessLab() {
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState("train");

  useEffect(() => {
    loadState().then((s) => {
      if (s.day !== today()) { s.day = today(); s.todaySolved = 0; }
      setStats(s);
    });
  }, []);

  const update = (fn) => setStats((prev) => { const next = fn(prev); saveState(next); return next; });

  if (!stats) {
    return (
      <div style={{ background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={label()}>Loading your board…</span>
      </div>
    );
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "18px 16px 40px" }}>
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 10, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                Chess Lab
              </div>
              <div style={label({ marginTop: 3 })}>
                {stats.todaySolved} solved today · streak {stats.streak}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: 30, lineHeight: 1, fontWeight: 600, color: C.indigo, fontVariantNumeric: "tabular-nums" }}>
                {stats.rating}
              </div>
              <div style={label()}>rating</div>
            </div>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 14, borderBottom: `1px solid ${C.line}`, marginBottom: 16 }}>
          {TABS.map(([id, name]) => (
            <button
              key={id} onClick={() => setTab(id)}
              style={{
                ...label({ color: tab === id ? C.ink : C.mute }),
                background: "none", border: "none", borderBottom: `2px solid ${tab === id ? C.amber : "transparent"}`,
                padding: "10px 0", cursor: "pointer",
              }}
            >
              {name}
            </button>
          ))}
        </nav>

        {tab === "train" && <Tactics stats={stats} update={update} />}
        {tab === "book" && <Openings stats={stats} update={update} />}
        {tab === "end" && <Endgames stats={stats} update={update} />}
        {tab === "stats" && <Progress stats={stats} update={update} />}
      </div>
    </div>
  );
}
