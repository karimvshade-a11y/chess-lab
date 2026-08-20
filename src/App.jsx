import { useEffect, useState } from "react";
import { C, MONO, label, card } from "./ui/theme.js";
import Tactics from "./train/Tactics.jsx";
import Analyse from "./train/Analyse.jsx";
import Spar from "./train/Spar.jsx";
import Openings from "./train/Openings.jsx";
import Progress from "./train/Progress.jsx";
import Review from "./train/Review.jsx";
import Blunders from "./train/Blunders.jsx";
import { boot, kvGet, kvSet, profileStats } from "./stockfish/client.js";
import { setMuted, unlock, play as sfx } from "./ui/sound.js";

const TABS = [
  ["tactics", "Tactics"],
  ["blunders", "My Blunders"],
  ["openings", "Openings"],
  ["spar", "Play"],
  ["review", "Review"],
  ["analyse", "Analyse"],
  ["progress", "Progress"],
];

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [tab, setTab] = useState("tactics");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [rating, setRatingState] = useState(1200);
  const [today, setToday] = useState(0);
  const [sound, setSound] = useState(true);
  const [theme, setThemeState] = useState(null);
  const [bookDue, setBookDue] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const b = await boot();
        setInfo(b);
        const r = await kvGet("rating");
        if (r) setRatingState(Number(r));
        const d = await kvGet("day");
        const n = await kvGet("todayCount");
        if (d === todayKey() && n) setToday(Number(n));
        const t = await kvGet("theme");
        if (t) setThemeState(t === "all" ? null : t);
        setBookDue(b.puzzles ? (await profileStats().catch(() => ({}))).blunders_due || 0 : 0);
        const s = await kvGet("sound");
        const on = s !== "off";
        setSound(on);
        setMuted(!on);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const setRating = (v) => {
    setRatingState(v);
    kvSet("rating", String(v)).catch(() => {});
  };

  const setTheme = (t) => {
    setThemeState(t);
    kvSet("theme", t || "all").catch(() => {});
  };

  const refreshBook = () => {
    profileStats().then((s) => setBookDue(s.blunders_due || 0)).catch(() => {});
  };

  const toggleSound = () => {
    setSound((on) => {
      const next = !on;
      setMuted(!next);
      kvSet("sound", next ? "on" : "off").catch(() => {});
      // Confirm audibly when switching it back on.
      if (next) { unlock(); sfx("move"); }
      return next;
    });
  };

  const onSolved = () => {
    setToday((n) => {
      const next = n + 1;
      kvSet("day", todayKey()).catch(() => {});
      kvSet("todayCount", String(next)).catch(() => {});
      return next;
    });
  };

  return (
    <div
      onPointerDownCapture={unlock}
      onKeyDownCapture={unlock}
      style={{ background: C.paper, minHeight: "100vh", color: C.ink }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "18px 20px 40px" }}>
        <header style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                Chess Lab
              </div>
              <div style={label({ marginTop: 3 })}>
                {info
                  ? `${info.puzzles.toLocaleString()} puzzles · stockfish 18 · ${info.threads} threads · ${info.hash_mb}mb hash`
                  : "starting engine…"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <button
                onClick={toggleSound}
                title={sound ? "Mute sound" : "Unmute sound"}
                style={{
                  ...label({ color: sound ? C.ink : C.mute }),
                  background: "transparent",
                  border: `1px solid ${C.line}`,
                  borderRadius: 2,
                  padding: "7px 10px",
                  cursor: "pointer",
                  marginBottom: 4,
                }}
              >
                {sound ? "♪ sound" : "muted"}
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontSize: 30, lineHeight: 1, fontWeight: 600, color: C.indigo, fontVariantNumeric: "tabular-nums" }}>
                  {rating}
                </div>
                <div style={label()}>{today} solved today</div>
              </div>
            </div>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 16, borderBottom: `1px solid ${C.line}`, marginBottom: 18 }}>
          {TABS.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                ...label({ color: tab === id ? C.ink : C.mute }),
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === id ? C.amber : "transparent"}`,
                padding: "10px 0", cursor: "pointer",
              }}
            >
              {name}
              {id === "blunders" && bookDue > 0 && (
                <span
                  style={{
                    marginLeft: 6, background: C.red, color: "#F7F5EF",
                    borderRadius: 8, padding: "1px 5px", fontSize: 9,
                  }}
                >
                  {bookDue}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <div style={card({ borderColor: C.red, marginBottom: 16 })}>
            <div style={label({ color: C.red })}>startup problem</div>
            <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 6 }}>{error}</div>
          </div>
        )}

        {tab === "tactics" && (
          <Tactics rating={rating} setRating={setRating} onSolved={onSolved} theme={theme} setTheme={setTheme} />
        )}
        {tab === "blunders" && <Blunders onGraded={refreshBook} />}
        {tab === "openings" && <Openings />}
        {tab === "spar" && <Spar />}
        {tab === "review" && <Review onFiled={refreshBook} />}
        {tab === "analyse" && <Analyse />}
        {tab === "progress" && <Progress rating={rating} />}
      </div>
    </div>
  );
}
