//! Read-only access to the bundled puzzle database, plus a small
//! writable profile database for progress that must survive reinstalls.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Clone, Debug)]
pub struct Puzzle {
    pub id: String,
    pub fen: String,
    /// UCI moves. The first is the opponent move that creates the position.
    pub moves: Vec<String>,
    pub rating: i32,
    pub popularity: i32,
    pub themes: Vec<String>,
}

pub struct Db {
    pub puzzles: Option<Connection>,
    pub profile: Option<Connection>,
}

impl Db {
    pub fn new() -> Self {
        Db { puzzles: None, profile: None }
    }

    pub fn open(&mut self, app: &AppHandle) -> Result<usize, String> {
        if self.puzzles.is_none() {
            let path = resolve_puzzles(app)?;
            let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|e| format!("open {:?}: {}", path, e))?;
            self.puzzles = Some(conn);
        }
        if self.profile.is_none() {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let conn = Connection::open(dir.join("profile.db")).map_err(|e| e.to_string())?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS attempt (
                   puzzle_id TEXT NOT NULL,
                   at        INTEGER NOT NULL,
                   solved    INTEGER NOT NULL,
                   ms        INTEGER NOT NULL DEFAULT 0,
                   hinted    INTEGER NOT NULL DEFAULT 0,
                   rating    INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS attempt_puzzle ON attempt(puzzle_id);
                 CREATE INDEX IF NOT EXISTS attempt_at ON attempt(at);

                 CREATE TABLE IF NOT EXISTS review (
                   puzzle_id TEXT PRIMARY KEY,
                   box       INTEGER NOT NULL,
                   due       INTEGER NOT NULL,
                   lapses    INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS review_due ON review(due);

                 /* Positions where the player went wrong, from a reviewed game
                    or a sparring loss. Keyed by position+move so replaying the
                    same mistake updates one row instead of piling up. */
                 CREATE TABLE IF NOT EXISTS blunder (
                   id      TEXT PRIMARY KEY,
                   fen     TEXT NOT NULL,
                   best    TEXT NOT NULL,
                   played  TEXT NOT NULL,
                   loss    REAL NOT NULL,
                   kind    TEXT NOT NULL,
                   source  TEXT NOT NULL DEFAULT '',
                   mover   TEXT NOT NULL DEFAULT 'w',
                   at      INTEGER NOT NULL,
                   box     INTEGER NOT NULL DEFAULT 0,
                   due     INTEGER NOT NULL DEFAULT 0,
                   solved  INTEGER NOT NULL DEFAULT 0,
                   tries   INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS blunder_due ON blunder(due);

                 /* Games played in the app, kept so Review can pick them up
                    without the player having to copy a PGN anywhere. */
                 CREATE TABLE IF NOT EXISTS game (
                   id       INTEGER PRIMARY KEY AUTOINCREMENT,
                   pgn      TEXT NOT NULL,
                   white    TEXT NOT NULL DEFAULT '',
                   black    TEXT NOT NULL DEFAULT '',
                   result   TEXT NOT NULL DEFAULT '*',
                   my_side  TEXT NOT NULL DEFAULT 'w',
                   moves    INTEGER NOT NULL DEFAULT 0,
                   at       INTEGER NOT NULL,
                   reviewed INTEGER NOT NULL DEFAULT 0
                 );
                 CREATE INDEX IF NOT EXISTS game_at ON game(at);

                 CREATE TABLE IF NOT EXISTS kv (
                   k TEXT PRIMARY KEY,
                   v TEXT NOT NULL
                 );",
            )
            .map_err(|e| e.to_string())?;
            self.profile = Some(conn);
        }
        self.count()
    }

    pub fn count(&self) -> Result<usize, String> {
        let c = self.puzzles.as_ref().ok_or("puzzle db not open")?;
        c.query_row("SELECT COUNT(*) FROM puzzle", [], |r| r.get::<_, i64>(0))
            .map(|n| n as usize)
            .map_err(|e| e.to_string())
    }

    /// Pick puzzles near a rating, optionally constrained to one theme, excluding
    /// anything already attempted unless the caller asks to include it.
    pub fn pick(
        &self,
        rating: i32,
        spread: i32,
        theme: Option<&str>,
        limit: usize,
        exclude_seen: bool,
    ) -> Result<Vec<Puzzle>, String> {
        let c = self.puzzles.as_ref().ok_or("puzzle db not open")?;
        let lo = rating - spread;
        let hi = rating + spread;

        let seen: Vec<String> = if exclude_seen {
            match self.profile.as_ref() {
                Some(p) => {
                    let mut st = p.prepare("SELECT puzzle_id FROM attempt").map_err(|e| e.to_string())?;
                    let rows = st
                        .query_map([], |r| r.get::<_, String>(0))
                        .map_err(|e| e.to_string())?;
                    rows.filter_map(Result::ok).collect()
                }
                None => Vec::new(),
            }
        } else {
            Vec::new()
        };

        let mut sql = String::from(
            "SELECT id, fen, moves, rating, popularity, themes FROM puzzle
             WHERE rating BETWEEN ?1 AND ?2",
        );
        if theme.is_some() {
            sql.push_str(" AND themes LIKE ?3");
        }
        sql.push_str(" ORDER BY RANDOM() LIMIT ");
        // Over-fetch so the seen filter still leaves enough.
        sql.push_str(&((limit + seen.len().min(400)) * 3).max(limit).to_string());

        let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
        let like = theme.map(|t| format!("%{}%", t));
        let map = |r: &rusqlite::Row| -> rusqlite::Result<Puzzle> {
            let moves: String = r.get(2)?;
            let themes: String = r.get(5)?;
            Ok(Puzzle {
                id: r.get(0)?,
                fen: r.get(1)?,
                moves: moves.split(' ').map(String::from).collect(),
                rating: r.get(3)?,
                popularity: r.get(4)?,
                themes: themes.split(' ').filter(|s| !s.is_empty()).map(String::from).collect(),
            })
        };

        let rows: Vec<Puzzle> = if let Some(l) = like {
            st.query_map(rusqlite::params![lo, hi, l], map)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect()
        } else {
            st.query_map(rusqlite::params![lo, hi], map)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect()
        };

        Ok(rows
            .into_iter()
            .filter(|p| !seen.contains(&p.id))
            .take(limit)
            .collect())
    }

    pub fn by_id(&self, id: &str) -> Result<Option<Puzzle>, String> {
        let c = self.puzzles.as_ref().ok_or("puzzle db not open")?;
        let mut st = c
            .prepare("SELECT id, fen, moves, rating, popularity, themes FROM puzzle WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = st
            .query_map([id], |r| {
                let moves: String = r.get(2)?;
                let themes: String = r.get(5)?;
                Ok(Puzzle {
                    id: r.get(0)?,
                    fen: r.get(1)?,
                    moves: moves.split(' ').map(String::from).collect(),
                    rating: r.get(3)?,
                    popularity: r.get(4)?,
                    themes: themes.split(' ').filter(|s| !s.is_empty()).map(String::from).collect(),
                })
            })
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(Ok(p)) => Ok(Some(p)),
            _ => Ok(None),
        }
    }

    pub fn themes(&self) -> Result<Vec<(String, i64)>, String> {
        let c = self.puzzles.as_ref().ok_or("puzzle db not open")?;
        let mut st = c
            .prepare("SELECT theme, n FROM theme_count ORDER BY n DESC")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Blunder {
    pub id: String,
    pub fen: String,
    pub best: String,
    pub played: String,
    pub loss: f64,
    pub kind: String,
    pub source: String,
    pub mover: String,
    #[serde(rename = "box")]
    pub box_: i64,
    pub due: i64,
    pub tries: i64,
}

fn row_to_blunder(r: &rusqlite::Row) -> rusqlite::Result<Blunder> {
    Ok(Blunder {
        id: r.get(0)?,
        fen: r.get(1)?,
        best: r.get(2)?,
        played: r.get(3)?,
        loss: r.get(4)?,
        kind: r.get(5)?,
        source: r.get(6)?,
        mover: r.get(7)?,
        box_: r.get(8)?,
        due: r.get(9)?,
        tries: r.get(10)?,
    })
}

const BLUNDER_COLS: &str =
    "id, fen, best, played, loss, kind, source, mover, box, due, tries";

impl Db {
    pub fn add_blunder(&self, b: &Blunder) -> Result<(), String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        let now = now_ms();
        p.execute(
            "INSERT INTO blunder (id, fen, best, played, loss, kind, source, mover, at, box, due)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?9)
             ON CONFLICT(id) DO UPDATE SET loss=?5, kind=?6, source=?7",
            rusqlite::params![b.id, b.fen, b.best, b.played, b.loss, b.kind, b.source, b.mover, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn due_blunders(&self, limit: usize) -> Result<Vec<Blunder>, String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        let sql = format!(
            "SELECT {} FROM blunder WHERE due <= ?1 ORDER BY loss DESC, due ASC LIMIT ?2",
            BLUNDER_COLS
        );
        let mut st = p.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = st
            .query_map(rusqlite::params![now_ms(), limit as i64], row_to_blunder)
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn all_blunders(&self, limit: usize) -> Result<Vec<Blunder>, String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        let sql = format!("SELECT {} FROM blunder ORDER BY at DESC LIMIT ?1", BLUNDER_COLS);
        let mut st = p.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = st
            .query_map(rusqlite::params![limit as i64], row_to_blunder)
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn grade_blunder(&self, id: &str, solved: bool) -> Result<(), String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        const BOX_MS: [i64; 6] =
            [0, 86_400_000, 259_200_000, 604_800_000, 1_814_400_000, 5_184_000_000];
        let cur: i64 = p
            .query_row("SELECT box FROM blunder WHERE id = ?1", [id], |r| r.get(0))
            .unwrap_or(0);
        let next = if solved { (cur + 1).min(5) } else { 1 };
        p.execute(
            "UPDATE blunder
             SET box = ?2, due = ?3, tries = tries + 1, solved = solved + ?4
             WHERE id = ?1",
            rusqlite::params![id, next, now_ms() + BOX_MS[next as usize], solved as i32],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn forget_blunder(&self, id: &str) -> Result<(), String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        p.execute("DELETE FROM blunder WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Per-theme accuracy, joining recorded attempts back onto puzzle themes.
    pub fn theme_accuracy(&self) -> Result<Vec<(String, i64, i64)>, String> {
        let puz = self.puzzles.as_ref().ok_or("puzzle db not open")?;
        let pro = self.profile.as_ref().ok_or("profile db not open")?;

        let mut st = pro
            .prepare("SELECT puzzle_id, solved FROM attempt")
            .map_err(|e| e.to_string())?;
        let attempts: Vec<(String, i64)> = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        if attempts.is_empty() {
            return Ok(Vec::new());
        }

        let mut lookup = puz
            .prepare("SELECT themes FROM puzzle WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let mut tally: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();
        for (id, solved) in attempts {
            let themes: String = match lookup.query_row([&id], |r| r.get(0)) {
                Ok(t) => t,
                Err(_) => continue,
            };
            for t in themes.split(' ').filter(|t| !t.is_empty()) {
                let e = tally.entry(t.to_string()).or_insert((0, 0));
                e.0 += 1;
                e.1 += solved;
            }
        }
        let mut out: Vec<(String, i64, i64)> =
            tally.into_iter().map(|(t, (tries, ok))| (t, tries, ok)).collect();
        out.sort_by(|a, b| b.1.cmp(&a.1));
        Ok(out)
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Game {
    pub id: i64,
    pub pgn: String,
    pub white: String,
    pub black: String,
    pub result: String,
    pub my_side: String,
    pub moves: i64,
    pub at: i64,
    pub reviewed: i64,
}

impl Db {
    pub fn save_game(
        &self,
        pgn: &str,
        white: &str,
        black: &str,
        result: &str,
        my_side: &str,
        moves: i64,
    ) -> Result<i64, String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        p.execute(
            "INSERT INTO game (pgn, white, black, result, my_side, moves, at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            rusqlite::params![pgn, white, black, result, my_side, moves, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        Ok(p.last_insert_rowid())
    }

    pub fn list_games(&self, limit: usize) -> Result<Vec<Game>, String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        let mut st = p
            .prepare(
                "SELECT id, pgn, white, black, result, my_side, moves, at, reviewed
                 FROM game ORDER BY at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map(rusqlite::params![limit as i64], |r| {
                Ok(Game {
                    id: r.get(0)?,
                    pgn: r.get(1)?,
                    white: r.get(2)?,
                    black: r.get(3)?,
                    result: r.get(4)?,
                    my_side: r.get(5)?,
                    moves: r.get(6)?,
                    at: r.get(7)?,
                    reviewed: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn mark_reviewed(&self, id: i64) -> Result<(), String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        p.execute("UPDATE game SET reviewed = 1 WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_game(&self, id: i64) -> Result<(), String> {
        let p = self.profile.as_ref().ok_or("profile db not open")?;
        p.execute("DELETE FROM game WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_millis() as i64)
        .unwrap_or(0)
}

fn resolve_puzzles(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let mut tried: Vec<std::path::PathBuf> = Vec::new();
    let mut roots: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(dir) = app.path().resource_dir() {
        roots.push(dir.join("resources"));
        roots.push(dir.clone());
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.join("resources"));
            roots.push(dir.to_path_buf());
        }
    }
    roots.push(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources"));

    for root in roots {
        let p = root.join("puzzles.db");
        if p.exists() {
            return Ok(p);
        }
        tried.push(p);
    }
    Err(format!("puzzles.db not found - run `npm run puzzles`. Looked in {:?}", tried))
}

pub type SharedDb = Mutex<Db>;
