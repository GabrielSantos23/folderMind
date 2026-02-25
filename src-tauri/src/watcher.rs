use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::classifier;


#[derive(Clone, Serialize)]
pub struct FileMovedPayload {
    pub filename: String,
    pub from: String,
    pub to: String,
    pub category: String,
    pub is_vision: bool,
    pub timestamp: u64,
}

#[derive(Clone, Serialize)]
pub struct WatcherErrorPayload {
    pub message: String,
    pub timestamp: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}


pub fn start(
    app_handle: AppHandle,
    watch_path: String,
    categories: Vec<String>,
    use_vision: bool,
) -> Result<(RecommendedWatcher, mpsc::Sender<()>), String> {
    let path = Path::new(&watch_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Directory does not exist: {}", watch_path));
    }

    let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

    let mut watcher = RecommendedWatcher::new(
        move |result| {
            let _ = event_tx.send(result);
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    let watch_path_clone = watch_path.clone();
    thread::spawn(move || {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        let mut recently_processed: HashMap<PathBuf, Instant> = HashMap::new();
        let debounce_window = Duration::from_secs(3);
        let settle_delay = Duration::from_millis(1500);

        loop {
            if shutdown_rx.try_recv().is_ok() {
                log::info!("Watcher shutdown signal received");
                break;
            }

            match event_rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(event)) => {
                    if !matches!(event.kind, EventKind::Create(_)) {
                        continue;
                    }

                    for file_path in event.paths {
                        thread::sleep(settle_delay);

                        if !file_path.is_file() {
                            continue;
                        }

                        if let Some(last) = recently_processed.get(&file_path) {
                            if last.elapsed() < debounce_window {
                                continue;
                            }
                        }

                        process_file(
                            &app_handle,
                            &client,
                            &file_path,
                            &watch_path_clone,
                            &categories,
                            use_vision,
                            &mut recently_processed,
                        );
                    }
                }
                Ok(Err(e)) => {
                    let _ = app_handle.emit(
                        "watcher-error",
                        WatcherErrorPayload {
                            message: format!("Watch error: {}", e),
                            timestamp: now_millis(),
                        },
                    );
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    log::info!("Event channel disconnected, stopping watcher thread");
                    break;
                }
            }

            recently_processed.retain(|_, t| t.elapsed() < Duration::from_secs(60));
        }
    });

    Ok((watcher, shutdown_tx))
}


fn process_file(
    app_handle: &AppHandle,
    client: &Client,
    file_path: &Path,
    watch_dir: &str,
    categories: &[String],
    use_vision: bool,
    recently_processed: &mut HashMap<PathBuf, Instant>,
) {
    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();

    let file_path_str = file_path.to_string_lossy().to_string();
    log::info!("Processing new file: {}", filename);

    let result = match classifier::classify_file(
        client,
        &filename,
        &extension,
        categories,
        Some(&file_path_str),
        use_vision,
    ) {
        Ok(r) => r,
        Err(e) => {
            let _ = app_handle.emit(
                "watcher-error",
                WatcherErrorPayload {
                    message: format!("Classification failed for '{}': {}", filename, e),
                    timestamp: now_millis(),
                },
            );
            return;
        }
    };

    let dest_dir = Path::new(watch_dir).join(&result.category);
    if let Err(e) = fs::create_dir_all(&dest_dir) {
        let _ = app_handle.emit(
            "watcher-error",
            WatcherErrorPayload {
                message: format!("Failed to create folder '{}': {}", result.category, e),
                timestamp: now_millis(),
            },
        );
        return;
    }

    let dest_file = resolve_dest_path(&dest_dir, &filename, &extension);

    match fs::rename(file_path, &dest_file) {
        Ok(_) => {
            recently_processed.insert(file_path.to_path_buf(), Instant::now());
            recently_processed.insert(dest_file.clone(), Instant::now());
            log::info!("Moved '{}' → '{}'", filename, result.category);

            let _ = app_handle.emit(
                "file-moved",
                FileMovedPayload {
                    filename,
                    from: file_path_str,
                    to: dest_file.to_string_lossy().to_string(),
                    category: result.category,
                    is_vision: result.is_vision,
                    timestamp: now_millis(),
                },
            );
        }
        Err(e) => {
            let _ = app_handle.emit(
                "watcher-error",
                WatcherErrorPayload {
                    message: format!("Failed to move '{}': {}", filename, e),
                    timestamp: now_millis(),
                },
            );
        }
    }
}

fn resolve_dest_path(dest_dir: &Path, filename: &str, extension: &str) -> PathBuf {
    let mut dest = dest_dir.join(filename);
    if !dest.exists() {
        return dest;
    }

    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");

    let mut counter = 1u32;
    loop {
        dest = dest_dir.join(format!("{} ({}){}", stem, counter, extension));
        if !dest.exists() {
            return dest;
        }
        counter += 1;
    }
}
