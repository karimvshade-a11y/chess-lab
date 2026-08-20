/* Visual harness for the board only: no Tauri, no engine, no database.
   Open /visual.html against the dev server to eyeball check and mate states. */
import { createRoot } from "react-dom/client";
import Board from "./ui/Board.jsx";
import Captured from "./ui/Captured.jsx";
import { parseFEN, isMate, inCheck } from "./engine/core.js";
import "./ui/board.css";
import "./ui/app.css";

// Back-rank mate: Re8#. Black is mated, white king is fine.
const MATE = "4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1";
// Plain check, no mate: black king must respond.
const CHECK = "4R1k1/5pp1/7p/8/8/8/5PPP/6K1 b - - 1 1";

function Case({ title, fen }) {
  const pos = parseFEN(fen);
  const mate = isMate(pos);
  const checking = inCheck(pos, pos.turn);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontFamily: "monospace", fontSize: 12, marginBottom: 8 }}>
        {title} — mate: {String(mate)} — check: {String(checking)}
      </div>
      <Captured pos={pos} player="w" />
      <Board pos={pos} orientation="white" check={checking} mated={mate ? pos.turn : null} interactive={false} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <div style={{ display: "flex", flexWrap: "wrap", background: "#EFEDE6" }}>
    <Case title="CHECKMATE (Re8#)" fen={MATE} />
    <Case title="CHECK ONLY" fen={CHECK} />
  </div>
);
