pub mod analyzer;
pub mod classifier;
pub mod database;

use analyzer::{Plan, AnalysisSettings};
use database::{Database, SessionRecord, FolderRecord, FileRecord};
use tauri::AppHandle;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Option<Database>>,
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
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
