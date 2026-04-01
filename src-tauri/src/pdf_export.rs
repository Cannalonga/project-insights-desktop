use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const EDGE_BROWSER_NAME: &str = "Microsoft Edge";
const CHROME_BROWSER_NAME: &str = "Google Chrome";

struct BrowserCandidate {
    name: &'static str,
    executable_path: PathBuf,
}

fn windows_path_candidates(env_key: &str, relative_path: &str) -> Vec<PathBuf> {
    env::var_os(env_key)
        .map(PathBuf::from)
        .map(|base| vec![base.join(relative_path)])
        .unwrap_or_default()
}

fn collect_browser_candidates() -> Vec<BrowserCandidate> {
    let mut candidates = Vec::new();

    let edge_paths = [
        windows_path_candidates("ProgramFiles(x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
        windows_path_candidates("ProgramFiles", "Microsoft\\Edge\\Application\\msedge.exe"),
        windows_path_candidates("LocalAppData", "Microsoft\\Edge\\Application\\msedge.exe"),
    ]
    .concat();

    for path in edge_paths {
        candidates.push(BrowserCandidate {
            name: EDGE_BROWSER_NAME,
            executable_path: path,
        });
    }

    let chrome_paths = [
        windows_path_candidates("ProgramFiles", "Google\\Chrome\\Application\\chrome.exe"),
        windows_path_candidates("ProgramFiles(x86)", "Google\\Chrome\\Application\\chrome.exe"),
        windows_path_candidates("LocalAppData", "Google\\Chrome\\Application\\chrome.exe"),
    ]
    .concat();

    for path in chrome_paths {
        candidates.push(BrowserCandidate {
            name: CHROME_BROWSER_NAME,
            executable_path: path,
        });
    }

    candidates
}

fn strip_windows_extended_prefix(value: String) -> String {
    value.strip_prefix(r"\\?\")
        .map(|stripped| stripped.to_string())
        .unwrap_or(value)
}

fn normalize_windows_path(path: &Path) -> Result<String, String> {
    let resolved = if path.exists() {
        fs::canonicalize(path).map_err(|error| format!("failed to canonicalize path: {error}"))?
    } else {
        path.to_path_buf()
    };

    Ok(strip_windows_extended_prefix(
        resolved.to_string_lossy().into_owned(),
    ))
}

fn create_temp_html_path() -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    env::temp_dir().join(format!("project-insights-executive-report-{now}.html"))
}

fn run_browser_pdf_export(
    browser: &BrowserCandidate,
    html_path: &Path,
    output_path: &Path,
) -> Result<(), String> {
    let browser_path = normalize_windows_path(&browser.executable_path)?;
    let html_argument = normalize_windows_path(html_path)?;
    let pdf_argument = normalize_windows_path(output_path)?;

    let output = Command::new(&browser_path)
        .arg("--headless")
        .arg("--disable-gpu")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-extensions")
        .arg("--allow-file-access-from-files")
        .arg("--no-pdf-header-footer")
        .arg(format!("--print-to-pdf={pdf_argument}"))
        .arg(html_argument)
        .output()
        .map_err(|error| format!("failed to launch {}: {error}", browser.name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("process exited with status {}", output.status)
        };

        return Err(format!("{} failed to generate the PDF: {}", browser.name, detail));
    }

    if !output_path.exists() {
        return Err(format!(
            "{} finished without creating the expected PDF file",
            browser.name
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn export_executive_pdf(html_content: String, output_path: String) -> Result<(), String> {
    let output_path_buf = PathBuf::from(output_path.trim());
    if output_path_buf.as_os_str().is_empty() {
        return Err("Nao foi possivel resolver o caminho de saida do PDF.".to_string());
    }

    if let Some(parent_dir) = output_path_buf.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|error| format!("failed to create PDF output directory: {error}"))?;
    }

    let temp_html_path = create_temp_html_path();
    fs::write(&temp_html_path, html_content)
        .map_err(|error| format!("failed to write temporary executive report HTML: {error}"))?;

    if output_path_buf.exists() {
        fs::remove_file(&output_path_buf)
            .map_err(|error| format!("failed to replace existing PDF file: {error}"))?;
    }

    let candidates = collect_browser_candidates();
    let mut installed_candidates = Vec::new();
    let mut errors = Vec::new();

    for candidate in candidates {
        if !candidate.executable_path.exists() {
            continue;
        }

        installed_candidates.push(candidate.name.to_string());

        match run_browser_pdf_export(&candidate, &temp_html_path, &output_path_buf) {
            Ok(()) => {
                let _ = fs::remove_file(&temp_html_path);
                return Ok(());
            }
            Err(error) => errors.push(error),
        }
    }

    let _ = fs::remove_file(&temp_html_path);

    if installed_candidates.is_empty() {
        return Err(
            "Nao foi possivel gerar o PDF automaticamente. O app tentou Microsoft Edge e Google Chrome, mas nenhum navegador suportado foi encontrado neste Windows."
                .to_string(),
        );
    }

    Err(format!(
        "Nao foi possivel gerar o PDF automaticamente. O app tentou {}. Detalhes: {}",
        installed_candidates.join(" e "),
        errors.join(" | ")
    ))
}


