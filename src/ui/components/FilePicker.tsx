import { open } from "@tauri-apps/api/dialog";
import { useEffect, useState } from "react";

import type { ProcessInput } from "../../app/use-cases/process-mpp";
import type { FileAnalysisMode } from "../hooks/use-process-mpp";

type FilePickerProps = {
  loading: boolean;
  mode: FileAnalysisMode;
  onModeChange: (mode: FileAnalysisMode) => void;
  processFile: (input: ProcessInput) => Promise<void>;
  processComparisonFiles: (baseFilePath: string, currentFilePath: string) => Promise<void>;
  reportError: (message: string) => void;
};

function getDisplayName(filePath: string | null): string {
  if (!filePath) {
    return "Nenhum arquivo selecionado";
  }

  return filePath.split(/\\|\//).pop() || filePath;
}

export function FilePicker({
  loading,
  mode,
  onModeChange,
  processFile,
  processComparisonFiles,
  reportError,
}: FilePickerProps) {
  const [baseFilePath, setBaseFilePath] = useState<string | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "single") {
      setBaseFilePath(null);
      setCurrentFilePath(null);
    }
  }, [mode]);

  async function selectProjectFile(): Promise<string | null> {
    const filePath = await open({
      multiple: false,
      filters: [{ name: "Project Files", extensions: ["mpp", "xml"] }],
    });

    if (!filePath || Array.isArray(filePath)) {
      return null;
    }

    return filePath;
  }

  async function handleSelectSingleFile(): Promise<void> {
    try {
      const filePath = await selectProjectFile();
      if (!filePath) {
        return;
      }

      console.log("SINGLE SELECTED:", filePath);
      await processFile({ filePath });
    } catch {
      reportError("Não foi possível selecionar ou abrir o arquivo agora.");
    }
  }

  async function handleSelectBaseFile(): Promise<void> {
    try {
      const filePath = await selectProjectFile();
      if (!filePath) {
        return;
      }

      console.log("BASE SELECTED:", filePath);
      setBaseFilePath(filePath);
    } catch {
      reportError("Não foi possível selecionar o arquivo base agora.");
    }
  }

  async function handleSelectCurrentFile(): Promise<void> {
    try {
      const filePath = await selectProjectFile();
      if (!filePath) {
        return;
      }

      console.log("CURRENT SELECTED:", filePath);
      setCurrentFilePath(filePath);
    } catch {
      reportError("Não foi possível selecionar o arquivo atual agora.");
    }
  }

  async function handleCompareFiles(): Promise<void> {
    if (!baseFilePath || !currentFilePath) {
      reportError("Selecione os arquivos base e atual antes de comparar.");
      return;
    }

    if (baseFilePath === currentFilePath) {
      reportError("Selecione dois arquivos diferentes para comparar as versões.");
      return;
    }

    try {
      await processComparisonFiles(baseFilePath, currentFilePath);
    } catch {
      reportError("Não foi possível processar a comparação agora.");
    }
  }

  return (
    <div>
      <div className="presentation-mode-switch" style={{ marginBottom: 14 }}>
        <span className="metric-label">Modo de entrada</span>
        <div className="segmented-control" role="tablist" aria-label="Modo de entrada">
          <button
            type="button"
            className={`segmented-option ${mode === "single" ? "active" : ""}`}
            onClick={() => onModeChange("single")}
            disabled={loading}
          >
            Análise simples
          </button>
          <button
            type="button"
            className={`segmented-option ${mode === "comparison" ? "active" : ""}`}
            onClick={() => onModeChange("comparison")}
            disabled={loading}
          >
            Comparar versões
          </button>
        </div>
      </div>

      {mode === "single" ? (
        <>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSelectSingleFile()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Processando..." : "Selecionar arquivo"}
          </button>
          <p className="muted-text" style={{ margin: "10px 0 0" }}>
            Selecione um cronograma para gerar a leitura do projeto.
          </p>
        </>
      ) : (
        <div className="comparison-picker-grid">
          <div className="comparison-picker-card">
            <span className="metric-label">Arquivo base</span>
            <strong>{getDisplayName(baseFilePath)}</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleSelectBaseFile()}
              disabled={loading}
            >
              Selecionar base
            </button>
          </div>

          <div className="comparison-picker-card">
            <span className="metric-label">Arquivo atual</span>
            <strong>{getDisplayName(currentFilePath)}</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleSelectCurrentFile()}
              disabled={loading}
            >
              Selecionar atual
            </button>
          </div>

          <div className="comparison-picker-card comparison-picker-action">
            <span className="metric-label">Comparação</span>
            <strong>Base x atual</strong>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleCompareFiles()}
              disabled={loading || !baseFilePath || !currentFilePath}
              aria-busy={loading}
            >
              {loading ? "Comparando..." : "Comparar arquivos"}
            </button>
          </div>

          <p className="muted-text" style={{ margin: "10px 0 0" }}>
            Selecione duas versões do mesmo projeto. A base representa a leitura anterior e o atual representa a versão mais recente.
          </p>
        </div>
      )}
    </div>
  );
}
