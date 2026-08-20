import { useEffect, useState } from "react";
import { C, MONO, label, card } from "../ui/theme.js";
import { profileStats } from "../stockfish/client.js";

export default function Progress({ rating }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    profileStats().then(setS).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div style={card()}><div style={label({ color: C.red })}>{err}</div></div>;
  if (!s) return <div style={card({ ...label() })}>Loading…</div>;

  const acc = s.attempts ? Math.round((s.solved / s.attempts) * 100) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      <Stat k="rating" v={rating} accent />
      <Stat k="puzzles attempted" v={s.attempts.toLocaleString()} />
      <Stat k="solved" v={s.solved.toLocaleString()} />
      <Stat k="accuracy" v={acc + "%"} />
      <Stat k="distinct puzzles" v={s.distinct.toLocaleString()} />
      <Stat k="due for review" v={s.due_now.toLocaleString()} accent={s.due_now > 0} />
      <Stat k="blunder book" v={(s.blunders || 0).toLocaleString()} />
      <Stat k="blunders due" v={(s.blunders_due || 0).toLocaleString()} accent={(s.blunders_due || 0) > 0} />
    </div>
  );
}

function Stat({ k, v, accent }) {
  return (
    <div style={card()}>
      <div style={label()}>{k}</div>
      <div
        style={{
          fontFamily: MONO, fontSize: 30, fontWeight: 600, marginTop: 4,
          color: accent ? C.indigo : C.ink, fontVariantNumeric: "tabular-nums",
        }}
      >
        {v}
      </div>
    </div>
  );
}
