//! Long-lived Stockfish process driven over UCI.
//! One process for the whole session; analysis lines stream to the UI as events.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Default, Serialize, Clone, Debug)]
pub struct Line {
    pub depth: u32,
    pub seldepth: u32,
    pub multipv: u32,
    /// Centipawns from the side-to-move point of view. None when mate is set.
    pub cp: Option<i32>,
    /// Mate distance in moves. Negative means the side to move is getting mated.
    pub mate: Option<i32>,
    pub nodes: u64,
    pub nps: u64,
    pub time: u64,
    pub pv: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Progress {
    pub job: u64,
    pub lines: Vec<Line>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Done {
    pub job: u64,
    pub best: Option<String>,
    pub ponder: Option<String>,
}

pub struct Engine {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    pub job: Arc<AtomicU64>,
    pub ready: bool,
    /// Signalled by the reader thread each time the engine answers `readyok`.
    readyok: Option<Receiver<()>>,
}

impl Engine {
    pub fn new() -> Self {
        Engine { child: None, stdin: None, job: Arc::new(AtomicU64::new(0)), ready: false, readyok: None }
    }

    fn send(&mut self, cmd: &str) -> Result<(), String> {
        let s = self.stdin.as_mut().ok_or("engine not started")?;
        writeln!(s, "{}", cmd).map_err(|e| e.to_string())?;
        s.flush().map_err(|e| e.to_string())
    }

    pub fn start(&mut self, app: &AppHandle, threads: u32, hash_mb: u32) -> Result<(), String> {
        if self.ready {
            return Ok(());
        }
        let exe = resolve_engine_path(app)?;

        let mut cmd = Command::new(&exe);
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| format!("spawn {:?}: {}", exe, e))?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stdin = child.stdin.take().ok_or("no stdin")?;

        self.stdin = Some(stdin);
        self.child = Some(child);

        let (tx, rx): (Sender<()>, Receiver<()>) = channel();
        self.readyok = Some(rx);

        let handle = app.clone();
        let job = self.job.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut buf = String::new();
            let mut pending: Vec<Line> = Vec::new();
            loop {
                buf.clear();
                match reader.read_line(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
                let text = buf.trim();
                if text.is_empty() {
                    continue;
                }
                let current = job.load(Ordering::SeqCst);

                if text.starts_with("info ") {
                    if let Some(line) = parse_info(text) {
                        // Keep one entry per multipv slot, newest wins.
                        if let Some(slot) = pending.iter_mut().find(|l| l.multipv == line.multipv) {
                            *slot = line;
                        } else {
                            pending.push(line);
                        }
                        pending.sort_by_key(|l| l.multipv);
                        let _ = handle.emit("engine:progress", Progress { job: current, lines: pending.clone() });
                    }
                } else if text.starts_with("bestmove") {
                    let mut parts = text.split_whitespace();
                    parts.next();
                    let best = parts.next().filter(|s| *s != "(none)").map(String::from);
                    let ponder = parts.nth(1).map(String::from);
                    let _ = handle.emit("engine:done", Done { job: current, best, ponder });
                    pending.clear();
                } else if text == "readyok" {
                    // Barrier acknowledgement; see Engine::sync.
                    let _ = tx.send(());
                } else if text.starts_with("id name") {
                    let _ = handle.emit("engine:id", text.trim_start_matches("id name ").to_string());
                }
            }
        });

        self.send("uci")?;
        self.send(&format!("setoption name Threads value {}", threads.clamp(1, 1024)))?;
        self.send(&format!("setoption name Hash value {}", hash_mb.clamp(1, 32768)))?;
        self.send("setoption name UCI_ShowWDL value true")?;
        self.send("isready")?;
        self.ready = true;
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.send("stop")
    }

    /// Wait until the engine has finished whatever it was doing.
    ///
    /// UCI guarantees `readyok` arrives only after a stopped search has already
    /// emitted its `bestmove`. Without this barrier the aborted search's
    /// `bestmove` races the next `go` and can be published under the next job's
    /// id, which resolves the wrong position — harmless when a human is
    /// clicking around, fatal when analysing a whole game back to back.
    fn sync(&mut self) -> Result<(), String> {
        // Drop anything left over from an earlier barrier.
        if let Some(rx) = &self.readyok {
            while rx.try_recv().is_ok() {}
        }
        self.send("isready")?;
        match &self.readyok {
            Some(rx) => match rx.recv_timeout(Duration::from_secs(10)) {
                Ok(()) => Ok(()),
                Err(_) => Err("engine did not answer isready".into()),
            },
            None => Ok(()),
        }
    }

    pub fn analyse(
        &mut self,
        fen: &str,
        moves: &[String],
        multipv: u32,
        depth: Option<u32>,
        movetime: Option<u64>,
    ) -> Result<u64, String> {
        // Stop and drain BEFORE claiming a new job id, so a late bestmove from
        // the previous search is still attributed to the previous job.
        let _ = self.send("stop");
        self.sync()?;
        let id = self.job.fetch_add(1, Ordering::SeqCst) + 1;
        self.send(&format!("setoption name MultiPV value {}", multipv.clamp(1, 16)))?;
        let pos = if moves.is_empty() {
            format!("position fen {}", fen)
        } else {
            format!("position fen {} moves {}", fen, moves.join(" "))
        };
        self.send(&pos)?;
        let go = match (depth, movetime) {
            (Some(d), _) => format!("go depth {}", d),
            (None, Some(ms)) => format!("go movetime {}", ms),
            _ => "go depth 20".to_string(),
        };
        self.send(&go)?;
        Ok(id)
    }

    /// Play a move at a capped strength, for sparring.
    pub fn play(&mut self, fen: &str, moves: &[String], elo: u32, movetime: u64) -> Result<u64, String> {
        let _ = self.send("stop");
        self.sync()?;
        let id = self.job.fetch_add(1, Ordering::SeqCst) + 1;
        self.send("setoption name MultiPV value 1")?;
        self.send("setoption name UCI_LimitStrength value true")?;
        self.send(&format!("setoption name UCI_Elo value {}", elo.clamp(1320, 3190)))?;
        let pos = if moves.is_empty() {
            format!("position fen {}", fen)
        } else {
            format!("position fen {} moves {}", fen, moves.join(" "))
        };
        self.send(&pos)?;
        self.send(&format!("go movetime {}", movetime))?;
        Ok(id)
    }

    pub fn unlimit(&mut self) -> Result<(), String> {
        self.send("setoption name UCI_LimitStrength value false")
    }

    pub fn shutdown(&mut self) {
        let _ = self.send("quit");
        if let Some(mut c) = self.child.take() {
            let _ = c.wait();
        }
        self.ready = false;
    }
}

fn resolve_engine_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // Tauri strips the target triple when it bundles a sidecar, so the packaged
    // app ships `stockfish.exe` while the dev tree holds the triple-suffixed
    // name that `externalBin` requires. Try both everywhere rather than guess.
    let names: &[&str] = if cfg!(windows) {
        &["stockfish.exe", "stockfish-x86_64-pc-windows-msvc.exe"]
    } else {
        &["stockfish", "stockfish-x86_64-unknown-linux-gnu", "stockfish-aarch64-apple-darwin"]
    };

    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        roots.push(dir.clone());
        roots.push(dir.join("binaries"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
            roots.push(dir.join("binaries"));
        }
    }
    // Dev fallback: the checked-in sidecar folder.
    roots.push(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries"));

    for root in &roots {
        for name in names {
            let p = root.join(name);
            if p.exists() {
                return Ok(p);
            }
        }
    }
    Err(format!(
        "stockfish binary not found. Looked for {:?} in {:?}",
        names, roots
    ))
}

fn parse_info(text: &str) -> Option<Line> {
    let toks: Vec<&str> = text.split_whitespace().collect();
    let mut l = Line { multipv: 1, ..Default::default() };
    let mut saw_score = false;
    let mut i = 0;
    while i < toks.len() {
        match toks[i] {
            "depth" => {
                l.depth = toks.get(i + 1)?.parse().ok()?;
                i += 2;
            }
            "seldepth" => {
                l.seldepth = toks.get(i + 1)?.parse().unwrap_or(0);
                i += 2;
            }
            "multipv" => {
                l.multipv = toks.get(i + 1)?.parse().unwrap_or(1);
                i += 2;
            }
            "nodes" => {
                l.nodes = toks.get(i + 1)?.parse().unwrap_or(0);
                i += 2;
            }
            "nps" => {
                l.nps = toks.get(i + 1)?.parse().unwrap_or(0);
                i += 2;
            }
            "time" => {
                l.time = toks.get(i + 1)?.parse().unwrap_or(0);
                i += 2;
            }
            "score" => {
                saw_score = true;
                match *toks.get(i + 1)? {
                    "cp" => l.cp = toks.get(i + 2)?.parse().ok(),
                    "mate" => l.mate = toks.get(i + 2)?.parse().ok(),
                    _ => {}
                }
                i += 3;
            }
            "pv" => {
                l.pv = toks[i + 1..].iter().map(|s| s.to_string()).collect();
                break;
            }
            _ => i += 1,
        }
    }
    // Ignore currmove-style chatter with no evaluation attached.
    if !saw_score || l.pv.is_empty() {
        None
    } else {
        Some(l)
    }
}

pub type Shared = Mutex<Engine>;
