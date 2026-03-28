use crate::logger::append_processing_log_line;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const CONVERTER_TIMEOUT: Duration = Duration::from_secs(120);
const CONVERTER_RELATIVE_PATH: &str = "mpp-converter/mpp-converter.jar";
const MAX_INPUT_FILE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_XML_OUTPUT_BYTES: u64 = 25 * 1024 * 1024;
const OLE_SIGNATURE: [u8; 8] = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
const JAVA_RELATIVE_PATH: &str = "mpp-converter/runtime/bin/java.exe";

#[tauri::command]
pub fn convert_mpp_to_mspdi(app: AppHandle, input_path: String) -> Result<String, String> {
    log_runtime_context(&app, &input_path);
    log_processing_event(
        &app,
        "info",
        "mpp_conversion_started",
        json!({
            "filePath": input_path,
        }),
    );

    if input_path.trim().is_empty() {
        return Err("Arquivo .mpp invalido ou vazio.".into());
    }

    let input = PathBuf::from(&input_path);
    validate_input_mpp_file(&input)?;

    let java_bin = resolve_java_bin(&app)?;
    let converter_jar = resolve_converter_jar(&app)?;
    let temp_xml_path = create_temp_xml_path()?;
    log_temp_xml_plan(&app, &temp_xml_path);

    let conversion_started_at = SystemTime::now();
    let execution_result = run_conversion(
        &app,
        &java_bin,
        &converter_jar,
        &input,
        &temp_xml_path,
        CONVERTER_TIMEOUT,
    );

    let result = match execution_result {
        Ok(output) => validate_and_read_xml(&app, &temp_xml_path, output),
        Err(error) => Err(error),
    };

    log_temp_xml_state(&app, "temp_xml_before_cleanup", &temp_xml_path);
    cleanup_temp_xml(&app, &temp_xml_path);

    let elapsed_ms = conversion_started_at.elapsed().unwrap_or_default().as_millis();
    match &result {
        Ok(xml) => {
            log_processing_event(
                &app,
                "info",
                "mpp_conversion_completed",
                json!({
                    "filePath": input_path,
                    "xmlLength": xml.len(),
                    "durationMs": elapsed_ms,
                }),
            );
        }
        Err(error) => {
            log_processing_event(
                &app,
                "error",
                "mpp_conversion_failed",
                json!({
                    "filePath": input_path,
                    "durationMs": elapsed_ms,
                    "message": error,
                }),
            );
        }
    }

    result
}

fn run_conversion(
    app: &AppHandle,
    java_bin: &Path,
    converter_jar: &Path,
    input_path: &Path,
    output_path: &Path,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let args = vec![
        "-jar".to_string(),
        converter_jar.display().to_string(),
        "--input".to_string(),
        input_path.display().to_string(),
        "--output".to_string(),
        output_path.display().to_string(),
    ];
    log_processing_event(
        app,
        "info",
        "mpp_conversion_subprocess_spawn",
        json!({
            "command": java_bin.display().to_string(),
            "arguments": args,
            "timeoutMs": timeout.as_millis(),
        }),
    );

    let mut child = Command::new(java_bin)
        .arg("-jar")
        .arg(converter_jar)
        .arg("--input")
        .arg(input_path)
        .arg("--output")
        .arg(output_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| {
            log_processing_event(
                app,
                "error",
                "mpp_conversion_subprocess_spawn_failed",
                json!({
                    "command": java_bin.display().to_string(),
                    "message": error.to_string(),
                }),
            );
            "Nao foi possivel iniciar a conversao segura do arquivo .mpp.".to_string()
        })?;

    let start = SystemTime::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|error| {
                        log_processing_event(
                            app,
                            "error",
                            "mpp_conversion_subprocess_wait_failed",
                            json!({
                                "message": error.to_string(),
                            }),
                        );
                        "Nao foi possivel concluir a conversao segura do arquivo .mpp.".to_string()
                    })?;
                log_process_output(app, &output.status, &output.stdout, &output.stderr);
                if !output.status.success() {
                    return Err("Falha ao converter o arquivo .mpp para o formato interno seguro.".to_string());
                }
                return Ok(output);
            }
            Ok(None) => {
                if start.elapsed().unwrap_or_default() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    log_processing_event(
                        app,
                        "error",
                        "mpp_conversion_subprocess_timeout",
                        json!({
                            "timeoutMs": timeout.as_millis(),
                            "command": java_bin.display().to_string(),
                            "outputPath": output_path.display().to_string(),
                        }),
                    );
                    return Err("O tempo limite de conversao segura do arquivo .mpp foi excedido.".to_string());
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                log_processing_event(
                    app,
                    "error",
                    "mpp_conversion_subprocess_wait_error",
                    json!({
                        "message": error.to_string(),
                    }),
                );
                return Err(format!("Falha ao aguardar o processo de conversao segura: {error}"));
            }
        }
    }
}

fn validate_and_read_xml(
    app: &AppHandle,
    temp_xml_path: &Path,
    output: std::process::Output,
) -> Result<String, String> {
    if !temp_xml_path.exists() || !temp_xml_path.is_file() {
        return Err("A conversao segura do arquivo .mpp nao produziu uma saida XML valida.".into());
    }

    let metadata = fs::metadata(temp_xml_path)
        .map_err(|_| "Nao foi possivel validar o XML convertido.".to_string())?;
    log_temp_xml_state_from_metadata(
        app,
        temp_xml_path,
        Some(&metadata),
        "temp_xml_after_subprocess",
    );
    if metadata.len() == 0 {
        return Err("O XML convertido esta vazio.".into());
    }
    if metadata.len() > MAX_XML_OUTPUT_BYTES {
        return Err("O XML convertido excede o limite seguro de processamento.".into());
    }

    let bytes = fs::read(temp_xml_path)
        .map_err(|_| "Nao foi possivel ler o XML convertido com seguranca.".to_string())?;

    let xml_content = String::from_utf8(bytes)
        .map_err(|_| "O XML convertido nao possui codificacao valida para processamento seguro.".to_string())?;
    if xml_content.trim().is_empty() {
        return Err("O XML convertido esta vazio.".into());
    }

    validate_xml_root(&xml_content)?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !stdout.trim().is_empty() {
        eprintln!("[convert_mpp_to_mspdi] converter stdout:\n{}", stdout);
    }

    eprintln!(
        "[convert_mpp_to_mspdi] xml validated successfully, length={}",
        xml_content.len()
    );

    Ok(xml_content)
}

fn validate_xml_root(xml_content: &str) -> Result<(), String> {
    let normalized = xml_content.to_ascii_lowercase();
    if normalized.contains("<!doctype") || normalized.contains("<!entity") || normalized.contains("<!attlist") || normalized.contains("<!notation") {
        return Err("O XML convertido contem marcacao insegura e foi bloqueado.".into());
    }

    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(start)) | Ok(Event::Empty(start)) => {
                let root_name = String::from_utf8_lossy(start.local_name().as_ref()).to_string();
                if root_name == "Project" {
                    return Ok(());
                }
                return Err("O XML convertido nao possui a estrutura MSPDI esperada.".into());
            }
            Ok(Event::DocType(_)) => return Err("O XML convertido contem DTD e foi bloqueado.".into()),
            Ok(Event::Eof) => return Err("O XML convertido esta malformado.".into()),
            Ok(_) => {}
            Err(_) => return Err("O XML convertido esta malformado.".into()),
        }
        buffer.clear();
    }
}

fn validate_input_mpp_file(input: &Path) -> Result<(), String> {
    if !input.exists() || !input.is_file() {
        return Err("Arquivo .mpp invalido ou indisponivel.".into());
    }

    let extension = input
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default();
    if extension != "mpp" {
        return Err("A entrada aceita apenas arquivos .mpp.".into());
    }

    let metadata = fs::metadata(input).map_err(|_| "Nao foi possivel validar o arquivo .mpp.".to_string())?;
    if metadata.len() == 0 {
        return Err("Arquivo .mpp vazio ou corrompido.".into());
    }
    if metadata.len() > MAX_INPUT_FILE_BYTES {
        return Err("O arquivo .mpp excede o limite seguro de 25 MB.".into());
    }

    let bytes = fs::read(input).map_err(|_| "Nao foi possivel validar o conteudo do arquivo .mpp.".to_string())?;
    if bytes.len() < OLE_SIGNATURE.len() {
        return Err("Arquivo .mpp corrompido ou com formato invalido.".into());
    }

    if bytes[..OLE_SIGNATURE.len()] != OLE_SIGNATURE {
        return Err("Arquivo .mpp corrompido ou com formato invalido.".into());
    }

    Ok(())
}

fn resolve_converter_jar(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("CANNACONVERTER_MPP_CONVERTER_JAR") {
        let jar = PathBuf::from(path);
        if let Some(selected) = log_and_select_resource(app, "converterJar", "env", jar) {
            return Ok(selected);
        }
    }

    if let Some(resource_path) = app.path_resolver().resolve_resource(CONVERTER_RELATIVE_PATH) {
        if let Some(selected) = log_and_select_resource(
            app,
            "converterJar",
            "bundle-resource",
            resource_path,
        ) {
            return Ok(selected);
        }
    }

    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        let bundled_subdir = resource_dir.join("resources").join(CONVERTER_RELATIVE_PATH);
        if let Some(selected) = log_and_select_resource(
            app,
            "converterJar",
            "resource-dir-plus-resources",
            bundled_subdir,
        ) {
            return Ok(selected);
        }

        let bundled_direct = resource_dir.join(CONVERTER_RELATIVE_PATH);
        if let Some(selected) = log_and_select_resource(
            app,
            "converterJar",
            "resource-dir-direct",
            bundled_direct,
        ) {
            return Ok(selected);
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let exe_resources = exe_dir.join("resources").join(CONVERTER_RELATIVE_PATH);
            if let Some(selected) = log_and_select_resource(
                app,
                "converterJar",
                "exe-dir-plus-resources",
                exe_resources,
            ) {
                return Ok(selected);
            }

            let exe_direct = exe_dir.join(CONVERTER_RELATIVE_PATH);
            if let Some(selected) = log_and_select_resource(
                app,
                "converterJar",
                "exe-dir-direct",
                exe_direct,
            ) {
                return Ok(selected);
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_resource_path = manifest_dir.join("resources").join("mpp-converter").join("mpp-converter.jar");
    if let Some(selected) = log_and_select_resource(
        app,
        "converterJar",
        "dev-resource",
        dev_resource_path,
    ) {
        return Ok(selected);
    }

    log_processing_event(
        app,
        "error",
        "mpp_conversion_resource_missing",
        json!({
            "resource": "converterJar",
            "expectedRelativePath": CONVERTER_RELATIVE_PATH,
        }),
    );
    Err(format!(
        "MPP converter JAR not found. Expected resource at {}",
        CONVERTER_RELATIVE_PATH
    ))
}

fn resolve_java_bin(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("CANNACONVERTER_JAVA_BIN") {
        let java_bin = PathBuf::from(path);
        if let Some(selected) = log_and_select_resource(app, "javaBin", "env", java_bin) {
            return Ok(selected);
        }
    }

    if let Some(java_resource) = app.path_resolver().resolve_resource(JAVA_RELATIVE_PATH) {
        if let Some(selected) = log_and_select_resource(
            app,
            "javaBin",
            "bundle-resource",
            java_resource,
        ) {
            return Ok(selected);
        }
    }

    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        let bundled_subdir = resource_dir.join("resources").join(JAVA_RELATIVE_PATH);
        if let Some(selected) = log_and_select_resource(
            app,
            "javaBin",
            "resource-dir-plus-resources",
            bundled_subdir,
        ) {
            return Ok(selected);
        }

        let bundled_direct = resource_dir.join(JAVA_RELATIVE_PATH);
        if let Some(selected) = log_and_select_resource(
            app,
            "javaBin",
            "resource-dir-direct",
            bundled_direct,
        ) {
            return Ok(selected);
        }
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let exe_resources = exe_dir.join("resources").join(JAVA_RELATIVE_PATH);
            if let Some(selected) = log_and_select_resource(
                app,
                "javaBin",
                "exe-dir-plus-resources",
                exe_resources,
            ) {
                return Ok(selected);
            }

            let exe_direct = exe_dir.join(JAVA_RELATIVE_PATH);
            if let Some(selected) = log_and_select_resource(
                app,
                "javaBin",
                "exe-dir-direct",
                exe_direct,
            ) {
                return Ok(selected);
            }
        }
    }

    log_processing_event(
        app,
        "warn",
        "mpp_conversion_resource_selected",
        json!({
            "resource": "javaBin",
            "source": "path-fallback",
            "path": "java",
            "exists": serde_json::Value::Null,
        }),
    );
    Ok(PathBuf::from("java"))
}

fn create_temp_xml_path() -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to create temporary XML name: {error}"))?
        .as_millis();
    Ok(std::env::temp_dir().join(format!(
        "cannaconverter-mpp-{timestamp}.xml"
    )))
}

fn log_process_output(app: &AppHandle, status: &ExitStatus, stdout: &[u8], stderr: &[u8]) {
    eprintln!(
        "[convert_mpp_to_mspdi] converter exit code: {:?}",
        status.code()
    );

    let stdout_text = String::from_utf8_lossy(stdout);
    if !stdout_text.trim().is_empty() {
        eprintln!("[convert_mpp_to_mspdi] converter stdout:\n{}", stdout_text);
    }

    let stderr_text = String::from_utf8_lossy(stderr);
    if !stderr_text.trim().is_empty() {
        eprintln!("[convert_mpp_to_mspdi] converter stderr:\n{}", stderr_text);
    }

    log_processing_event(
        app,
        if status.success() { "info" } else { "error" },
        "mpp_conversion_subprocess_completed",
        json!({
            "exitCode": status.code(),
            "success": status.success(),
            "stdout": stdout_text.to_string(),
            "stderr": stderr_text.to_string(),
        }),
    );
}

fn current_timestamp() -> String {
    format!("{:?}", SystemTime::now())
}

fn log_runtime_context(app: &AppHandle, input_path: &str) {
    let package_info = app.package_info();
    let current_exe = std::env::current_exe()
        .ok()
        .map(|path| path.display().to_string());
    let current_dir = std::env::current_dir()
        .ok()
        .map(|path| path.display().to_string());
    let resource_dir = app
        .path_resolver()
        .resource_dir()
        .map(|path| path.display().to_string());
    let app_local_data_dir = app
        .path_resolver()
        .app_local_data_dir()
        .map(|path| path.display().to_string());
    let app_log_dir = app
        .path_resolver()
        .app_log_dir()
        .map(|path| path.display().to_string());

    log_processing_event(
        app,
        "info",
        "mpp_conversion_runtime_context",
        json!({
            "filePath": input_path,
            "mode": if cfg!(debug_assertions) { "dev" } else { "build" },
            "packageName": package_info.name.clone(),
            "packageVersion": package_info.version.to_string(),
            "manifestDir": env!("CARGO_MANIFEST_DIR"),
            "currentExe": current_exe,
            "currentDir": current_dir,
            "resourceDir": resource_dir,
            "appLocalDataDir": app_local_data_dir,
            "appLogDir": app_log_dir,
            "tempDir": std::env::temp_dir().display().to_string(),
        }),
    );
}

fn log_temp_xml_plan(app: &AppHandle, temp_xml_path: &Path) {
    let parent = temp_xml_path.parent().map(|path| path.to_path_buf());
    log_processing_event(
        app,
        "info",
        "temp_xml_path_resolved",
        json!({
            "tempXmlPath": temp_xml_path.display().to_string(),
            "tempXmlDir": parent.as_ref().map(|path| path.display().to_string()),
            "tempXmlDirExists": parent.as_ref().map(|path| path.exists()),
        }),
    );
}

fn log_temp_xml_state(app: &AppHandle, event: &str, path: &Path) {
    let metadata = fs::metadata(path).ok();
    log_processing_event(app, "info", event, temp_xml_payload(path, metadata.as_ref()));
}

fn log_temp_xml_state_from_metadata(
    app: &AppHandle,
    path: &Path,
    metadata: Option<&fs::Metadata>,
    event: &str,
) {
    eprintln!(
        "[convert_mpp_to_mspdi] {} path={} exists={} size={:?}",
        event,
        path.display(),
        path.exists(),
        metadata.map(|value| value.len())
    );
    log_processing_event(app, "info", event, temp_xml_payload(path, metadata));
}

fn cleanup_temp_xml(app: &AppHandle, temp_xml_path: &Path) {
    match fs::remove_file(temp_xml_path) {
        Ok(()) => {
            log_processing_event(
                app,
                "info",
                "temp_xml_cleanup_completed",
                json!({
                    "tempXmlPath": temp_xml_path.display().to_string(),
                    "existsAfterCleanup": temp_xml_path.exists(),
                }),
            );
        }
        Err(cleanup_error) => {
            if cleanup_error.kind() != std::io::ErrorKind::NotFound {
                eprintln!(
                    "[convert_mpp_to_mspdi] failed to cleanup temp xml {}: {}",
                    temp_xml_path.display(),
                    cleanup_error
                );
            }
            log_processing_event(
                app,
                if cleanup_error.kind() == std::io::ErrorKind::NotFound {
                    "info"
                } else {
                    "warn"
                },
                "temp_xml_cleanup_result",
                json!({
                    "tempXmlPath": temp_xml_path.display().to_string(),
                    "message": cleanup_error.to_string(),
                    "notFound": cleanup_error.kind() == std::io::ErrorKind::NotFound,
                }),
            );
        }
    }
}

fn log_processing_event(app: &AppHandle, level: &str, event: &str, payload: serde_json::Value) {
    let entry = json!({
        "timestamp": current_timestamp(),
        "level": level,
        "event": event,
        "payload": payload,
    });
    let serialized = serde_json::to_string(&entry)
        .unwrap_or_else(|_| format!("{{\"timestamp\":\"{}\",\"level\":\"error\",\"event\":\"log_serialization_failed\"}}", current_timestamp()));
    let _ = append_processing_log_line(app, &serialized);
}

fn log_and_select_resource(
    app: &AppHandle,
    resource: &str,
    source: &str,
    path: PathBuf,
) -> Option<PathBuf> {
    log_processing_event(
        app,
        "info",
        "mpp_conversion_resource_candidate",
        resource_candidate_payload(resource, source, &path),
    );

    if path.exists() && path.is_file() {
        log_processing_event(
            app,
            "info",
            "mpp_conversion_resource_selected",
            json!({
                "resource": resource,
                "source": source,
                "path": path.display().to_string(),
            }),
        );
        return Some(path);
    }

    None
}

fn resource_candidate_payload(resource: &str, source: &str, path: &Path) -> serde_json::Value {
    let metadata = fs::metadata(path).ok();
    json!({
        "resource": resource,
        "source": source,
        "path": path.display().to_string(),
        "exists": path.exists(),
        "isFile": path.is_file(),
        "sizeBytes": metadata.as_ref().map(|value| value.len()),
    })
}

fn temp_xml_payload(path: &Path, metadata: Option<&fs::Metadata>) -> serde_json::Value {
    json!({
        "tempXmlPath": path.display().to_string(),
        "exists": path.exists(),
        "isFile": path.is_file(),
        "sizeBytes": metadata.map(|value| value.len()),
    })
}
