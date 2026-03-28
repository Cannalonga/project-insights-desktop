use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tauri::AppHandle;

const LOG_FILE_NAME: &str = "processing.log";
const PREVIOUS_LOG_FILE_NAME: &str = "processing.previous.log";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

fn resolve_log_dir(app: &AppHandle) -> PathBuf {
    if let Some(path) = app.path_resolver().app_log_dir() {
        return path;
    }

    if let Some(path) = app.path_resolver().app_local_data_dir() {
        return path.join("logs");
    }

    std::env::temp_dir().join("project-insights-logs")
}

fn rotate_if_needed(log_file_path: &PathBuf) -> Result<(), String> {
    if !log_file_path.exists() {
        return Ok(());
    }

    let metadata = fs::metadata(log_file_path)
        .map_err(|error| format!("failed to inspect processing log file: {error}"))?;

    if metadata.len() < MAX_LOG_BYTES {
        return Ok(());
    }

    let previous_log_path = log_file_path.with_file_name(PREVIOUS_LOG_FILE_NAME);
    if previous_log_path.exists() {
        fs::remove_file(&previous_log_path)
            .map_err(|error| format!("failed to remove previous processing log file: {error}"))?;
    }

    fs::rename(log_file_path, &previous_log_path)
        .map_err(|error| format!("failed to rotate processing log file: {error}"))?;

    Ok(())
}

pub fn append_processing_log_line(app: &AppHandle, entry: &str) -> Result<PathBuf, String> {
    let log_dir = resolve_log_dir(app);
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("failed to create processing log directory: {error}"))?;

    let log_file_path = log_dir.join(LOG_FILE_NAME);
    rotate_if_needed(&log_file_path)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file_path)
        .map_err(|error| format!("failed to open processing log file: {error}"))?;

    writeln!(file, "{entry}")
        .map_err(|error| format!("failed to append processing log entry: {error}"))?;

    Ok(log_file_path)
}

#[tauri::command]
pub fn append_processing_log(app: AppHandle, entry: String) -> Result<String, String> {
    append_processing_log_line(&app, &entry).map(|path| path.display().to_string())
}
