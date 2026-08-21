/**
 * Front-end side of the local Stockfish bridge.
 *
 * The engine runs as a native sidecar process, not WASM, so it gets the full
 * NNUE net and every core we give it. Analysis streams in as events; each
 * request carries a job id so late results from a superseded search are dropped
 * rather than painted over the current position.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

let currentJob = 0;
const progressSubs = new Set();
const doneSubs = new Set();
let wired = false;

/**
 * Results indexed by job id.
 *
 * Live views only care about the newest search, but `evaluate` awaits one
 * specific job, and a search can finish before `invoke` has even returned its
 * id. Recording every job here means a result that lands early is waiting in
 * the buffer rather than lost — which would strand a batch run forever.
 */
const jobs = new Map();
const MAX_TRACKED = 64;

function slot(id) {
  let j = jobs.get(id);
  if (!j) {
    j = { lines: [], done: null, resolve: null };
    jobs.set(id, j);
    // Cheap bound: ids only ever increase, so the oldest keys go first.
    if (jobs.size > MAX_TRACKED) {
      for (const k of [...jobs.keys()].sort((a, b) => a - b).slice(0, jobs.size - MAX_TRACKED)) {
        jobs.delete(k);
      }
    }
  }
  return j;
}

async function wire() {
  if (wired) return;
  wired = true;
  await listen("engine:progress", (e) => {
    slot(e.payload.job).lines = e.payload.lines;
    if (e.payload.job !== currentJob) return;
    for (const fn of progressSubs) fn(e.payload.lines);
  });
  await listen("engine:done", (e) => {
    const j = slot(e.payload.job);
    j.done = e.payload;
    if (j.resolve) { j.resolve(); j.resolve = null; }
    if (e.payload.job !== currentJob) return;
    for (const fn of doneSubs) fn(e.payload);
  });
}

export async function boot() {
  await wire();
  return invoke("boot");
}

export function onProgress(fn) {
  progressSubs.add(fn);
  return () => progressSubs.delete(fn);
}

export function onDone(fn) {
  doneSubs.add(fn);
  return () => doneSubs.delete(fn);
}

/** Start an analysis. `moves` are UCI moves applied after `fen`. */
export async function analyse(fen, { moves = [], multipv = 3, depth = null, movetime = null } = {}) {
  currentJob = await invoke("analyse", { fen, moves, multipv, depth, movetime });
  return currentJob;
}

/** Ask the engine for a move at a capped strength. */
export async function play(fen, { moves = [], elo = 1500, movetime = 500 } = {}) {
  currentJob = await invoke("play", { fen, moves, elo, movetime });
  return currentJob;
}

export async function stop() {
  currentJob = -1;
  return invoke("stop_engine");
}

/**
 * One-shot: resolve with the finished search for a position.
 * Safe to await in a loop — each call waits on its own job id.
 */
export async function evaluate(fen, opts = {}) {
  const id = await analyse(fen, opts);
  const j = slot(id);
  if (!j.done) {
    await new Promise((resolve) => { j.resolve = resolve; });
  }
  const result = { ...j.done, lines: j.lines };
  jobs.delete(id);
  return result;
}

/* ---- puzzle database ---- */

export const pickPuzzles = (rating, spread, theme, limit, excludeSeen = true) =>
  invoke("pick_puzzles", { rating, spread, theme: theme || null, limit, excludeSeen });

export const puzzleById = (id) => invoke("puzzle_by_id", { id });
export const puzzleThemes = () => invoke("puzzle_themes");
export const dueReviews = (limit = 30) => invoke("due_reviews", { limit });

export const recordAttempt = (puzzleId, solved, ms, hinted, rating) =>
  invoke("record_attempt", { puzzleId, solved, ms, hinted, rating });

export const profileStats = () => invoke("profile_stats");
export const themeAccuracy = () => invoke("theme_accuracy");

/* ---- games you have played ---- */

export const saveGame = (pgn, white, black, result, mySide, moves) =>
  invoke("save_game", { pgn, white, black, result, mySide, moves });
export const listGames = (limit = 40) => invoke("list_games", { limit });
export const markReviewed = (id) => invoke("mark_reviewed", { id });
export const deleteGame = (id) => invoke("delete_game", { id });

/* ---- blunder book ---- */

export const saveBlunders = (items) => invoke("save_blunders", { items });
export const dueBlunders = (limit = 20) => invoke("due_blunders", { limit });
export const allBlunders = (limit = 200) => invoke("all_blunders", { limit });
export const gradeBlunder = (id, solved) => invoke("grade_blunder", { id, solved });
export const forgetBlunder = (id) => invoke("forget_blunder", { id });
export const kvGet = (key) => invoke("kv_get", { key });
export const kvSet = (key, value) => invoke("kv_set", { key, value });

/* ---- helpers ---- */

/** Human-readable eval from the side-to-move's perspective, normalised to White. */
export function formatScore(line, whiteToMove) {
  if (!line) return "--";
  const flip = whiteToMove ? 1 : -1;
  if (line.mate != null) {
    const m = line.mate * flip;
    return (m > 0 ? "M" : "-M") + Math.abs(m);
  }
  const cp = (line.cp ?? 0) * flip;
  return (cp > 0 ? "+" : "") + (cp / 100).toFixed(2);
}

/** 0..1 white-advantage bar position. */
export function scoreToBar(line, whiteToMove) {
  if (!line) return 0.5;
  const flip = whiteToMove ? 1 : -1;
  if (line.mate != null) return line.mate * flip > 0 ? 1 : 0;
  const cp = (line.cp ?? 0) * flip;
  return 1 / (1 + Math.exp(-cp / 350));
}
