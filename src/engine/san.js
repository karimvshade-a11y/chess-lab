/* SAN -> move. The original build had toSAN but no parser, which is why the
   opening lines had to carry parallel uci[] and san[] arrays. */
import { legalMoves, toSAN, FILES } from "./core.js";

const strip = (t) => t.replace(/[+#!?]+$/, "").replace(/[!?]/g, "");

export function parseSAN(pos, text) {
  const t = strip(String(text).trim());
  if (!t) return null;
  const moves = legalMoves(pos);

  if (/^(O-O-O|0-0-0)$/.test(t)) return moves.find((m) => m.castle === "q") || null;
  if (/^(O-O|0-0)$/.test(t)) return moves.find((m) => m.castle === "k") || null;

  const m = t.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBNqrbn]))?$/);
  if (!m) return null;
  const [, piece, ff, fr, , dest, promo] = m;

  const type = piece ? piece.toLowerCase() : "p";
  const toSq = (8 - parseInt(dest[1], 10)) * 8 + FILES.indexOf(dest[0]);

  const cands = moves.filter((mv) => {
    const p = pos.board[mv.from];
    if (!p || p.t !== type) return false;
    if (mv.to !== toSq) return false;
    if (promo && mv.promo !== promo.toLowerCase()) return false;
    if (!promo && mv.promo) return false;
    if (ff && mv.from % 8 !== FILES.indexOf(ff)) return false;
    if (fr && 8 - Math.floor(mv.from / 8) !== parseInt(fr, 10)) return false;
    return true;
  });

  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    // Ambiguous input: accept only if one candidate renders back to this SAN.
    const exact = cands.filter((mv) => strip(toSAN(pos, mv)) === t);
    if (exact.length === 1) return exact[0];
  }
  return null;
}
