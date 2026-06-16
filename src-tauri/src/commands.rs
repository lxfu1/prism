use crate::parser::{self, EntryIndex, FieldMapping, FileStats, SearchResult};
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tauri::State;

pub struct AppState {
    pub current_file: Mutex<Option<PathBuf>>,
    pub entries: RwLock<Vec<EntryIndex>>,
}

#[tauri::command]
pub async fn load_jsonl(
    path: String,
    mapping: FieldMapping,
    state: State<'_, AppState>,
) -> Result<Vec<EntryIndex>, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let file_path_clone = file_path.clone();
    let entries = tokio::task::spawn_blocking(move || parser::build_index(&file_path_clone, &mapping))
        .await
        .map_err(|e| format!("Join error: {}", e))??;

    {
        *state.current_file.lock().unwrap() = Some(file_path);
        *state.entries.write().unwrap() = entries.clone();
    }

    Ok(entries)
}

#[tauri::command]
pub async fn get_entry(path: String, offset: u64, length: u64) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    tokio::task::spawn_blocking(move || parser::read_entry(&file_path, offset, length))
        .await
        .map_err(|e| format!("Join error: {}", e))?
}

#[tauri::command]
pub fn get_file_stats(state: State<'_, AppState>) -> Result<FileStats, String> {
    let current_file = state.current_file.lock().unwrap();
    let entries = state.entries.read().unwrap();

    match current_file.as_ref() {
        Some(path) => parser::get_file_stats(path, &entries),
        None => Err("No file loaded".to_string()),
    }
}

#[tauri::command]
pub async fn search_entries(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let path_opt = state.current_file.lock().unwrap().clone();
    let entries_snapshot = state.entries.read().unwrap().clone();

    match path_opt {
        Some(path) => {
            tokio::task::spawn_blocking(move || {
                parser::search_entries(&path, &entries_snapshot, &query, 100)
            })
            .await
            .map_err(|e| format!("Join error: {}", e))?
        }
        None => Err("No file loaded".to_string()),
    }
}
