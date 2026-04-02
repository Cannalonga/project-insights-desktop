use crate::license_public_key::{
    load_license_contract, EXPECTED_LICENSE_SIGNATURE_ALGORITHM,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

const LICENSE_DIR_NAME: &str = "license";
const LICENSE_FILE_NAME: &str = "license.dat";

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LicensePayload {
    customer_name: String,
    license_id: String,
    plan: String,
    issued_at: String,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseFile {
    payload: LicensePayload,
    signature: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyLicenseResponse {
    payload: LicensePayload,
}

fn resolve_license_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path_resolver()
        .app_local_data_dir()
        .ok_or_else(|| "failed to resolve app local data directory for license".to_string())?;

    Ok(app_data_dir.join(LICENSE_DIR_NAME).join(LICENSE_FILE_NAME))
}

fn validate_payload(payload: &LicensePayload) -> Result<(), String> {
    if payload.customer_name.trim().is_empty()
        || payload.license_id.trim().is_empty()
        || payload.issued_at.trim().is_empty()
        || payload.expires_at.trim().is_empty()
    {
        return Err("license payload is incomplete".to_string());
    }

    match payload.plan.as_str() {
        "semiannual" | "annual" => Ok(()),
        _ => Err("license plan is invalid".to_string()),
    }
}

fn canonicalize_license_payload(payload: &LicensePayload) -> String {
    format!(
        "customerName={}\nlicenseId={}\nplan={}\nissuedAt={}\nexpiresAt={}",
        payload.customer_name.trim(),
        payload.license_id.trim(),
        payload.plan.trim(),
        payload.issued_at.trim(),
        payload.expires_at.trim()
    )
}

fn resolve_public_key_bytes() -> Result<Vec<[u8; 32]>, String> {
    let contract = load_license_contract()?;
    let resolved_keys = contract.resolved_public_keys()?;
    let mut keys = Vec::new();

    for key in resolved_keys {
        let bytes = URL_SAFE_NO_PAD
            .decode(key.trim())
            .map_err(|error| format!("failed to decode embedded license public key: {error}"))?;

        let array = <[u8; 32]>::try_from(bytes.as_slice())
            .map_err(|_| "embedded license public key has invalid length".to_string())?;
        keys.push(array);
    }

    Ok(keys)
}

fn write_license_atomically(license_path: &PathBuf, contents: &str) -> Result<(), String> {
    let temp_path = license_path.with_file_name(format!("{LICENSE_FILE_NAME}.tmp"));

    fs::write(&temp_path, contents)
        .map_err(|error| format!("failed to write temporary license file: {error}"))?;

    if license_path.exists() {
        fs::remove_file(license_path)
            .map_err(|error| format!("failed to replace persisted license file: {error}"))?;
    }

    fs::rename(&temp_path, license_path)
        .map_err(|error| format!("failed to finalize persisted license file: {error}"))?;

    Ok(())
}

#[tauri::command]
pub fn load_license_content(app: AppHandle) -> Result<Option<String>, String> {
    let license_path = resolve_license_path(&app)?;

    if !license_path.exists() || !license_path.is_file() {
        return Ok(None);
    }

    fs::read_to_string(&license_path)
        .map(Some)
        .map_err(|error| format!("failed to read persisted license: {error}"))
}

#[tauri::command]
pub fn save_license_content(app: AppHandle, contents: String) -> Result<(), String> {
    let license_path = resolve_license_path(&app)?;

    if let Some(parent_dir) = license_path.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("failed to create license directory: {error}"))?;
    }

    write_license_atomically(&license_path, &contents)
}

#[tauri::command]
pub fn verify_license_signature(contents: String) -> Result<VerifyLicenseResponse, String> {
    let license_file: LicenseFile =
        serde_json::from_str(&contents).map_err(|error| format!("failed to parse license file: {error}"))?;

    validate_payload(&license_file.payload)?;

    let signature_bytes = URL_SAFE_NO_PAD
        .decode(license_file.signature.trim())
        .map_err(|error| format!("failed to decode license signature: {error}"))?;

    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|error| format!("failed to parse license signature: {error}"))?;

    let canonical_payload = canonicalize_license_payload(&license_file.payload);
    let signature_valid = resolve_public_key_bytes()?
        .into_iter()
        .filter_map(|bytes| VerifyingKey::from_bytes(&bytes).ok())
        .any(|public_key| public_key.verify(canonical_payload.as_bytes(), &signature).is_ok());

    if !signature_valid {
        return Err(format!(
            "{EXPECTED_LICENSE_SIGNATURE_ALGORITHM} license signature verification failed: no configured public key matched"
        ));
    }

    Ok(VerifyLicenseResponse {
        payload: license_file.payload,
    })
}
