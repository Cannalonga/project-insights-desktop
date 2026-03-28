use crate::logger::append_processing_log_line;
use quick_xml::events::Event;
use quick_xml::Reader;
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

#[tauri::command]
pub fn convert_mpp_to_mspdi(app: AppHandle, input_path: String) -> Result<String, String> {
    let _ = append_processing_log_line(
        &app,
        &format!(
            "{{\"timestamp\":\"{}\",\"event\":\"mpp_conversion_started\",\"filePath\":{}}}",
            current_timestamp(),
            json_string(&input_path)
        ),
    );

    if input_path.trim().is_empty() {
        return Err("Arquivo .mpp invalido ou vazio.".into());
    }

    let input = PathBuf::from(&input_path);
    validate_input_mpp_file(&input)?;

    let java_bin = resolve_java_bin(&app)?;
    let converter_jar = resolve_converter_jar(&app)?;
    let temp_xml_path = create_temp_xml_path()?;

    let conversion_started_at = SystemTime::now();
    let execution_result = run_conversion(
        &java_bin,
        &converter_jar,
        &input,
        &temp_xml_path,
        CONVERTER_TIMEOUT,
    );

    let result = match execution_result {
        Ok(output) => validate_and_read_xml(&temp_xml_path, output),
        Err(error) => Err(error),
    };

    if let Err(cleanup_error) = fs::remove_file(&temp_xml_path) {
        if cleanup_error.kind() != std::io::ErrorKind::NotFound {
            eprintln!(
                "[convert_mpp_to_mspdi] failed to cleanup temp xml {}: {}",
                temp_xml_path.display(),
                cleanup_error
            );
        }
    }

    let elapsed_ms = conversion_started_at.elapsed().unwrap_or_default().as_millis();
    match &result {
        Ok(xml) => {
            let _ = append_processing_log_line(
                &app,
                &format!(
                    "{{\"timestamp\":\"{}\",\"event\":\"mpp_conversion_completed\",\"filePath\":{},\"xmlLength\":{},\"durationMs\":{}}}",
                    current_timestamp(),
                    json_string(&input_path),
                    xml.len(),
                    elapsed_ms
                ),
            );
        }
        Err(error) => {
            let _ = append_processing_log_line(
                &app,
                &format!(
                    "{{\"timestamp\":\"{}\",\"event\":\"mpp_conversion_failed\",\"filePath\":{},\"durationMs\":{},\"message\":{}}}",
                    current_timestamp(),
                    json_string(&input_path),
                    elapsed_ms,
                    json_string(error)
                ),
            );
        }
    }

    result
}

fn run_conversion(
    java_bin: &Path,
    converter_jar: &Path,
    input_path: &Path,
    output_path: &Path,
    timeout: Duration,
) -> Result<std::process::Output, String> {
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
        .map_err(|_| "Nao foi possivel iniciar a conversao segura do arquivo .mpp.".to_string())?;

    let start = SystemTime::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|_| "Nao foi possivel concluir a conversao segura do arquivo .mpp.".to_string())?;
                log_process_output(&output.status, &output.stdout, &output.stderr);
                if !output.status.success() {
                    return Err("Falha ao converter o arquivo .mpp para o formato interno seguro.".to_string());
                }
                return Ok(output);
            }
            Ok(None) => {
                if start.elapsed().unwrap_or_default() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("O tempo limite de conversao segura do arquivo .mpp foi excedido.".to_string());
                }
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Falha ao aguardar o processo de conversao segura: {error}"));
            }
        }
    }
}

fn validate_and_read_xml(
    temp_xml_path: &Path,
    output: std::process::Output,
) -> Result<String, String> {
    if !temp_xml_path.exists() || !temp_xml_path.is_file() {
        return Err("A conversao segura do arquivo .mpp nao produziu uma saida XML valida.".into());
    }

    let metadata = fs::metadata(temp_xml_path)
        .map_err(|_| "Nao foi possivel validar o XML convertido.".to_string())?;
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
        if jar.exists() && jar.is_file() {
            return Ok(jar);
        }
    }

    if let Some(resource_path) = app.path_resolver().resolve_resource(CONVERTER_RELATIVE_PATH) {
        if resource_path.exists() && resource_path.is_file() {
            return Ok(resource_path);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_resource_path = manifest_dir.join("resources").join("mpp-converter").join("mpp-converter.jar");
    if dev_resource_path.exists() && dev_resource_path.is_file() {
        return Ok(dev_resource_path);
    }

    Err(format!(
        "MPP converter JAR not found. Expected resource at {}",
        CONVERTER_RELATIVE_PATH
    ))
}

fn resolve_java_bin(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("CANNACONVERTER_JAVA_BIN") {
        let java_bin = PathBuf::from(path);
        if java_bin.exists() && java_bin.is_file() {
            return Ok(java_bin);
        }
    }

    if let Some(java_resource) = app
        .path_resolver()
        .resolve_resource("mpp-converter/runtime/bin/java.exe")
    {
        if java_resource.exists() && java_resource.is_file() {
            return Ok(java_resource);
        }
    }

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

fn log_process_output(status: &ExitStatus, stdout: &[u8], stderr: &[u8]) {
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
}

fn current_timestamp() -> String {
    format!("{:?}", SystemTime::now())
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"<serialization-error>\"".to_string())
}
