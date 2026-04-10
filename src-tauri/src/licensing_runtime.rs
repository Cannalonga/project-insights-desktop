use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

const LICENSING_DIR_NAME: &str = "licensing";
const LICENSING_STATE_FILE_NAME: &str = "license-state.json";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedLicensingState {
    schema_version: u32,
    project_ref: String,
    license_key: String,
    machine_fingerprint: String,
    #[serde(alias = "activationToken")]
    activation_correlation_token: String,
    license_status: String,
    last_validation_state: String,
    trusted_until: String,
    next_validation_required_at: String,
    last_validated_at: String,
}

fn resolve_licensing_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path_resolver()
        .app_local_data_dir()
        .ok_or_else(|| "failed to resolve app local data directory for licensing state".to_string())?;

    Ok(app_data_dir
        .join(LICENSING_DIR_NAME)
        .join(LICENSING_STATE_FILE_NAME))
}

fn write_file_atomically(path: &PathBuf, contents: &str) -> Result<(), String> {
    let temp_path = path.with_file_name(format!("{LICENSING_STATE_FILE_NAME}.tmp"));

    fs::write(&temp_path, contents)
        .map_err(|error| format!("failed to write temporary licensing state file: {error}"))?;

    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("failed to replace licensing state file: {error}"))?;
    }

    fs::rename(&temp_path, path)
        .map_err(|error| format!("failed to finalize licensing state file: {error}"))?;

    Ok(())
}

#[tauri::command]
pub fn load_licensing_state(app: AppHandle) -> Result<Option<String>, String> {
    let state_path = resolve_licensing_state_path(&app)?;

    if !state_path.exists() || !state_path.is_file() {
        return Ok(None);
    }

    fs::read_to_string(&state_path)
        .map(Some)
        .map_err(|error| format!("failed to read licensing state: {error}"))
}

#[tauri::command]
pub fn save_licensing_state(app: AppHandle, contents: String) -> Result<(), String> {
    let _: PersistedLicensingState = serde_json::from_str(&contents)
        .map_err(|error| format!("failed to parse licensing state payload: {error}"))?;

    let state_path = resolve_licensing_state_path(&app)?;
    if let Some(parent_dir) = state_path.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("failed to create licensing state directory: {error}"))?;
    }

    write_file_atomically(&state_path, &contents)
}

#[tauri::command]
pub fn clear_licensing_state(app: AppHandle) -> Result<(), String> {
    let state_path = resolve_licensing_state_path(&app)?;

    if state_path.exists() {
        fs::remove_file(&state_path)
            .map_err(|error| format!("failed to remove licensing state file: {error}"))?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn read_machine_guid() -> Option<String> {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    for line in stdout.lines() {
        if !line.contains("MachineGuid") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(value) = parts.last() {
            let normalized = value.trim().to_lowercase();
            if !normalized.is_empty() {
                return Some(normalized);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn read_machine_guid() -> Option<String> {
    None
}

fn normalize_value(value: Option<String>) -> String {
    value
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .replace(char::is_whitespace, "")
}

#[tauri::command]
pub fn get_machine_fingerprint() -> Result<String, String> {
    let machine_guid = normalize_value(read_machine_guid());
    let computer_name = normalize_value(env::var("COMPUTERNAME").ok());
    let architecture = normalize_value(env::var("PROCESSOR_ARCHITECTURE").ok());
    let os = env::consts::OS.to_string();

    if machine_guid.is_empty() && computer_name.is_empty() {
        return Err("could not derive a stable machine fingerprint".to_string());
    }

    let canonical = format!(
        "machineGuid={machine_guid}\ncomputerName={computer_name}\narch={architecture}\nos={os}"
    );

    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    let digest = hasher.finalize();

    Ok(digest.iter().map(|byte| format!("{:02x}", byte)).collect())
}
