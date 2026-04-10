import { open, save } from "@tauri-apps/api/dialog";
import { writeTextFile } from "@tauri-apps/api/fs";
import { useState } from "react";

import { buildExecutivePdfReportForScope } from "../../app/use-cases/build-executive-pdf-report-scope";
import { exportExecutivePdf } from "../../app/use-cases/export-executive-pdf";
import type { LicenseContextState } from "../../core/license/license-types";
import { buildPowerBIPackage } from "../../core/export/export-power-bi-package";
import { LicenseGate } from "../license/LicenseGate";
import { prepareTextExportContent } from "../export/prepare-text-export";
import type { PresentationMode } from "../types/presentation-mode";
import type { ProcessResult } from "../types/process-result";

type ResultPanelProps = {
  result: ProcessResult | null;
  presentationMode: PresentationMode;
  license: LicenseContextState;
  onRequestLicense: () => Promise<void>;
  onOpenBuyLicense: () => Promise<void>;
};

export function ResultPanel({
  result,
  presentationMode,
  license,
  onRequestLicense,
  onOpenBuyLicense,
}: ResultPanelProps) {
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

      await writeTextFile(filePath, prepareTextExportContent(content, extension));
      setExportMessage(`${name} salvo em ${filePath}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : `Nao foi possivel salvar ${name.toLowerCase()}.`);
    }
  }

  function resolveReportScope() {
    return selectedScope === "global"
      ? ({ kind: "global" } as const)
      : ({ kind: "discipline", outlineNumber: selectedScope } as const);
  }

  async function handleSaveExecutiveReportPdf(): Promise<void> {
    try {
      const filePath = await save({
        title: "Relatorio executivo (PDF)",
        defaultPath: "relatorio-executivo.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!filePath) {
        return;
      }

      const reportHtml = buildExecutivePdfReportForScope(currentResult, resolveReportScope());
      await exportExecutivePdf(reportHtml, filePath);
      setExportMessage(`Relatorio executivo (PDF) salvo em ${filePath}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Nao foi possivel gerar o relatorio executivo em PDF.");
    }
  }

  async function handleSavePowerBIPackage(): Promise<void> {
    try {
      const directoryPath = await open({
        directory: true,
        multiple: false,
        title: "Selecionar pasta para exportacao Power BI",
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
        analysisReliability: currentResult.analysisReliability,
        gapVsCompensation: currentResult.gapVsCompensation,
        comparison: currentResult.comparison,
      });

      for (const file of powerBIPackage.files) {
        await writeTextFile(`${directoryPath}\${file.fileName}`, prepareTextExportContent(file.content, file.fileName));
      }

      setExportMessage(`Pacote Power BI salvo em ${directoryPath}`);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Nao foi possivel salvar o pacote Power BI.");
    }
  }

  return (
    <section className="panel-card compact export-panel export-panel-clean">
      <div className="panel-header export-panel-header compact-header">
        <div>
          <p className="panel-kicker">Exportacoes</p>
          <h2 className="panel-title">Arquivos para uso externo</h2>
        </div>
        <span className="comparison-chip">
          <strong>Projeto</strong> {currentResult.model.name}
        </span>
      </div>

      <div className="metrics-grid export-summary-grid compact-summary-grid">
        <div className="metric-card">
          <span className="metric-label">Projeto</span>
          <strong>{currentResult.model.name}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Escopo</span>
          <strong>{selectedScope === "global" ? "Projeto completo" : "Disciplina selecionada"}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Gerado em</span>
          <strong>{new Date(currentResult.generatedAt).toLocaleDateString("pt-BR")}</strong>
        </div>
      </div>

      <section className="export-actions-card compact-actions-card">
        <div className="panel-header compact-header" style={{ marginBottom: 12 }}>
          <div>
            <p className="panel-kicker">Relatorio executivo</p>
            <h3 className="support-chart-title">Gerar o PDF</h3>
          </div>
        </div>

        <div className="form-row export-form-row">
          <label htmlFor="executive-report-scope" className="metric-label">
            Area do relatorio
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
          <LicenseGate
            feature="export_executive_report"
            license={license}
            onRequestLicense={onRequestLicense}
            onOpenBuyLicense={onOpenBuyLicense}
          >
            {({ run }) => (
              <button type="button" className="secondary-button" onClick={() => void run(handleSaveExecutiveReportPdf)}>
                Gerar relatorio executivo (PDF)
              </button>
            )}
          </LicenseGate>
        </div>
      </section>

      <section className="export-actions-card compact-actions-card">
        <div className="panel-header compact-header" style={{ marginBottom: 12 }}>
          <div>
            <p className="panel-kicker">Exportacoes uteis</p>
            <h3 className="support-chart-title">Arquivos para analise externa</h3>
          </div>
        </div>

        <div className="form-row export-actions-row">
          <LicenseGate
            feature="export_csv"
            license={license}
            onRequestLicense={onRequestLicense}
            onOpenBuyLicense={onOpenBuyLicense}
          >
            {({ run }) => (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void run(() => saveTextExport("base-analitica-completa.csv", "CSV completo", currentResult.csv, "csv"))}
              >
                Exportar CSV
              </button>
            )}
          </LicenseGate>

          <LicenseGate
            feature="export_machine_json"
            license={license}
            onRequestLicense={onRequestLicense}
            onOpenBuyLicense={onOpenBuyLicense}
          >
            {({ run }) => (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void run(() => saveTextExport("cronograma-analitico.json", "JSON analitico", currentResult.json, "json"))}
              >
                Exportar JSON
              </button>
            )}
          </LicenseGate>

          <LicenseGate
            feature="export_power_bi_package"
            license={license}
            onRequestLicense={onRequestLicense}
            onOpenBuyLicense={onOpenBuyLicense}
          >
            {({ run }) => (
              <button type="button" className="secondary-button" onClick={() => void run(handleSavePowerBIPackage)}>
                Exportar Power BI
              </button>
            )}
          </LicenseGate>
        </div>
      </section>

      {exportMessage ? (
        <p className="app-message info" style={{ marginTop: 8 }}>
          {exportMessage}
        </p>
      ) : null}
    </section>
  );
}
