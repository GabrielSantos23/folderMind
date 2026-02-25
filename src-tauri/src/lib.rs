pub mod analyzer;
pub mod classifier;
pub mod database;

use analyzer::{Plan, AnalysisSettings};
use database::{Database, SessionRecord, FolderRecord, FileRecord};
use tauri::AppHandle;
use std::sync::Mutex;
use tauri::Manager;
use std::process::{Child, Command};
use std::path::PathBuf;

pub struct AppState {
    pub db: Mutex<Option<Database>>,
    pub classifier_process: Mutex<Option<Child>>,
}

fn get_target_triple() -> &'static str {
    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    { "x86_64-pc-windows-msvc" }
    #[cfg(all(target_arch = "x86_64", target_os = "linux"))]
    { "x86_64-unknown-linux-gnu" }
    #[cfg(all(target_arch = "x86_64", target_os = "macos"))]
    { "x86_64-apple-darwin" }
    #[cfg(all(target_arch = "aarch64", target_os = "macos"))]
    { "aarch64-apple-darwin" }
    #[cfg(all(target_arch = "aarch64", target_os = "linux"))]
    { "aarch64-unknown-linux-gnu" }
}

fn resolve_sidecar_path() -> Option<PathBuf> {
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let triple = get_target_triple();

    // Production: binary is next to the main executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let prod_path = exe_dir.join(format!("classifier{}", ext));
            if prod_path.exists() {
                log::info!("Found classifier sidecar at: {:?}", prod_path);
                return Some(prod_path);
            }
        }
    }

    // Development: binary is at src-tauri/binaries/classifier-{target_triple}
    let dev_path = PathBuf::from(format!("binaries/classifier-{}{}", triple, ext));
    if dev_path.exists() {
        log::info!("Found classifier sidecar (dev) at: {:?}", dev_path);
        return Some(dev_path);
    }

    None
}

fn read_env_file(app_handle: &AppHandle) -> std::collections::HashMap<String, String> {
    let mut env_vars = std::collections::HashMap::new();

    let mut env_paths = Vec::new();

    // 1. App data directory (e.g. C:\Users\user\AppData\Roaming\com.gabrielsantos.foldermind\.env)
    if let Ok(data_dir) = app_handle.path().app_data_dir() {
        env_paths.push(data_dir.join(".env"));
    }

    // 2. Next to the main executable (production)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            env_paths.push(exe_dir.join(".env"));
        }
    }

    for env_path in &env_paths {
        if let Ok(content) = std::fs::read_to_string(env_path) {
            log::info!("Loaded .env from: {:?}", env_path);
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    env_vars.insert(key.trim().to_string(), value.trim().to_string());
                }
            }
            break; // Use the first .env found
        }
    }

    // 3. Fallback: check system environment variable
    if !env_vars.contains_key("GROQ_API_KEY") {
        if let Ok(key) = std::env::var("GROQ_API_KEY") {
            env_vars.insert("GROQ_API_KEY".to_string(), key);
        }
    }

    env_vars
}

fn spawn_classifier(app_handle: &AppHandle) -> Option<Child> {
    let sidecar_path = match resolve_sidecar_path() {
        Some(p) => p,
        None => {
            log::warn!("Classifier sidecar binary not found. Running without embedded classifier.");
            log::warn!("Make sure the Python classifier server is running manually on port 8000.");
            return None;
        }
    };

    let env_vars = read_env_file(app_handle);

    if !env_vars.contains_key("GROQ_API_KEY") {
        log::warn!("GROQ_API_KEY not found. The classifier may not work correctly.");
        log::warn!("Set it as a system environment variable or place a .env file in the app data directory.");
    }

    log::info!("Spawning classifier sidecar: {:?}", sidecar_path);

    let mut cmd = Command::new(&sidecar_path);
    cmd.envs(&env_vars)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    // On Windows, hide the console window for the sidecar
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            log::info!("Classifier sidecar spawned with PID: {}", child.id());

            // Health-check in a background thread to avoid blocking the tokio runtime
            std::thread::spawn(|| {
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(2))
                    .build()
                    .unwrap();
                let mut healthy = false;
                for attempt in 0..30 {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    match client.get("http://localhost:8000/health").send() {
                        Ok(res) if res.status().is_success() => {
                            log::info!("Classifier sidecar is healthy (attempt {})", attempt + 1);
                            healthy = true;
                            break;
                        }
                        _ => {
                            if attempt % 5 == 4 {
                                log::info!("Waiting for classifier sidecar... (attempt {})", attempt + 1);
                            }
                        }
                    }
                }
                if !healthy {
                    log::warn!("Classifier sidecar did not become healthy within 15 seconds");
                }
            });

            Some(child)
        }
        Err(e) => {
            log::error!("Failed to spawn classifier sidecar: {}", e);
            None
        }
    }
}

#[tauri::command]
async fn analyze_directory(
    app_handle: AppHandle,
    path: String,
    use_vision: bool,
    session_id: String,
    settings: Option<AnalysisSettings>,
) -> Result<Plan, String> {
    let folder_name = path.split(['/', '\\']).last().unwrap_or(&path).to_string();
    let now = chrono::Local::now().to_rfc3339();
    
    let session = SessionRecord {
        id: session_id.clone(),
        folder_path: path.clone(),
        folder_name,
        file_count: 0,
        folder_count: 0,
        confidence: 0,
        status: "analyzing".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    
    {
        let state = app_handle.state::<AppState>();
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            db.create_session(&session).map_err(|e| e.to_string())?;
        }
    }

    let analysis_settings = settings.unwrap_or_default();
    let session_id_for_db = session_id.clone();
    let app_handle_for_thread = app_handle.clone();
    let result = tokio::task::spawn_blocking(move || {
        analyzer::analyze_with_progress(app_handle_for_thread, &path, use_vision, &session_id, analysis_settings)
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let state = app_handle.state::<AppState>();
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            db.update_session_stats(&session_id_for_db, result.file_count as i32, result.folder_count as i32, result.confidence as i32)
                .map_err(|e| e.to_string())?;
            
            for folder in &result.folders {
                let folder_id = db.add_folder(&session_id_for_db, &folder.name, &folder.tag, folder.files.len() as i32)
                    .map_err(|e| e.to_string())?;
                
                for file in &folder.files {
                    db.add_file(folder_id, &file.name, &file.size, &file.original_path)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
async fn apply_plan(app_handle: AppHandle, plan: Plan) -> Result<(), String> {
    let session_id = plan.id.clone();
    
    {
        let state = app_handle.state::<AppState>();
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            db.update_session_status(&session_id, "applied").map_err(|e| e.to_string())?;
        }
    }
    
    tokio::task::spawn_blocking(move || analyzer::apply(plan))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reject_plan(app_handle: AppHandle, plan_id: String) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        db.update_session_status(&plan_id, "rejected").map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn undo_plan(app_handle: AppHandle, plan: Plan) -> Result<(), String> {
    let session_id = plan.id.clone();

    tokio::task::spawn_blocking(move || analyzer::undo_apply(plan))
        .await
        .map_err(|e| e.to_string())??;

    {
        let state = app_handle.state::<AppState>();
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            db.update_session_status(&session_id, "ready").map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn get_sessions(app_handle: AppHandle) -> Result<Vec<SessionRecord>, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        db.get_all_sessions().map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
async fn get_session_details(app_handle: AppHandle, session_id: String) -> Result<Option<(SessionRecord, Vec<(FolderRecord, Vec<FileRecord>)>)>, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        let session = db.get_session_by_id(&session_id).map_err(|e| e.to_string())?;
        
        if let Some(session) = session {
            let folders = db.get_folders_by_session(&session_id).map_err(|e| e.to_string())?;
            
            let mut result = Vec::new();
            for folder in folders {
                let files = db.get_files_by_folder(folder.id).map_err(|e| e.to_string())?;
                result.push((folder, files));
            }
            
            Ok(Some((session, result)))
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn delete_session(app_handle: AppHandle, session_id: String) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        db.delete_session(&session_id).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn clear_all_sessions(app_handle: AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        let sessions = db.get_all_sessions().map_err(|e| e.to_string())?;
        for session in sessions {
            db.delete_session(&session.id).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn prune_old_sessions(app_handle: AppHandle, max_age_days: i64) -> Result<u32, String> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    
    if let Some(db) = db_guard.as_ref() {
        let sessions = db.get_all_sessions().map_err(|e| e.to_string())?;
        let cutoff = chrono::Local::now() - chrono::Duration::days(max_age_days);
        let cutoff_str = cutoff.to_rfc3339();
        let mut pruned = 0u32;
        
        for session in sessions {
            if session.created_at < cutoff_str {
                db.delete_session(&session.id).map_err(|e| e.to_string())?;
                pruned += 1;
            }
        }
        
        Ok(pruned)
    } else {
        Ok(0)
    }
}

#[tauri::command]
async fn delete_file_from_disk(path: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }
    std::fs::remove_file(file_path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
async fn move_file_on_disk(source_path: String, target_folder: String, file_name: String) -> Result<String, String> {
    let src = std::path::Path::new(&source_path);
    if !src.exists() || !src.is_file() {
        return Err(format!("Source file not found: {}", source_path));
    }
    let target_dir = std::path::Path::new(&target_folder);
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }
    let mut dest = target_dir.join(&file_name);
    let mut counter = 1;
    while dest.exists() {
        let stem = std::path::Path::new(&file_name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        let ext = std::path::Path::new(&file_name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        dest = target_dir.join(format!("{} ({}){}", stem, counter, ext));
        counter += 1;
    }
    std::fs::rename(src, &dest).map_err(|e| format!("Failed to move file: {}", e))?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
async fn rename_folder_on_disk(folder_path: String, new_name: String) -> Result<String, String> {
    let src = std::path::Path::new(&folder_path);
    if !src.exists() || !src.is_dir() {
        return Err(format!("Folder not found: {}", folder_path));
    }
    let parent = src.parent().ok_or_else(|| "Cannot determine parent directory".to_string())?;
    let dest = parent.join(&new_name);
    if dest.exists() {
        return Err(format!("A folder named '{}' already exists", new_name));
    }
    std::fs::rename(src, &dest).map_err(|e| format!("Failed to rename folder: {}", e))?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            db: Mutex::new(None),
            classifier_process: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            analyze_directory,
            apply_plan,
            reject_plan,
            undo_plan,
            get_sessions,
            get_session_details,
            delete_session,
            clear_all_sessions,
            prune_old_sessions,
            delete_file_from_disk,
            move_file_on_disk,
            rename_folder_on_disk,
        ])
        .setup(|app| {
            let db = Database::new(&app.handle()).expect("Failed to initialize database");
            let state = app.state::<AppState>();
            *state.db.lock().unwrap() = Some(db);

            // Spawn the classifier sidecar
            let classifier_child = spawn_classifier(&app.handle());
            *state.classifier_process.lock().unwrap() = classifier_child;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                let mut child = state.classifier_process.lock().unwrap();
                if let Some(ref mut process) = *child {
                    log::info!("Killing classifier sidecar (PID: {})", process.id());
                    let _ = process.kill();
                    let _ = process.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
