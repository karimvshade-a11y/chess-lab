/**
 * Chess sounds, synthesised at runtime with the Web Audio API.
 *
 * Nothing is bundled: no audio files, no licences, no download. A wooden piece
 * click is a short filtered noise burst (the contact) layered over a fast
 * decaying sine (the body of the piece and the board under it), which is close
 * enough to the real thing and costs a few hundred bytes of code.
 */

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // One second of white noise, reused for every percussive transient.
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, n);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Browsers start the context suspended until the page sees a gesture. */
export function unlock() {
  const c = audio();
  if (c && c.state === "suspended") c.resume();
}

export function setMuted(v) {
  muted = !!v;
}
export function isMuted() {
  return muted;
}

function noise(at, { dur = 0.03, freq = 1200, q = 1.2, gain = 0.5, type = "bandpass" } = {}) {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;

  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;

  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(filter).connect(env).connect(master);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function tone(at, { freq = 220, dur = 0.09, gain = 0.25, type = "sine", to = null } = {}) {
  const c = audio();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);

  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

const VOICES = {
  /** Piece set down on the board. */
  move(t) {
    noise(t, { dur: 0.028, freq: 1500, q: 1.0, gain: 0.35 });
    tone(t, { freq: 190, dur: 0.06, gain: 0.16, type: "sine" });
  },

  /** Wood on wood, harder, with the knock of the piece being displaced. */
  capture(t) {
    noise(t, { dur: 0.05, freq: 900, q: 0.8, gain: 0.55 });
    tone(t, { freq: 140, dur: 0.11, gain: 0.26, type: "triangle" });
    noise(t + 0.035, { dur: 0.035, freq: 2200, q: 1.4, gain: 0.22 });
  },

  /** Two quick taps: king, then rook. */
  castle(t) {
    noise(t, { dur: 0.026, freq: 1400, q: 1.0, gain: 0.32 });
    tone(t, { freq: 200, dur: 0.05, gain: 0.14 });
    noise(t + 0.1, { dur: 0.026, freq: 1600, q: 1.0, gain: 0.3 });
    tone(t + 0.1, { freq: 240, dur: 0.05, gain: 0.13 });
  },

  /** An alert, not a fanfare - it fires often. */
  check(t) {
    noise(t, { dur: 0.03, freq: 1800, q: 1.2, gain: 0.28 });
    tone(t + 0.01, { freq: 880, dur: 0.1, gain: 0.16, type: "square" });
    tone(t + 0.09, { freq: 1174, dur: 0.13, gain: 0.14, type: "square" });
  },

  /** Rising, because a pawn just became something else. */
  promote(t) {
    tone(t, { freq: 523, dur: 0.1, gain: 0.16, type: "triangle" });
    tone(t + 0.07, { freq: 784, dur: 0.1, gain: 0.15, type: "triangle" });
    tone(t + 0.14, { freq: 1046, dur: 0.22, gain: 0.16, type: "triangle" });
  },

  /** Falling minor triad, with weight under it. The game is over. */
  mate(t) {
    noise(t, { dur: 0.08, freq: 700, q: 0.7, gain: 0.5 });
    tone(t, { freq: 440, dur: 0.5, gain: 0.2, type: "triangle" });
    tone(t + 0.13, { freq: 349, dur: 0.5, gain: 0.19, type: "triangle" });
    tone(t + 0.26, { freq: 261, dur: 0.75, gain: 0.22, type: "triangle" });
    tone(t + 0.26, { freq: 130, dur: 0.85, gain: 0.16, type: "sine" });
  },

  /** Drawn or stalemated: unresolved, deliberately. */
  draw(t) {
    tone(t, { freq: 392, dur: 0.3, gain: 0.15, type: "sine" });
    tone(t + 0.12, { freq: 415, dur: 0.42, gain: 0.14, type: "sine" });
  },

  /** Puzzle solved. */
  correct(t) {
    tone(t, { freq: 659, dur: 0.09, gain: 0.15, type: "triangle" });
    tone(t + 0.08, { freq: 880, dur: 0.18, gain: 0.16, type: "triangle" });
  },

  /** Wrong move: a dull thud, no melody, nothing to enjoy. */
  wrong(t) {
    noise(t, { dur: 0.09, freq: 220, q: 0.6, gain: 0.4, type: "lowpass" });
    tone(t, { freq: 110, dur: 0.16, gain: 0.2, type: "sine", to: 82 });
  },

  /** The engine has chosen. */
  lowTick(t) {
    noise(t, { dur: 0.02, freq: 2400, q: 2, gain: 0.14 });
  },
};

export function play(name) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  const voice = VOICES[name];
  if (!voice) return;
  try {
    voice(c.currentTime + 0.005);
  } catch {
    /* audio is a nicety; never let it break a move */
  }
}

/**
 * Pick the right voice for a move that has already been made.
 * `before` is the position the move was played from, `after` the result.
 */
export function playMove(before, after, move, { isMate, inCheck }) {
  if (isMate) {
    play("mate");
    return;
  }
  if (inCheck) {
    play("check");
    return;
  }
  if (move.promo) {
    play("promote");
    return;
  }
  if (move.castle) {
    play("castle");
    return;
  }
  const captured = !!before.board[move.to] || move.ep;
  play(captured ? "capture" : "move");
}
