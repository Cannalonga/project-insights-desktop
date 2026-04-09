use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

const REGISTRY_DIR_NAME: &str = "registry";
const REGISTRY_FILE_NAME: &str = "license-catalog.jsonl";
const REGISTRY_BACKUP_FILE_NAME: &str = "license-catalog.backup.1.jsonl";
const REGISTRY_BACKUP_THRESHOLD_BYTES: u64 = 500 * 1024;

#[derive(Deserialize)]
struct GenerateLicenseInput {
    #[serde(rename = "customerName")]
    customer_name: String,
    email: Option<String>,
    #[serde(rename = "type")]
    license_type: String,
    #[serde(rename = "expirationDate")]
    expiration_date: String,
    notes: Option<String>,
    overrides: Option<PathOverrides>,
}

#[derive(Deserialize)]
struct ValidateLicenseInput {
    #[serde(rename = "licenseJson")]
    license_json: String,
    overrides: Option<PathOverrides>,
}

#[derive(Deserialize, Clone)]
pub struct PathOverrides {
    #[serde(rename = "cliPath")]
    cli_path: Option<String>,
    #[serde(rename = "contractPath")]
    contract_path: Option<String>,
    #[serde(rename = "baseDir")]
    base_dir: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LicensePreview {
    license_id: String,
    customer_name: String,
    plan: String,
    expiration_date: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CatalogRecord {
    license_id: String,
    customer_name: String,
    email: Option<String>,
    plan: String,
    expiration_date: String,
    issued_at: String,
    license_hash: String,
    license_json: String,
    license_preview: Option<LicensePreview>,
    schema_version: Option<u32>,
    notes: Option<String>,
    created_at: String,
}

#[derive(Serialize)]
struct ConfigStatus {
    cli: bool,
    contract: bool,
    base: bool,
    #[serde(rename = "privateKey")]
    private_key: bool,
    output: bool,
    debug: ConfigStatusDebug,
    #[serde(rename = "failureReason")]
    failure_reason: Option<String>,
}

#[derive(Serialize)]
struct ConfigStatusDebug {
    #[serde(rename = "cliPathExists")]
    cli_path_exists: bool,
    #[serde(rename = "contractExists")]
    contract_exists: bool,
    #[serde(rename = "baseExists")]
    base_exists: bool,
    #[serde(rename = "privateKeyExists")]
    private_key_exists: bool,
    #[serde(rename = "outputExists")]
    output_exists: bool,
    #[serde(rename = "cliPathKind")]
    cli_path_kind: &'static str,
    #[serde(rename = "contractKind")]
    contract_kind: &'static str,
    #[serde(rename = "baseKind")]
    base_kind: &'static str,
    #[serde(rename = "privateKeyKind")]
    private_key_kind: &'static str,
    #[serde(rename = "outputKind")]
    output_kind: &'static str,
}

#[derive(Serialize)]
pub struct LicenseAdminConfig {
    #[serde(rename = "cliPath")]
    cli_path: String,
    #[serde(rename = "contractPath")]
    contract_path: String,
    #[serde(rename = "baseDir")]
    base_dir: String,
    #[serde(rename = "privateKeyPath")]
    private_key_path: String,
    #[serde(rename = "issuedDir")]
    issued_dir: String,
    #[serde(rename = "registryFilePath")]
    registry_file_path: String,
    #[serde(rename = "configStatus")]
    config_status: ConfigStatus,
}

#[derive(Serialize)]
struct StructuredError {
    code: &'static str,
    message: String,
    details: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensingBackendStatus {
    admin_token_configured: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensingAdminProxyInput {
    functions_base_url: String,
    anon_key: String,
    timeout_ms: u64,
    path: String,
    payload: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensingAdminProxyResponse {
    status: u16,
    body: String,
}

#[derive(Debug)]
struct CommandError {
    code: &'static str,
    message: String,
    details: Option<Value>,
}

struct ResolvedPaths {
    repo_root: PathBuf,
    cli_script: PathBuf,
    contract_path: PathBuf,
    base_dir: PathBuf,
    private_key_path: PathBuf,
    issued_dir: PathBuf,
    registry_dir: PathBuf,
    registry_file_path: PathBuf,
    registry_backup_file_path: PathBuf,
}

struct NormalizedGenerateInput {
    customer_name: String,
    email: Option<String>,
    license_type: String,
    notes: Option<String>,
    license_id: String,
    plan: String,
    issued_at: String,
    expires_at: String,
}

struct PathInspection {
    exists: bool,
    kind: &'static str,
}
fn registry_write_lock() -> &'static Mutex<()> {
    static REGISTRY_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    REGISTRY_WRITE_LOCK.get_or_init(|| Mutex::new(()))
}

#[tauri::command]
pub fn get_license_admin_config() -> Result<LicenseAdminConfig, String> {
    let paths = resolve_paths(None).map_err(structured_error_string)?;
    let config_status = build_config_status(&paths);
    Ok(LicenseAdminConfig {
        cli_path: paths.cli_script.display().to_string(),
        contract_path: paths.contract_path.display().to_string(),
        base_dir: paths.base_dir.display().to_string(),
        private_key_path: paths.private_key_path.display().to_string(),
        issued_dir: paths.issued_dir.display().to_string(),
        registry_file_path: paths.registry_file_path.display().to_string(),
        config_status,
    })
}

#[tauri::command]
pub fn get_licensing_backend_status() -> Result<LicensingBackendStatus, String> {
    Ok(LicensingBackendStatus {
        admin_token_configured: read_secure_admin_token().is_ok(),
    })
}

#[tauri::command]
pub async fn proxy_licensing_admin_request(input: String) -> Result<LicensingAdminProxyResponse, String> {
    let parsed: LicensingAdminProxyInput = serde_json::from_str(&input).map_err(|error| {
        structured_error_string(error_with_code(
            "invalid_admin_proxy_input",
            "Falha ao preparar a chamada administrativa ao backend.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        ))
    })?;

    let admin_token = read_secure_admin_token().map_err(structured_error_string)?;
    let timeout_ms = parsed.timeout_ms.clamp(1000, 15000);
    let url = format!("{}/{}", parsed.functions_base_url.trim_end_matches('/'), parsed.path.trim_start_matches('/'));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| {
            structured_error_string(error_with_code(
                "admin_http_client_failed",
                "Falha ao preparar a chamada administrativa ao backend.".to_string(),
                Some(json!({ "reason": error.to_string() })),
            ))
        })?;

    let authorization = format!("Bearer {}", parsed.anon_key);

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("apikey", &parsed.anon_key)
        .header("Authorization", authorization)
        .header("x-admin-token", admin_token)
        .json(&parsed.payload)
        .send()
        .await
        .map_err(|error| {
            let code = if error.is_timeout() { "timeout" } else { "network_error" };
            let message = if error.is_timeout() {
                "Tempo limite excedido ao chamar o backend.".to_string()
            } else {
                "Falha de rede ao chamar o backend.".to_string()
            };

            structured_error_string(error_with_code(
                code,
                message,
                Some(json!({ "reason": error.to_string() })),
            ))
        })?;

    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| {
        structured_error_string(error_with_code(
            "admin_http_body_failed",
            "Falha ao ler a resposta do backend.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        ))
    })?;

    Ok(LicensingAdminProxyResponse { status, body })
}

#[tauri::command]
pub fn generate_license(input: String) -> Result<String, String> {
    let temp_file = write_temp_file("license-admin-ui-generate", "json", input.as_bytes())
        .map_err(|error| structured_error_string(error_with_code("temp_write_failed", error.to_string(), None)))?;

    let input_contents = fs::read_to_string(&temp_file)
        .map_err(|error| structured_error_string(error_with_code("input_read_failed", error.to_string(), None)))?;
    let parsed: GenerateLicenseInput = serde_json::from_str(&input_contents).map_err(|error| {
        structured_error_string(error_with_code(
            "invalid_input_json",
            "Falha ao ler o JSON de entrada para emissao.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        ))
    })?;
    let payload = normalize_generate_input(parsed).map_err(structured_error_string)?;
    let paths = resolve_paths(payload_overrides_from_generate(&input_contents)).map_err(structured_error_string)?;

    let args = vec![
        "emitir".to_string(),
        "--customer-name".to_string(),
        payload.customer_name.clone(),
        "--license-id".to_string(),
        payload.license_id.clone(),
        "--plan".to_string(),
        payload.plan.clone(),
        "--issued-at".to_string(),
        payload.issued_at.clone(),
        "--expires-at".to_string(),
        payload.expires_at.clone(),
        "--base-dir".to_string(),
        paths.base_dir.display().to_string(),
        "--license-contract-file".to_string(),
        paths.contract_path.display().to_string(),
    ];

    let cli_result = run_cli_command(&paths, &args);
    let _ = fs::remove_file(&temp_file);

    let output = cli_result.map_err(structured_error_string)?;
    parse_generate_output(output, &payload).map_err(structured_error_string)
}

#[tauri::command]
pub fn validate_license(input: String) -> Result<String, String> {
    let parsed = parse_validate_input(&input).map_err(structured_error_string)?;
    let temp_file = write_temp_file("license-admin-ui-validate", "license", parsed.license_json.as_bytes())
        .map_err(|error| structured_error_string(error_with_code("temp_write_failed", error.to_string(), None)))?;
    let paths = resolve_paths(parsed.overrides).map_err(structured_error_string)?;

    let args = vec![
        "validar".to_string(),
        "--file".to_string(),
        temp_file.display().to_string(),
        "--base-dir".to_string(),
        paths.base_dir.display().to_string(),
        "--license-contract-file".to_string(),
        paths.contract_path.display().to_string(),
    ];

    let cli_result = run_cli_command(&paths, &args);
    let _ = fs::remove_file(&temp_file);

    let output = match cli_result {
        Ok(stdout) => stdout,
        Err(error) if error.code == "cli_non_zero_exit" => {
            if let Some(details) = &error.details {
                if let Some(stdout) = details.get("stdout").and_then(Value::as_str) {
                    if !stdout.trim().is_empty() {
                        return parse_validate_output(stdout.to_string()).map_err(structured_error_string);
                    }
                }
            }
            return Err(structured_error_string(error));
        }
        Err(error) => return Err(structured_error_string(error)),
    };

    parse_validate_output(output).map_err(structured_error_string)
}

#[tauri::command]
pub fn save_license_record(record: String, overrides: Option<PathOverrides>) -> Result<(), String> {
    let paths = resolve_paths(overrides).map_err(structured_error_string)?;
    let mut parsed: CatalogRecord = serde_json::from_str(&record).map_err(|error| {
        structured_error_string(error_with_code(
            "invalid_catalog_record",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        ))
    })?;

    if parsed.license_id.trim().is_empty()
        || parsed.customer_name.trim().is_empty()
        || parsed.plan.trim().is_empty()
        || parsed.expiration_date.trim().is_empty()
        || parsed.issued_at.trim().is_empty()
        || parsed.license_hash.trim().is_empty()
        || parsed.license_json.trim().is_empty()
        || parsed.created_at.trim().is_empty()
    {
        return Err(structured_error_string(error_with_code(
            "invalid_catalog_record",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": "Registro do catalogo incompleto." })),
        )));
    }

    persist_catalog_record(&paths, &mut parsed).map_err(structured_error_string)
}

#[tauri::command]
pub fn load_license_catalog(overrides: Option<PathOverrides>) -> Result<String, String> {
    let paths = resolve_paths(overrides).map_err(structured_error_string)?;

    if !paths.registry_file_path.exists() {
        return Ok("[]".to_string());
    }

    let records = read_catalog_records(&paths.registry_file_path).map_err(structured_error_string)?;

    serde_json::to_string(&records).map_err(|error| {
        structured_error_string(error_with_code(
            "registry_encode_failed",
            "Falha ao carregar o catalogo de licencas.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        ))
    })
}

fn parse_validate_input(input: &str) -> Result<ValidateLicenseInput, CommandError> {
    if let Ok(parsed) = serde_json::from_str::<ValidateLicenseInput>(input) {
        if !parsed.license_json.trim().is_empty() {
            return Ok(parsed);
        }
    }

    Ok(ValidateLicenseInput {
        license_json: input.to_string(),
        overrides: None,
    })
}

fn payload_overrides_from_generate(input: &str) -> Option<PathOverrides> {
    serde_json::from_str::<GenerateLicenseInput>(input)
        .ok()
        .and_then(|parsed| parsed.overrides)
}

fn read_secure_admin_token() -> Result<String, CommandError> {
    read_first_non_empty(&["LICENSING_ADMIN_TOKEN", "VITE_LICENSING_ADMIN_TOKEN"])
        .or_else(|| read_env_file_value("LICENSING_ADMIN_TOKEN"))
        .or_else(|| read_env_file_value("VITE_LICENSING_ADMIN_TOKEN"))
        .ok_or_else(|| {
            error_with_code(
                "missing_admin_token",
                "LICENSING_ADMIN_TOKEN nao configurado no ambiente local seguro.".to_string(),
                None,
            )
        })
}

fn read_first_non_empty(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        env::var(key)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn read_env_file_value(key: &str) -> Option<String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let env_path = manifest_dir.parent()?.join(".env.local");
    let contents = fs::read_to_string(env_path).ok()?;

    contents.lines().find_map(|line| {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            return None;
        }

        let (entry_key, entry_value) = trimmed.split_once('=')?;
        if entry_key.trim() != key {
            return None;
        }

        let normalized = entry_value.trim().trim_matches('"').trim_matches('\'');
        if normalized.is_empty() {
            return None;
        }

        Some(normalized.to_string())
    })
}

fn resolve_paths(overrides: Option<PathOverrides>) -> Result<ResolvedPaths, CommandError> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let tool_root = manifest_dir.parent().ok_or_else(|| {
        error_with_code("path_resolution_failed", "Nao foi possivel resolver o diretorio da ferramenta UI.".to_string(), None)
    })?;
    let repo_root = tool_root.parent().and_then(Path::parent).ok_or_else(|| {
        error_with_code("path_resolution_failed", "Nao foi possivel resolver a raiz do repositorio.".to_string(), None)
    })?.to_path_buf();

    let cli_script = overrides
        .as_ref()
        .and_then(|value| value.cli_path.as_ref())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| env::var("LICENSE_ADMIN_UI_CLI_PATH").ok().map(PathBuf::from))
        .unwrap_or_else(|| repo_root.join("tools").join("license-admin").join("src").join("cli.mjs"));

    let contract_path = overrides
        .as_ref()
        .and_then(|value| value.contract_path.as_ref())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| env::var("LICENSE_ADMIN_UI_CONTRACT_PATH").ok().map(PathBuf::from))
        .unwrap_or_else(|| repo_root.join("shared").join("license-contract.json"));

    let base_dir = overrides
        .as_ref()
        .and_then(|value| value.base_dir.as_ref())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| env::var("LICENSE_ADMIN_UI_BASE_DIR").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from(r"D:\LICENCAS_CANNACONVERTER2_0"));

    let private_key_path = base_dir.join("private_key").join("private_key.pem");
    let issued_dir = base_dir.join("issued");
    let registry_dir = base_dir.join(REGISTRY_DIR_NAME);
    let registry_file_path = registry_dir.join(REGISTRY_FILE_NAME);
    let registry_backup_file_path = registry_dir.join(REGISTRY_BACKUP_FILE_NAME);

    Ok(ResolvedPaths {
        repo_root,
        cli_script,
        contract_path,
        base_dir,
        private_key_path,
        issued_dir,
        registry_dir,
        registry_file_path,
        registry_backup_file_path,
    })
}

fn normalize_generate_input(parsed: GenerateLicenseInput) -> Result<NormalizedGenerateInput, CommandError> {
    let customer_name = parsed.customer_name.trim().to_string();
    if customer_name.is_empty() {
        return Err(error_with_code("invalid_input", "customerName e obrigatorio.".to_string(), None));
    }

    let license_type = parsed.license_type.trim().to_string();
    let plan = match license_type.as_str() {
        "semiannual" => "semiannual",
        "annual" => "annual",
        _ => return Err(error_with_code("invalid_input", "type deve ser semiannual ou annual.".to_string(), None)),
    }
    .to_string();

    let expires_at = parsed.expiration_date.trim().to_string();
    if expires_at.is_empty() {
        return Err(error_with_code("invalid_input", "expirationDate e obrigatorio.".to_string(), None));
    }
    if chrono_like_iso_check(&expires_at).is_err() {
        return Err(error_with_code("invalid_input", "expirationDate deve estar em formato ISO 8601 completo.".to_string(), None));
    }

    let issued_at = build_iso_now().map_err(|error| error_with_code("time_error", error.to_string(), None))?;
    let license_id = format!("PI-{}", compact_timestamp_for_id());

    Ok(NormalizedGenerateInput {
        customer_name,
        email: parsed.email.filter(|value| !value.trim().is_empty()),
        license_type,
        notes: parsed.notes.filter(|value| !value.trim().is_empty()),
        license_id,
        plan,
        issued_at,
        expires_at,
    })
}

fn run_cli_command(paths: &ResolvedPaths, args: &[String]) -> Result<String, CommandError> {
    if !paths.cli_script.exists() {
        return Err(error_with_code(
            "cli_not_found",
            "Erro ao executar operacao.".to_string(),
            Some(json!({ "reason": "CLI nao encontrada.", "cliPath": paths.cli_script.display().to_string() })),
        ));
    }

    let output = Command::new("node")
        .arg(&paths.cli_script)
        .args(args)
        .current_dir(paths.repo_root.join("tools").join("license-admin"))
        .output()
        .map_err(|error| {
            error_with_code(
                "cli_execution_failed",
                "Erro ao executar operacao.".to_string(),
                Some(json!({ "reason": error.to_string() })),
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(error_with_code(
            "cli_non_zero_exit",
            "Erro ao executar operacao.".to_string(),
            Some(json!({
                "exitCode": output.status.code(),
                "stdout": stdout,
                "stderr": stderr,
            })),
        ));
    }

    if stdout.is_empty() {
        return Err(error_with_code(
            "empty_stdout",
            "Erro ao executar operacao.".to_string(),
            Some(json!({ "stderr": stderr })),
        ));
    }

    Ok(stdout)
}

fn build_config_status(paths: &ResolvedPaths) -> ConfigStatus {
    let cli_info = inspect_file_path(&paths.cli_script);
    let contract_info = inspect_file_path(&paths.contract_path);
    let base_info = inspect_directory_path(&paths.base_dir);
    let private_key_info = inspect_file_path(&paths.private_key_path);
    let output_info = inspect_directory_path(&paths.issued_dir);

    println!("Checking path: {}", paths.cli_script.display());
    println!("Exists: {}", cli_info.exists);
    println!("Checking path: {}", paths.contract_path.display());
    println!("Exists: {}", contract_info.exists);
    println!("Checking path: {}", paths.base_dir.display());
    println!("Exists: {}", base_info.exists);
    println!("Checking path: {}", paths.private_key_path.display());
    println!("Exists: {}", private_key_info.exists);
    println!("Checking path: {}", paths.issued_dir.display());
    println!("Exists: {}", output_info.exists);

    let failure_reason = if !cli_info.exists {
        Some("CLI nao encontrada".to_string())
    } else if cli_info.kind != "file" {
        Some("CLI nao e um arquivo executavel por node".to_string())
    } else if !contract_info.exists {
        Some("Contrato de licenca nao encontrado".to_string())
    } else if contract_info.kind != "file" {
        Some("Contrato de licenca nao e um arquivo valido".to_string())
    } else if !base_info.exists {
        Some("Base operacional nao existe".to_string())
    } else if base_info.kind != "dir" {
        Some("Base operacional nao e um diretorio".to_string())
    } else if !private_key_info.exists {
        Some("privateKey nao encontrado".to_string())
    } else if private_key_info.kind != "file" {
        Some("privateKey nao e um arquivo valido".to_string())
    } else if !output_info.exists {
        Some("output directory nao existe".to_string())
    } else if output_info.kind != "dir" {
        Some("output directory nao e um diretorio".to_string())
    } else {
        None
    };

    ConfigStatus {
        cli: cli_info.exists && cli_info.kind == "file",
        contract: contract_info.exists && contract_info.kind == "file",
        base: base_info.exists && base_info.kind == "dir",
        private_key: private_key_info.exists && private_key_info.kind == "file",
        output: output_info.exists && output_info.kind == "dir",
        debug: ConfigStatusDebug {
            cli_path_exists: cli_info.exists,
            contract_exists: contract_info.exists,
            base_exists: base_info.exists,
            private_key_exists: private_key_info.exists,
            output_exists: output_info.exists,
            cli_path_kind: cli_info.kind,
            contract_kind: contract_info.kind,
            base_kind: base_info.kind,
            private_key_kind: private_key_info.kind,
            output_kind: output_info.kind,
        },
        failure_reason,
    }
}

fn inspect_file_path(path: &Path) -> PathInspection {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => PathInspection { exists: true, kind: "file" },
        Ok(metadata) if metadata.is_dir() => PathInspection { exists: true, kind: "dir" },
        Ok(_) => PathInspection { exists: true, kind: "other" },
        Err(_) => PathInspection { exists: false, kind: "missing" },
    }
}

fn inspect_directory_path(path: &Path) -> PathInspection {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => PathInspection { exists: true, kind: "dir" },
        Ok(metadata) if metadata.is_file() => PathInspection { exists: true, kind: "file" },
        Ok(_) => PathInspection { exists: true, kind: "other" },
        Err(_) => PathInspection { exists: false, kind: "missing" },
    }
}
fn registry_contains_license_hash(registry_file_path: &Path, license_hash: &str) -> Result<bool, CommandError> {
    if !registry_file_path.exists() {
        return Ok(false);
    }

    let file = File::open(registry_file_path).map_err(|error| {
        error_with_code(
            "registry_open_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;
    let reader = BufReader::new(file);

    for (index, line) in reader.lines().enumerate() {
        let line = line.map_err(|error| {
            error_with_code(
                "registry_read_failed",
                "Falha ao salvar o registro da licenca.".to_string(),
                Some(json!({ "reason": error.to_string(), "line": index + 1 })),
            )
        })?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: CatalogRecord = serde_json::from_str(trimmed).map_err(|error| {
            error_with_code(
                "registry_parse_failed",
                "Falha ao salvar o registro da licenca.".to_string(),
                Some(json!({ "reason": error.to_string(), "line": index + 1 })),
            )
        })?;

        if parsed.license_hash == license_hash {
            return Ok(true);
        }
    }

    Ok(false)
}

fn rotate_registry_backups(registry_file_path: &Path, backup_file_path: &Path) {
    let should_backup = fs::metadata(registry_file_path)
        .map(|metadata| metadata.len() > REGISTRY_BACKUP_THRESHOLD_BYTES)
        .unwrap_or(false);

    if !should_backup {
        return;
    }

    let backup_dir = backup_file_path.parent().unwrap_or_else(|| Path::new("."));
    let backup_1 = backup_file_path.to_path_buf();
    let backup_2 = backup_dir.join("license-catalog.backup.2.jsonl");
    let backup_3 = backup_dir.join("license-catalog.backup.3.jsonl");

    let _ = fs::remove_file(&backup_3);
    if backup_2.exists() {
        let _ = fs::rename(&backup_2, &backup_3);
    }

    let _ = fs::remove_file(&backup_2);
    if backup_1.exists() {
        let _ = fs::rename(&backup_1, &backup_2);
    }

    let _ = fs::copy(registry_file_path, &backup_1);
}

fn read_catalog_records(registry_file_path: &Path) -> Result<Vec<Value>, CommandError> {
    let file = File::open(registry_file_path).map_err(|error| {
        error_with_code(
            "registry_read_failed",
            "Falha ao carregar o catalogo de licencas.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;
    let reader = BufReader::new(file);
    let mut records = Vec::<Value>::new();

    for (index, line) in reader.lines().enumerate() {
        let line = line.map_err(|error| {
            error_with_code(
                "registry_read_failed",
                "Falha ao carregar o catalogo de licencas.".to_string(),
                Some(json!({ "reason": error.to_string(), "line": index + 1 })),
            )
        })?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: Value = serde_json::from_str(trimmed).map_err(|error| {
            error_with_code(
                "registry_parse_failed",
                "Falha ao carregar o catalogo de licencas.".to_string(),
                Some(json!({ "reason": error.to_string(), "line": index + 1 })),
            )
        })?;
        records.push(parsed);
    }

    Ok(records)
}
fn persist_catalog_record(paths: &ResolvedPaths, parsed: &mut CatalogRecord) -> Result<(), CommandError> {
    if parsed.license_preview.is_none() {
        parsed.license_preview = Some(LicensePreview {
            license_id: parsed.license_id.clone(),
            customer_name: parsed.customer_name.clone(),
            plan: parsed.plan.clone(),
            expiration_date: parsed.expiration_date.clone(),
        });
    }

    if parsed.schema_version.is_none() {
        parsed.schema_version = Some(1);
    }

    fs::create_dir_all(&paths.registry_dir).map_err(|error| {
        error_with_code(
            "registry_dir_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;

    let _guard = registry_write_lock().lock().map_err(|_| {
        error_with_code(
            "registry_lock_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": "Nao foi possivel obter o lock de escrita do catalogo." })),
        )
    })?;

    if registry_contains_license_hash(&paths.registry_file_path, &parsed.license_hash)? {
        return Ok(());
    }

    rotate_registry_backups(&paths.registry_file_path, &paths.registry_backup_file_path);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.registry_file_path)
        .map_err(|error| {
            error_with_code(
                "registry_open_failed",
                "Falha ao salvar o registro da licenca.".to_string(),
                Some(json!({ "reason": error.to_string() })),
            )
        })?;

    let record_line = serde_json::to_string(&parsed).map_err(|error| {
        error_with_code(
            "registry_encode_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;

    file.write_all(record_line.as_bytes()).map_err(|error| {
        error_with_code(
            "registry_write_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;
    file.write_all(b"\n").map_err(|error| {
        error_with_code(
            "registry_write_failed",
            "Falha ao salvar o registro da licenca.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;

    Ok(())
}

fn parse_generate_output(stdout: String, payload: &NormalizedGenerateInput) -> Result<String, CommandError> {
    let file_path = read_line_value(&stdout, "Arquivo:").ok_or_else(|| {
        error_with_code(
            "invalid_cli_output",
            "Erro ao executar operacao.".to_string(),
            Some(json!({ "reason": "Nao foi possivel localizar o caminho do arquivo gerado." })),
        )
    })?;

    let license_json = fs::read_to_string(&file_path).map_err(|error| {
        error_with_code(
            "license_read_failed",
            "Erro ao executar operacao.".to_string(),
            Some(json!({ "reason": error.to_string() })),
        )
    })?;

    serde_json::to_string_pretty(&json!({
        "status": "ok",
        "message": "Licenca emitida com sucesso.",
        "filePath": file_path,
        "licenseJson": license_json,
        "payload": {
            "customerName": payload.customer_name,
            "licenseId": payload.license_id,
            "plan": payload.plan,
            "issuedAt": payload.issued_at,
            "expiresAt": payload.expires_at,
        },
        "uiMetadata": {
            "email": payload.email,
            "notes": payload.notes,
            "type": payload.license_type,
        }
    }))
    .map_err(|error| error_with_code("json_encode_failed", error.to_string(), None))
}

fn parse_validate_output(stdout: String) -> Result<String, CommandError> {
    let status = read_line_value(&stdout, "Status:")
        .ok_or_else(|| error_with_code("invalid_cli_output", "Erro ao executar operacao.".to_string(), Some(json!({ "reason": "Nao foi possivel ler o status retornado pela CLI." }))))?;
    let signature_label = read_line_value(&stdout, "Assinatura:").unwrap_or_else(|| "invalida".to_string());

    let response = json!({
        "status": status,
        "message": format!("Validacao concluida com status: {}", status),
        "signatureValid": signature_label.eq_ignore_ascii_case("valida"),
        "payload": {
            "customerName": read_line_value(&stdout, "Cliente:"),
            "licenseId": read_line_value(&stdout, "Licenca:"),
            "plan": read_line_value(&stdout, "Plano:"),
            "issuedAt": read_line_value(&stdout, "Emitida em:"),
            "expiresAt": read_line_value(&stdout, "Expira em:"),
            "daysRemaining": read_line_value(&stdout, "Dias restantes:").and_then(|value| value.parse::<i64>().ok()),
        }
    });

    serde_json::to_string_pretty(&response)
        .map_err(|error| error_with_code("json_encode_failed", error.to_string(), None))
}

fn read_line_value(stdout: &str, prefix: &str) -> Option<String> {
    stdout.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed.strip_prefix(prefix).map(|value| value.trim().to_string())
    })
}

fn write_temp_file(prefix: &str, extension: &str, contents: &[u8]) -> std::io::Result<PathBuf> {
    let mut temp_path = env::temp_dir();
    temp_path.push(format!("{}-{}.{}", prefix, timestamp_nanos(), extension));
    fs::write(&temp_path, contents)?;
    Ok(temp_path)
}

fn build_iso_now() -> Result<String, std::time::SystemTimeError> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?;
    let seconds = now.as_secs() as i64;
    let millis = now.subsec_millis();
    let datetime = chrono_from_unix(seconds);
    Ok(format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        datetime.year, datetime.month, datetime.day, datetime.hour, datetime.minute, datetime.second, millis
    ))
}

fn compact_timestamp_for_id() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs().to_string()
}

fn timestamp_nanos() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()
}

fn chrono_like_iso_check(value: &str) -> Result<(), ()> {
    if value.len() < 10 {
        return Err(());
    }
    let bytes = value.as_bytes();
    if bytes.get(4) != Some(&b'-') || bytes.get(7) != Some(&b'-') {
        return Err(());
    }
    Ok(())
}

struct BrokenDownTime {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

fn chrono_from_unix(seconds: i64) -> BrokenDownTime {
    let days = seconds.div_euclid(86_400);
    let secs_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    BrokenDownTime {
        year,
        month,
        day,
        hour: (secs_of_day / 3_600) as u32,
        minute: ((secs_of_day % 3_600) / 60) as u32,
        second: (secs_of_day % 60) as u32,
    }
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month as u32, day as u32)
}

fn error_with_code(code: &'static str, message: String, details: Option<Value>) -> CommandError {
    CommandError { code, message, details }
}

fn structured_error_string(error: CommandError) -> String {
    serde_json::to_string(&StructuredError {
        code: error.code,
        message: error.message,
        details: error.details,
    })
    .unwrap_or_else(|_| "{\"code\":\"serialization_failed\",\"message\":\"Erro ao executar operacao.\"}".to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::thread;

    fn unique_temp_dir(name: &str) -> PathBuf {
        let mut path = env::temp_dir();
        path.push(format!("{}-{}", name, timestamp_nanos()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn sample_paths(root: &Path) -> ResolvedPaths {
        let registry_dir = root.join(REGISTRY_DIR_NAME);
        ResolvedPaths {
            repo_root: root.to_path_buf(),
            cli_script: root.join("cli.mjs"),
            contract_path: root.join("license-contract.json"),
            base_dir: root.to_path_buf(),
            private_key_path: root.join("private_key").join("private_key.pem"),
            issued_dir: root.join("issued"),
            registry_dir: registry_dir.clone(),
            registry_file_path: registry_dir.join(REGISTRY_FILE_NAME),
            registry_backup_file_path: registry_dir.join(REGISTRY_BACKUP_FILE_NAME),
        }
    }

    fn sample_record(hash: &str) -> CatalogRecord {
        CatalogRecord {
            license_id: "PI-0001".to_string(),
            customer_name: "Cliente Teste".to_string(),
            email: Some("cliente@teste.com".to_string()),
            plan: "annual".to_string(),
            expiration_date: "2027-04-01T00:00:00.000Z".to_string(),
            issued_at: "2026-04-01T00:00:00.000Z".to_string(),
            license_hash: hash.to_string(),
            license_json: "{\"payload\":{}}".to_string(),
            license_preview: None,
            schema_version: None,
            notes: Some("obs".to_string()),
            created_at: "2026-04-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn dedupe_detects_existing_license_hash() {
        let root = unique_temp_dir("license-registry-dedupe");
        let file = root.join(REGISTRY_FILE_NAME);
        let record = sample_record("abc123");
        fs::write(&file, format!("{}
", serde_json::to_string(&record).unwrap())).unwrap();

        let exists = registry_contains_license_hash(&file, "abc123").unwrap();
        let missing = registry_contains_license_hash(&file, "zzz999").unwrap();

        assert!(exists);
        assert!(!missing);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn backup_rotation_moves_previous_backups() {
        let root = unique_temp_dir("license-registry-backup");
        let file = root.join(REGISTRY_FILE_NAME);
        let backup_1 = root.join(REGISTRY_BACKUP_FILE_NAME);
        let backup_2 = root.join("license-catalog.backup.2.jsonl");
        let backup_3 = root.join("license-catalog.backup.3.jsonl");

        fs::write(&file, vec![b'a'; (REGISTRY_BACKUP_THRESHOLD_BYTES + 1024) as usize]).unwrap();
        fs::write(&backup_1, "backup-1").unwrap();
        fs::write(&backup_2, "backup-2").unwrap();

        rotate_registry_backups(&file, &backup_1);

        assert_eq!(fs::read_to_string(&backup_2).unwrap(), "backup-1");
        assert_eq!(fs::read_to_string(&backup_3).unwrap(), "backup-2");
        assert_eq!(fs::metadata(&backup_1).unwrap().len(), REGISTRY_BACKUP_THRESHOLD_BYTES + 1024);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persist_catalog_record_sets_schema_version_and_preview() {
        let root = unique_temp_dir("license-registry-schema");
        let paths = sample_paths(&root);
        let mut record = sample_record("schema-hash");

        persist_catalog_record(&paths, &mut record).unwrap();

        let saved = fs::read_to_string(&paths.registry_file_path).unwrap();
        let parsed: Value = serde_json::from_str(saved.lines().next().unwrap()).unwrap();

        assert_eq!(parsed.get("schemaVersion").and_then(Value::as_u64), Some(1));
        assert_eq!(
            parsed
                .get("licensePreview")
                .and_then(|value| value.get("licenseId"))
                .and_then(Value::as_str),
            Some("PI-0001")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_catalog_records_reads_jsonl_line_by_line_and_supports_legacy_records() {
        let root = unique_temp_dir("license-registry-read");
        let file = root.join(REGISTRY_FILE_NAME);
        let legacy = serde_json::json!({
            "licenseId": "PI-LEGACY",
            "customerName": "Cliente Legado",
            "plan": "semiannual",
            "expirationDate": "2026-10-01T00:00:00.000Z",
            "issuedAt": "2026-04-01T00:00:00.000Z",
            "licenseHash": "legacy-hash",
            "licenseJson": "{\"payload\":{}}",
            "createdAt": "2026-04-01T00:00:00.000Z"
        });
        let current = serde_json::to_string(&sample_record("hash-2")).unwrap();
        fs::write(&file, format!("{}
{}
", legacy, current)).unwrap();

        let records = read_catalog_records(&file).unwrap();

        assert_eq!(records.len(), 2);
        assert!(records[0].get("schemaVersion").is_none());
        assert_eq!(records[1].get("licenseHash").and_then(Value::as_str), Some("hash-2"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn persist_catalog_record_allows_concurrent_writes_without_corruption() {
        let root = unique_temp_dir("license-registry-lock");
        let root_a = root.clone();
        let root_b = root.clone();

        let handle_a = thread::spawn(move || {
            let paths = sample_paths(&root_a);
            let mut record = sample_record("hash-a");
            record.license_id = "PI-A".to_string();
            persist_catalog_record(&paths, &mut record).unwrap();
        });

        let handle_b = thread::spawn(move || {
            let paths = sample_paths(&root_b);
            let mut record = sample_record("hash-b");
            record.license_id = "PI-B".to_string();
            persist_catalog_record(&paths, &mut record).unwrap();
        });

        handle_a.join().unwrap();
        handle_b.join().unwrap();

        let paths = sample_paths(&root);
        let records = read_catalog_records(&paths.registry_file_path).unwrap();
        assert_eq!(records.len(), 2);
        let hashes: Vec<&str> = records
            .iter()
            .filter_map(|value| value.get("licenseHash").and_then(Value::as_str))
            .collect();
        assert!(hashes.contains(&"hash-a"));
        assert!(hashes.contains(&"hash-b"));
        let _ = fs::remove_dir_all(root);
    }
}
