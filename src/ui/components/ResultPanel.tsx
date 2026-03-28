import { open, save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { useState } from "react";

import { buildExecutiveReportForScope } from "../../app/use-cases/build-executive-report-scope";
import { buildPowerBIPackage } from "../../core/export/export-power-bi-package";
import type { PresentationMode } from "../types/presentation-mode";
import type { ProcessResult } from "../types/process-result";

type ResultPanelProps = {
  result: ProcessResult | null;
  presentationMode: PresentationMode;
};

const POWER_BI_FILES = [
  "fact_tasks.csv",
  "fact_disciplines.csv",
  "fact_snapshots.csv",
  "fact_compensation.csv",
  "manifest.json",
];

const AVAILABLE_OUTPUTS = [
  "Relatório HTML",
  "CSV consolidado",
  "XML estruturado",
  "JSON analítico",
  "Pacote Power BI",
];

export function ResultPanel({ result, presentationMode }: ResultPanelProps) {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<string>("global");

  if (!result || presentationMode === "executive") {
    return null;
  }

  const currentResult = result;

  async function saveTextExport(defaultPath: string, name: string, content: string, extension: string): Promise<void> {
    try {
      const filePath = await save({
        title: name,
        defaultPath,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });

      if (!filePath) {
        return;
      }

      await writeTextFile(filePath, content);
      setExportMessage(`${name} salvo em ${filePath}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : `Não foi possível salvar ${name.toLowerCase()}.`);
    }
  }

  async function handleSaveExecutiveReport(): Promise<void> {
    const reportHtml =
      selectedScope === "global"
        ? buildExecutiveReportForScope(currentResult, { kind: "global" })
        : buildExecutiveReportForScope(currentResult, {
            kind: "discipline",
            outlineNumber: selectedScope,
          });

    await saveTextExport("relatório-executivo.html", "Relatório executivo", reportHtml, "html");
  }

  async function handleSavePowerBIPackage(): Promise<void> {
    try {
      const directoryPath = await open({
        directory: true,
        multiple: false,
        title: "Selecionar pasta para exportação Power BI",
      });

      if (!directoryPath || Array.isArray(directoryPath)) {
        return;
      }

      const powerBIPackage = buildPowerBIPackage({
        generatedAt: currentResult.generatedAt,
        project: currentResult.model,
        insights: currentResult.insights,
        score: currentResult.score,
        disciplines: currentResult.disciplines,
        weightModel: currentResult.weightModel,
        compensationAnalysis: currentResult.compensationAnalysis,
        compensationByDiscipline: currentResult.compensationByDiscipline,
        scheduleStatus: currentResult.scheduleStatus,
        gapVsCompensation: currentResult.gapVsCompensation,
        comparison: currentResult.comparison,
      });

      for (const file of powerBIPackage.files) {
        await writeTextFile(`${directoryPath}\\${file.fileName}`, file.content);
      }

      setExportMessage(`Pacote Power BI salvo em ${directoryPath}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Não foi possível salvar o pacote Power BI.");
    }
  }

  return (
    <section className="panel-card compact export-panel">
      <div className="panel-header export-panel-header">
        <div>
          <p className="panel-kicker">Saída técnica</p>
          <h2 className="panel-title">Exportação externa</h2>
        </div>
        <span className="comparison-chip">
          <strong>Projeto processado</strong> {currentResult.model.name}
        </span>
      </div>

      <div className="export-sections-grid">
        <article className="export-section-card">
          <p className="panel-kicker">Entrada aceita</p>
          <h3 className="support-chart-title">Arquivo de origem</h3>
          <div className="export-chip-list">
            <span className="export-chip">
              <strong>.mpp</strong>
            </span>
          </div>
        </article>

        <article className="export-section-card">
          <p className="panel-kicker">Saídas disponíveis</p>
          <h3 className="support-chart-title">Formatos gerados</h3>
          <div className="export-chip-list">
            {AVAILABLE_OUTPUTS.map((output) => (
              <span key={output} className="export-chip">
                {output}
              </span>
            ))}
          </div>
        </article>

        <article className="export-section-card export-section-card-wide">
          <p className="panel-kicker">Pacote Power BI</p>
          <h3 className="support-chart-title">Arquivos analíticos</h3>
          <ul className="clean-list export-file-list">
            {POWER_BI_FILES.map((fileName) => (
              <li key={fileName}>
                <code>{fileName}</code>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="metrics-grid export-summary-grid">
        <div className="metric-card">
          <span className="metric-label">Projeto processado</span>
          <strong>{currentResult.model.name}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Escopo do relatório</span>
          <strong>{selectedScope === "global" ? "Projeto completo" : "Disciplina selecionada"}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Gerado em</span>
          <strong>{new Date(currentResult.generatedAt).toLocaleDateString("pt-BR")}</strong>
        </div>
      </div>

      <section className="export-actions-card">
        <div className="panel-header" style={{ marginBottom: 14 }}>
          <div>
            <p className="panel-kicker">Relatório executivo</p>
            <h3 className="support-chart-title">Escolha a área e gere o HTML</h3>
          </div>
        </div>

        <div className="form-row export-form-row">
          <label htmlFor="executive-report-scope" className="metric-label">
            Área do relatório
          </label>
          <select
            id="executive-report-scope"
            className="app-select"
            value={selectedScope}
            onChange={(event) => setSelectedScope(event.target.value)}
          >
            <option value="global">Projeto completo</option>
            {currentResult.disciplines.map((discipline) => (
              <option key={discipline.outlineNumber} value={discipline.outlineNumber}>
                {discipline.name}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-button" onClick={() => void handleSaveExecutiveReport()}>
            Gerar relatório executivo
          </button>
        </div>
      </section>

      <section className="export-actions-card">
        <div className="panel-header" style={{ marginBottom: 14 }}>
          <div>
            <p className="panel-kicker">Exportação técnica</p>
            <h3 className="support-chart-title">Arquivos para uso externo</h3>
          </div>
        </div>

        <div className="form-row export-actions-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveTextExport("base-analitica-completa.csv", "CSV completo", currentResult.csv, "csv")}
          >
            Exportar CSV completo
          </button>
          <button type="button" className="secondary-button" onClick={() => void handleSavePowerBIPackage()}>
            Exportar pacote Power BI
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveTextExport("cronograma-estruturado.xml", "XML estruturado", currentResult.structuredXml, "xml")}
          >
            Exportar XML estruturado
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveTextExport("cronograma-analítico.json", "JSON analítico", currentResult.json, "json")}
          >
            Exportar JSON analítico
          </button>
        </div>
      </section>

      {exportMessage ? (
        <p className="app-message info" style={{ marginTop: 16 }}>
          {exportMessage}
        </p>
      ) : null}
    </section>
  );
}
