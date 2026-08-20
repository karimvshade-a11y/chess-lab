/* Move generation and rules. Extracted from the original single-file build.
   Verified against standard perft positions - see test/perft.test.js. */
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


export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function toFEN(s) {
  let placement = "";
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { placement += empty; empty = 0; }
      placement += p.c === "w" ? p.t.toUpperCase() : p.t;
    }
    if (empty) placement += empty;
    if (r < 7) placement += "/";
  }
  const c = (s.castling.K ? "K" : "") + (s.castling.Q ? "Q" : "") + (s.castling.k ? "k" : "") + (s.castling.q ? "q" : "");
  return [placement, s.turn, c || "-", s.ep == null ? "-" : sqName(s.ep), s.half, s.full].join(" ");
}

export const isStalemate = (s) => !inCheck(s, s.turn) && legalMoves(s).length === 0;

/* Insufficient material: K vs K, K+minor vs K, K+B vs K+B on same colour. */
export function insufficientMaterial(s) {
  const men = [];
  for (let i = 0; i < 64; i++) if (s.board[i]) men.push({ ...s.board[i], sq: i });
  if (men.some((p) => p.t === "p" || p.t === "q" || p.t === "r")) return false;
  const minors = men.filter((p) => p.t === "b" || p.t === "n");
  if (minors.length <= 1) return true;
  if (minors.length === 2 && minors.every((p) => p.t === "b")) {
    const sqColor = (i) => (Math.floor(i / 8) + (i % 8)) % 2;
    if (sqColor(minors[0].sq) === sqColor(minors[1].sq)) return true;
  }
  return false;
}

export function moveFromUci(s, uci) {
  return legalMoves(s).find((m) => uciOf(m) === uci) || null;
}

export {
  FILES, sqName, nameSq, parseFEN, isAttacked, kingSq, inCheck,
  pseudoMoves, makeMove, legalMoves, isMate, uciOf, toSAN,
};
