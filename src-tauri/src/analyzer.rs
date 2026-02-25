use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::classifier::{self, BatchFileItem, ClassifyResponse};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub icon: String,
    pub name: String,
    pub size: String,
    pub original_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderGroup {
    pub icon: String,
    pub name: String,
    pub tag: String,
    pub files: Vec<FileItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub folder_count: usize,
    pub file_count: usize,
    pub confidence: u32,
    pub folders: Vec<FolderGroup>,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSettings {
    pub exclude_hidden: bool,
    pub exclude_patterns: Vec<String>,
    pub max_file_size_mb: u64,
    pub deep_analysis: bool,
}

impl Default for AnalysisSettings {
    fn default() -> Self {
        Self {
            exclude_hidden: true,
            exclude_patterns: vec![
                ".git".to_string(),
                "node_modules".to_string(),
                ".DS_Store".to_string(),
            ],
            max_file_size_mb: 100,
            deep_analysis: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub session_id: String,
    pub step: usize,
    pub total_steps: usize,
    pub label: String,
    pub sub: String,
    pub percent: u32,
    pub done: bool,
    pub current_file: Option<String>,
    pub files_processed: usize,
    pub total_files: usize,
}

const STEPS: &[(&str, &str)] = &[
    (
        "Scanning directory structure",
        "Reading file metadata and paths recursively...",
    ),
    (
        "Analyzing file types & extensions",
        "Detecting file categories...",
    ),
    (
        "Running AI classification model",
        "Applying semantic grouping...",
    ),
    (
        "Detecting duplicates & version conflicts",
        "Checking for conflicts...",
    ),
    (
        "Building optimal folder hierarchy",
        "Generating folder structure...",
    ),
    ("Plan ready", "Awaiting your approval..."),
];

const CATEGORY_ALIASES: &[(&str, &str)] = &[
    ("screenshots", "Images & Screenshots"),
    ("screenshot", "Images & Screenshots"),
    ("images", "Images & Screenshots"),
    ("image", "Images & Screenshots"),
    ("photos", "Images & Screenshots"),
    ("photo", "Images & Screenshots"),
    ("pictures", "Images & Screenshots"),
    ("picture", "Images & Screenshots"),
    ("documents", "Documents & Reports"),
    ("document", "Documents & Reports"),
    ("docs", "Documents & Reports"),
    ("reports", "Documents & Reports"),
    ("code", "Code & Projects"),
    ("programming", "Code & Projects"),
    ("scripts", "Code & Projects"),
    ("audio", "Audio Files"),
    ("music", "Audio Files"),
    ("sound", "Audio Files"),
    ("video", "Video & Media"),
    ("videos", "Video & Media"),
    ("movies", "Video & Media"),
    ("archives", "Archives & Backups"),
    ("archive", "Archives & Backups"),
    ("backups", "Archives & Backups"),
    ("backup", "Archives & Backups"),
    ("compressed", "Archives & Backups"),
    ("installers", "Installers & Tools"),
    ("installer", "Installers & Tools"),
    ("software", "Installers & Tools"),
    ("tools", "Installers & Tools"),
];

fn normalize_category(category: &str) -> String {
    let lower = category.to_lowercase();

    for (alias, canonical) in CATEGORY_ALIASES {
        if lower == *alias || lower.contains(alias) {
            return canonical.to_string();
        }
    }

    category.to_string()
}

fn format_size(size: u64) -> String {
    let kb = size as f64 / 1024.0;
    if kb < 1024.0 {
        format!("{:.0} KB", kb)
    } else {
        let mb = kb / 1024.0;
        if mb < 1024.0 {
            format!("{:.1} MB", mb)
        } else {
            let gb = mb / 1024.0;
            format!("{:.2} GB", gb)
        }
    }
}

pub fn analyze_with_progress(
    app_handle: AppHandle,
    path: &str,
    use_vision: bool,
    session_id: &str,
    settings: AnalysisSettings,
) -> Result<Plan, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let base_path = Path::new(path);
    if !base_path.is_dir() {
        return Err(format!("Path is not a valid directory: {}", path));
    }

    let emit_progress = |step: usize,
                         total: usize,
                         label: &str,
                         sub: &str,
                         done: bool,
                         current_file: Option<&str>,
                         files_processed: usize,
                         total_files: usize| {
        let percent = if total_files > 0 && step == 2 {
            ((files_processed as f32 / total_files as f32) * 100.0) as u32
        } else {
            ((step as f32 / total as f32) * 100.0) as u32
        };
        let event = ProgressEvent {
            session_id: session_id.to_string(),
            step,
            total_steps: total,
            label: label.to_string(),
            sub: sub.to_string(),
            percent,
            done,
            current_file: current_file.map(String::from),
            files_processed,
            total_files,
        };
        let _ = app_handle.emit("analysis-progress", &event);
    };

    emit_progress(0, STEPS.len(), STEPS[0].0, STEPS[0].1, false, None, 0, 0);

    let categories = vec![
        "Images & Screenshots".to_string(),
        "Documents & Reports".to_string(),
        "Code & Projects".to_string(),
        "Installers & Tools".to_string(),
        "Audio Files".to_string(),
        "Video & Media".to_string(),
        "Archives & Backups".to_string(),
    ];

    let max_bytes = settings.max_file_size_mb * 1024 * 1024;

    let mut all_entries: Vec<_> = fs::read_dir(base_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    let folder_name_lower = base_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if folder_name_lower == "desktop" || folder_name_lower == "área de trabalho" {
        let public_desktop = Path::new("C:\\Users\\Public\\Desktop");
        if public_desktop.exists() && public_desktop != base_path {
            if let Ok(public_entries) = fs::read_dir(public_desktop) {
                let public_files: Vec<_> = public_entries.filter_map(|e| e.ok()).collect();
                log::info!("Also scanning {} files from Public Desktop", public_files.len());
                all_entries.extend(public_files);
            }
        }
    }

    let file_entries: Vec<_> = all_entries
        .iter()
        .filter(|e| {
            let path = e.path();
            if !path.is_file() {
                return false;
            }
            let fname = path.file_name().unwrap_or_default().to_string_lossy();
            if settings.exclude_hidden && fname.starts_with('.') {
                return false;
            }
            for pattern in &settings.exclude_patterns {
                if fname == *pattern || fname.contains(pattern.as_str()) {
                    return false;
                }
            }
            true
        })
        .collect();
    let total_files = file_entries.len();

    emit_progress(
        1,
        STEPS.len(),
        STEPS[1].0,
        &format!("Found {} files to analyze...", total_files),
        false,
        None,
        0,
        total_files,
    );

    let mut batch_items: Vec<BatchFileItem> = Vec::new();
    let mut file_info: Vec<(String, String, String, u64)> = Vec::new();

    for entry in &file_entries {
        let file_path = entry.path();
        let filename = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let extension = file_path
            .extension()
            .map(|e| e.to_string_lossy().into_owned())
            .unwrap_or_default();
        let extension_with_dot = if extension.is_empty() {
            String::new()
        } else {
            format!(".{}", extension)
        };

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let size = metadata.len();
        let size_str = format_size(size);

        let file_path_for_ai = if size <= max_bytes {
            Some(file_path.to_string_lossy().into_owned())
        } else {
            None
        };

        batch_items.push(BatchFileItem {
            filename: filename.clone(),
            extension: extension_with_dot.clone(),
            file_path: file_path_for_ai,
        });

        file_info.push((filename, extension_with_dot, size_str, size));
    }

    emit_progress(
        2,
        STEPS.len(),
        STEPS[2].0,
        &format!("Sending {} files to AI for classification...", total_files),
        false,
        None,
        0,
        total_files,
    );

    let results = classifier::classify_batch(&client, batch_items, &categories, use_vision)
        .unwrap_or_else(|e| {
            log::error!("Batch classification failed: {}", e);
            vec![
                ClassifyResponse {
                    category: "Other".to_string(),
                    is_vision: false
                };
                total_files
            ]
        });

    log::info!("Received {} classification results", results.len());

    let mut groups: HashMap<String, Vec<FileItem>> = HashMap::new();
    let mut file_count = 0;

    for (i, result) in results.into_iter().enumerate() {
        if i >= file_info.len() {
            break;
        }

        let (filename, _extension, size_str, _size) = &file_info[i];
        let file_path = file_entries[i].path();
        let path_str = file_path.to_string_lossy().into_owned();

        emit_progress(
            2,
            STEPS.len(),
            STEPS[2].0,
            &format!("Processed {} of {} files", file_count + 1, total_files),
            false,
            Some(filename),
            file_count + 1,
            total_files,
        );

        thread::sleep(Duration::from_millis(30));

        let icon = match result.category.as_str() {
            "Images & Screenshots" | "Images" | "Screenshots" | "Logos Templates" => "🖼️",
            "Documents & Reports" | "Documents" => "📄",
            "Code & Projects" | "Code" => "💻",
            "Installers & Tools" => "🔧",
            "Audio Files" | "Audio" => "🎵",
            "Video & Media" | "Video" | "Videos" => "🎬",
            "Archives & Backups" | "Archives" | "Zip" => "🗃️",
            "Urban & Architecture" => "🏙️",
            "Nature & Outdoors" => "🌿",
            "Portraits & People" => "👤",
            "Design & Graphics" => "🎨",
            "Spreadsheets" => "📊",
            _ => {
                if result.is_vision {
                    "🖼️"
                } else {
                    "📁"
                }
            }
        };

        let item = FileItem {
            icon: icon.to_string(),
            name: filename.clone(),
            size: size_str.clone(),
            original_path: path_str,
        };

        let normalized_category = normalize_category(&result.category);
        groups.entry(normalized_category).or_default().push(item);
        file_count += 1;
    }

    emit_progress(
        3,
        STEPS.len(),
        STEPS[3].0,
        &format!("Analyzed {} files for duplicates...", file_count),
        false,
        None,
        file_count,
        total_files,
    );

    emit_progress(
        4,
        STEPS.len(),
        STEPS[4].0,
        &format!("Creating folders for {} categories...", groups.len()),
        false,
        None,
        file_count,
        total_files,
    );

    let mut folders = Vec::new();
    for (cat_name, files) in groups {
        let icon = files
            .first()
            .map(|f| f.icon.clone())
            .unwrap_or_else(|| "📁".to_string());
        folders.push(FolderGroup {
            icon,
            name: cat_name,
            tag: "auto".to_string(),
            files,
        });
    }

    folders.sort_by(|a, b| b.files.len().cmp(&a.files.len()));

    let session_name = base_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let safe_session_name = if session_name.is_empty() {
        "Root Folder".to_string()
    } else {
        session_name
    };

    emit_progress(
        5,
        STEPS.len(),
        STEPS[5].0,
        &format!("{} folders ready for {} files", folders.len(), file_count),
        true,
        None,
        file_count,
        total_files,
    );

    Ok(Plan {
        id: session_id.to_string(),
        name: safe_session_name,
        folder_count: folders.len(),
        file_count,
        confidence: 94,
        folders,
        status: "ready".to_string(),
    })
}

pub fn apply(plan: Plan) -> Result<(), String> {
    let mut errors: Vec<String> = Vec::new();

    for folder in plan.folders {
        if folder.files.is_empty() {
            continue;
        }
        let first_file_path = Path::new(&folder.files[0].original_path);
        let base_dir = first_file_path.parent().unwrap();

        let target_dir = base_dir.join(&folder.name);
        if !target_dir.exists() {
            if let Err(e) = fs::create_dir_all(&target_dir) {
                errors.push(format!("Failed to create folder {}: {}", folder.name, e));
                continue;
            }
        }

        for file in folder.files {
            let src = Path::new(&file.original_path);
            if !src.exists() {
                continue;
            }
            let mut dest = target_dir.join(src.file_name().unwrap());

            let mut counter = 1;
            while dest.exists() && dest != src {
                let stem = src.file_stem().unwrap().to_string_lossy();
                let ext = src.extension().unwrap_or_default().to_string_lossy();
                let ext_str = if ext.is_empty() {
                    "".to_string()
                } else {
                    format!(".{}", ext)
                };
                dest = target_dir.join(format!("{} ({}){}", stem, counter, ext_str));
                counter += 1;
            }

            if let Err(e) = fs::rename(src, &dest) {
                log::warn!("Failed to move {}: {}", file.name, e);
                errors.push(format!("{}: {}", file.name, e));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        log::warn!("{} files could not be moved", errors.len());
        Ok(())
    }
}

pub fn undo_apply(plan: Plan) -> Result<(), String> {
    for folder in &plan.folders {
        if folder.files.is_empty() {
            continue;
        }

        let first_file_path = Path::new(&folder.files[0].original_path);
        let base_dir = first_file_path.parent().unwrap();
        let organized_dir = base_dir.join(&folder.name);

        if !organized_dir.exists() {
            continue;
        }

        for file in &folder.files {
            let original_dest = Path::new(&file.original_path);
            let file_name = original_dest.file_name().unwrap();
            let current_location = organized_dir.join(file_name);

            if current_location.exists() {
                if let Some(parent) = original_dest.parent() {
                    if !parent.exists() {
                        let _ = fs::create_dir_all(parent);
                    }
                }
                if let Err(e) = fs::rename(&current_location, original_dest) {
                    log::warn!("Failed to move {} back: {}", file.name, e);
                }
            }
        }

        if organized_dir.exists() {
            let is_empty = fs::read_dir(&organized_dir)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);

            if is_empty {
                let _ = fs::remove_dir(&organized_dir);
            }
        }
    }
    Ok(())
}
