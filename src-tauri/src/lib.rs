mod db;
mod engine;

use db::{Blunder, Db, Puzzle, SharedDb};
use engine::{Engine, Shared};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct Boot {
    pub puzzles: usize,
    pub threads: u32,
    pub hash_mb: u32,
}

/// Leave a couple of cores for the UI, and cap hash at a sane share of RAM.
fn tuned() -> (u32, u32) {
    let cores = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(2);
    let threads = if cores > 4 { cores - 2 } else { 1.max(cores.saturating_sub(1)) };
    (threads.max(1), 1024)
}

#[tauri::command]
async fn boot(app: AppHandle, eng: State<'_, Shared>, database: State<'_, SharedDb>) -> Result<Boot, String> {
    let (threads, hash_mb) = tuned();
    eng.lock().map_err(|e| e.to_string())?.start(&app, threads, hash_mb)?;
    let puzzles = database.lock().map_err(|e| e.to_string())?.open(&app).unwrap_or(0);
    Ok(Boot { puzzles, threads, hash_mb })
}

#[tauri::command]
async fn analyse(
    eng: State<'_, Shared>,
    fen: String,
    moves: Vec<String>,
    multipv: u32,
    depth: Option<u32>,
    movetime: Option<u64>,
) -> Result<u64, String> {
    eng.lock().map_err(|e| e.to_string())?.analyse(&fen, &moves, multipv, depth, movetime)
}

#[tauri::command]
async fn play(
    eng: State<'_, Shared>,
    fen: String,
    moves: Vec<String>,
    elo: u32,
    movetime: u64,
) -> Result<u64, String> {
    eng.lock().map_err(|e| e.to_string())?.play(&fen, &moves, elo, movetime)
}

#[tauri::command]
async fn stop_engine(eng: State<'_, Shared>) -> Result<(), String> {
    let mut e = eng.lock().map_err(|err| err.to_string())?;
    let _ = e.unlimit();
    e.stop()
}

#[tauri::command]
async fn pick_puzzles(
    database: State<'_, SharedDb>,
    rating: i32,
    spread: i32,
    theme: Option<String>,
    limit: usize,
    exclude_seen: bool,
) -> Result<Vec<Puzzle>, String> {
    database
        .lock()
        .map_err(|e| e.to_string())?
        .pick(rating, spread, theme.as_deref(), limit, exclude_seen)
}

#[tauri::command]
async fn puzzle_by_id(database: State<'_, SharedDb>, id: String) -> Result<Option<Puzzle>, String> {
    database.lock().map_err(|e| e.to_string())?.by_id(&id)
}

#[tauri::command]
async fn puzzle_themes(database: State<'_, SharedDb>) -> Result<Vec<(String, i64)>, String> {
    database.lock().map_err(|e| e.to_string())?.themes()
}

#[tauri::command]
async fn record_attempt(
    database: State<'_, SharedDb>,
    puzzle_id: String,
    solved: bool,
    ms: i64,
    hinted: bool,
    rating: i32,
) -> Result<(), String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let p = d.profile.as_ref().ok_or("profile db not open")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_millis() as i64)
        .unwrap_or(0);
    p.execute(
        "INSERT INTO attempt (puzzle_id, at, solved, ms, hinted, rating) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![puzzle_id, now, solved as i32, ms, hinted as i32, rating],
    )
    .map_err(|e| e.to_string())?;

    // Leitner boxes: 1 day, 3, 7, 21, 60.
    const BOX_MS: [i64; 6] = [0, 86_400_000, 259_200_000, 604_800_000, 1_814_400_000, 5_184_000_000];
    let cur: i64 = p
        .query_row("SELECT box FROM review WHERE puzzle_id = ?1", [&puzzle_id], |r| r.get(0))
        .unwrap_or(0);
    let next = if solved { (cur + 1).min(5) } else { 1 };
    p.execute(
        "INSERT INTO review (puzzle_id, box, due, lapses) VALUES (?1,?2,?3,?4)
         ON CONFLICT(puzzle_id) DO UPDATE SET box=?2, due=?3, lapses=review.lapses+?4",
        rusqlite::params![puzzle_id, next, now + BOX_MS[next as usize], (!solved) as i32],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn due_reviews(database: State<'_, SharedDb>, limit: usize) -> Result<Vec<Puzzle>, String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let p = d.profile.as_ref().ok_or("profile db not open")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_millis() as i64)
        .unwrap_or(0);
    let mut st = p
        .prepare("SELECT puzzle_id FROM review WHERE due <= ?1 ORDER BY due ASC LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = st
        .query_map(rusqlite::params![now, limit as i64], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    let mut out = Vec::new();
    for id in ids {
        if let Ok(Some(p)) = d.by_id(&id) {
            out.push(p);
        }
    }
    Ok(out)
}

#[tauri::command]
async fn kv_get(database: State<'_, SharedDb>, key: String) -> Result<Option<String>, String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let p = d.profile.as_ref().ok_or("profile db not open")?;
    Ok(p.query_row("SELECT v FROM kv WHERE k = ?1", [&key], |r| r.get::<_, String>(0)).ok())
}

#[tauri::command]
async fn kv_set(database: State<'_, SharedDb>, key: String, value: String) -> Result<(), String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let p = d.profile.as_ref().ok_or("profile db not open")?;
    p.execute(
        "INSERT INTO kv (k,v) VALUES (?1,?2) ON CONFLICT(k) DO UPDATE SET v=?2",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/* ---- blunder book ---- */

#[derive(serde::Deserialize)]
pub struct NewBlunder {
    pub fen: String,
    pub best: String,
    pub played: String,
    pub loss: f64,
    pub kind: String,
    pub source: String,
    pub mover: String,
}

#[tauri::command]
async fn save_blunders(database: State<'_, SharedDb>, items: Vec<NewBlunder>) -> Result<usize, String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let mut n = 0;
    for it in items {
        // Position plus the move actually played identifies the mistake, so the
        // same slip in two games collapses onto one card.
        let id = format!("{}|{}", it.fen, it.played);
        let b = Blunder {
            id,
            fen: it.fen,
            best: it.best,
            played: it.played,
            loss: it.loss,
            kind: it.kind,
            source: it.source,
            mover: it.mover,
            box_: 0,
            due: 0,
            tries: 0,
        };
        d.add_blunder(&b)?;
        n += 1;
    }
    Ok(n)
}

#[tauri::command]
async fn due_blunders(database: State<'_, SharedDb>, limit: usize) -> Result<Vec<Blunder>, String> {
    database.lock().map_err(|e| e.to_string())?.due_blunders(limit)
}

#[tauri::command]
async fn all_blunders(database: State<'_, SharedDb>, limit: usize) -> Result<Vec<Blunder>, String> {
    database.lock().map_err(|e| e.to_string())?.all_blunders(limit)
}

#[tauri::command]
async fn grade_blunder(database: State<'_, SharedDb>, id: String, solved: bool) -> Result<(), String> {
    database.lock().map_err(|e| e.to_string())?.grade_blunder(&id, solved)
}

#[tauri::command]
async fn forget_blunder(database: State<'_, SharedDb>, id: String) -> Result<(), String> {
    database.lock().map_err(|e| e.to_string())?.forget_blunder(&id)
}

#[tauri::command]
async fn theme_accuracy(database: State<'_, SharedDb>) -> Result<Vec<(String, i64, i64)>, String> {
    database.lock().map_err(|e| e.to_string())?.theme_accuracy()
}

#[derive(Serialize)]
pub struct Stats {
    pub attempts: i64,
    pub solved: i64,
    pub due_now: i64,
    pub distinct: i64,
    pub blunders: i64,
    pub blunders_due: i64,
}

#[tauri::command]
async fn profile_stats(database: State<'_, SharedDb>) -> Result<Stats, String> {
    let d = database.lock().map_err(|e| e.to_string())?;
    let p = d.profile.as_ref().ok_or("profile db not open")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_millis() as i64)
        .unwrap_or(0);
    let g = |sql: &str, arg: Option<i64>| -> i64 {
        match arg {
            Some(a) => p.query_row(sql, [a], |r| r.get(0)).unwrap_or(0),
            None => p.query_row(sql, [], |r| r.get(0)).unwrap_or(0),
        }
    };
    Ok(Stats {
        attempts: g("SELECT COUNT(*) FROM attempt", None),
        solved: g("SELECT COUNT(*) FROM attempt WHERE solved = 1", None),
        due_now: g("SELECT COUNT(*) FROM review WHERE due <= ?1", Some(now)),
        distinct: g("SELECT COUNT(DISTINCT puzzle_id) FROM attempt", None),
        blunders: g("SELECT COUNT(*) FROM blunder", None),
        blunders_due: g("SELECT COUNT(*) FROM blunder WHERE due <= ?1", Some(now)),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Shared::new(Engine::new()))
        .manage(SharedDb::new(Db::new()))
        .invoke_handler(tauri::generate_handler![
            boot,
            analyse,
            play,
            stop_engine,
            pick_puzzles,
            puzzle_by_id,
            puzzle_themes,
            record_attempt,
            due_reviews,
            kv_get,
            kv_set,
            profile_stats,
            save_blunders,
            due_blunders,
            all_blunders,
            grade_blunder,
            forget_blunder,
            theme_accuracy
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Shared>() {
                    if let Ok(mut e) = state.lock() {
                        e.shutdown();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Chess Lab");
}
