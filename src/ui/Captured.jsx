/**
 * Captured material, derived from the position rather than from move history,
 * so it stays right no matter how you arrived (loaded FEN, jumped back, etc).
 *
 * Promotions make naive counting lie: promote a pawn and you hold nine "extra"
 * queens' worth of material while a pawn has vanished. Missing counts are
 * clamped at zero and the running score is computed from what is actually on
 * the board, which stays correct either way.
 */
import { C, MONO, label } from "./theme.js";

const START = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = ["q", "r", "b", "n", "p"];
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

/** Counts still standing, per colour. */
function census(board) {
  const out = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
  for (const sq of board) if (sq) out[sq.c][sq.t]++;
  return out;
}

export function material(board) {
  const have = census(board);
  const score = (c) => ORDER.reduce((n, t) => n + have[c][t] * VALUE[t], 0);
  const lost = (c) => {
    const o = {};
    for (const t of ORDER) o[t] = Math.max(0, START[t] - have[c][t]);
    return o;
  };
  return { white: score("w"), black: score("b"), lostWhite: lost("w"), lostBlack: lost("b") };
}

/**
 * One player's haul: the pieces they have taken, and by how much they lead.
 *
 * Takes the player this strip belongs to — never the colour of the pieces
 * drawn. Both halves are derived from that one value, because passing them
 * separately invites showing a player's own losses beside their opponent's
 * lead, which reads as a contradiction.
 */
export default function Captured({ pos, player, align = "left" }) {
  const m = material(pos.board);
  const taken = player === "w" ? m.lostBlack : m.lostWhite;
  const edge = player === "w" ? m.white - m.black : m.black - m.white;
  const advantage = Math.max(0, edge);
  const any = ORDER.some((t) => taken[t] > 0);
  const shown = player === "w" ? "b" : "w";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 22,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
        {ORDER.map((t) =>
          taken[t] > 0 ? (
            <span key={t} style={{ display: "inline-flex", alignItems: "center" }}>
              {Array.from({ length: taken[t] }).map((_, i) => (
                <span
                  key={i}
                  title={t}
                  style={{
                    fontSize: 19,
                    lineHeight: 1,
                    // Overlap repeats of the same piece so a full set still fits.
                    marginLeft: i === 0 ? 0 : -7,
                    color: shown === "w" ? "#FCFBF7" : C.ink,
                    textShadow:
                      shown === "w"
                        ? "0 1px 0 #14161C, 0 -1px 0 #14161C, 1px 0 0 #14161C, -1px 0 0 #14161C"
                        : "0 1px 1px rgba(255,255,255,.35)",
                  }}
                >
                  {GLYPH[t]}
                </span>
              ))}
              <span style={{ width: 5 }} />
            </span>
          ) : null
        )}
        {!any && <span style={label({ opacity: 0.5 })}>no captures</span>}
      </div>

      {advantage > 0 && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 600,
            color: C.green,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{advantage}
        </span>
      )}
    </div>
  );
}
