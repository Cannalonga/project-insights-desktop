import { useMemo, useState } from "react";

import { ComparisonPanel } from "./components/ComparisonPanel";
import { FilePicker } from "./components/FilePicker";
import { InsightsPanel } from "./components/InsightsPanel";
import { OperationalPanel } from "./components/OperationalPanel";
import { ResultPanel } from "./components/ResultPanel";
import { buildDecisionActions } from "./decision/build-decision-actions";
import {
  buildDecisionNarrative,
  type DecisionActionWithNarrative,
} from "./decision/build-decision-narrative";
import { useProcessMPP } from "./hooks/use-process-mpp";
import { LicenseBanner } from "./license/LicenseBanner";
import { LicensePanel } from "./license/LicensePanel";
import { useLicense } from "./license/use-license";
import type { PresentationMode } from "./types/presentation-mode";

function getExecutiveHeadline(status: string | undefined): string {
  const normalized = status?.toUpperCase() ?? "";

  if (normalized === "ATRASADO" || normalized === "CRITICAL" || normalized === "LOW") {
    return "PROJETO EM RISCO";
  }

  if (normalized === "ATENCAO" || normalized === "ATENÇÃO" || normalized === "MODERATE") {
    return "PROJETO SOB PRESSÃO";
  }

  return "PROJETO SOB CONTROLE";
}

export function App() {
  const {
    result,
    loading,
    error,
    processingMessage,
    slowProcessingMessage,
    analysisMode,
    setAnalysisMode,
    processFile,
    processComparisonFiles,
    reportError,
  } = useProcessMPP();
  const {
    license,
    loading: licenseLoading,
    importing: licenseImporting,
    exportingLogs: licenseExportingLogs,
    notice,
    applyLicenseText,
    exportLogs,
    openBuyLicense,
  } = useLicense();
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("complete");
  const isExecutiveMode = presentationMode === "executive";

  const decisionActions = useMemo<DecisionActionWithNarrative[]>(
    () =>
      result
        ? buildDecisionActions({
            project: result.model,
            compensationAnalysis: result.compensationAnalysis,
            disciplines: result.disciplines,
            weightModel: result.weightModel,
            analysisReliability: result.analysisReliability,
            scheduleStatus: result.scheduleStatus,
            executiveAlerts: result.executiveAlerts,
          }).map((action) => ({
            ...action,
            narrative: buildDecisionNarrative(action),
          }))
        : [],
    [result],
  );

  const effectiveAnalysisMode = result?.analysisMode ?? analysisMode;
  const executiveHeadline = getExecutiveHeadline(result?.scheduleStatus?.status ?? result?.score?.status);
  const executiveProblem =
    decisionActions[0]?.narrative.headline ??
    result?.executiveAlerts?.[0]?.message ??
    result?.score?.summaryMessage ??
    result?.scheduleStatus?.explanation ??
    "Sem leitura consolidada disponível.";

  return (
    <main className="app-shell">
      <LicenseBanner license={license} loading={licenseLoading} />

      <section className="app-hero">
        <div>
          <p className="eyebrow">Controle operacional de cronograma</p>
          <h1>Project Insights</h1>
          <p className="app-subtitle">
            Converta cronogramas em leitura executiva clara, com foco em prazo, progresso, confiabilidade e pontos de
            ação imediata.
          </p>
        </div>

        <div className="hero-actions">
          <FilePicker
            loading={loading}
            mode={analysisMode}
            onModeChange={setAnalysisMode}
            processFile={processFile}
            processComparisonFiles={processComparisonFiles}
            reportError={reportError}
          />
          <span className="hero-status">
            {result
              ? effectiveAnalysisMode === "comparison"
                ? `Comparação pronta para ${(result.versionComparison?.currentFileName ?? result.model.name) || "projeto carregado"}`
                : `Leitura pronta para ${result.model.name || "projeto carregado"}`
              : analysisMode === "comparison"
                ? "Selecione a versão base e a versão atual do mesmo projeto"
                : "Selecione um arquivo MPP ou XML"}
          </span>
        </div>

        <LicensePanel
          license={license}
          loading={licenseLoading}
          importing={licenseImporting}
          exportingLogs={licenseExportingLogs}
          onApplyLicenseText={applyLicenseText}
          onExportLogs={exportLogs}
        />

        <div className="presentation-mode-switch">
          <span className="metric-label">Visão do Projeto</span>
          <div className="segmented-control" role="tablist" aria-label="Visão do Projeto">
            <button
              type="button"
              className={`segmented-option ${presentationMode === "complete" ? "active" : ""}`}
              onClick={() => setPresentationMode("complete")}
            >
              Análise Completa
            </button>
            <button
              type="button"
              className={`segmented-option ${presentationMode === "executive" ? "active" : ""}`}
              onClick={() => setPresentationMode("executive")}
            >
              Visão Executiva
            </button>
          </div>
        </div>

        {isExecutiveMode && result ? (
          <section className="executive-hero-banner">
            <p className="executive-hero-kicker">{executiveHeadline}</p>
            <div className="executive-hero-grid">
              <div>
                <h2>{executiveHeadline}</h2>
                <p>{executiveProblem}</p>
              </div>
              <div className="executive-hero-metrics">
                <div className="executive-hero-metric">
                  <span>Progresso do projeto</span>
                  <strong>
                    {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
                      result.weightModel.progressWeightedPercent,
                    )}
                    %
                  </strong>
                </div>
                <div className="executive-hero-metric">
                  <span>Problema principal</span>
                  <strong>{decisionActions[0]?.narrative.shortLabel ?? result.scheduleStatus?.status ?? result.score.status.toUpperCase()}</strong>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </section>

      {loading ? (
        <div className="app-message info">
          <div className="processing-status">
            <span className="processing-spinner" aria-hidden="true" />
            <strong>{processingMessage ?? "Processando arquivo..."}</strong>
          </div>
          <p className="app-message-detail">
            {slowProcessingMessage ?? "Projetos maiores podem levar mais tempo para análise. Aguarde a conclusão do processamento."}
          </p>
        </div>
      ) : null}
      {notice ? <p className="app-message info">{notice}</p> : null}
      {error ? <p className="app-message error">{error}</p> : null}

      <div className="dashboard-grid">
        <OperationalPanel
          presentationMode={presentationMode}
          score={result?.score ?? null}
          analysisReliability={result?.analysisReliability ?? null}
          scheduleStatus={result?.scheduleStatus ?? null}
          gapVsCompensation={effectiveAnalysisMode === "comparison" ? result?.gapVsCompensation ?? null : null}
          versionComparison={effectiveAnalysisMode === "comparison" ? result?.versionComparison ?? null : null}
          sCurve={result?.sCurve ?? null}
          decisionActions={decisionActions}
          license={license}
          onRequestLicense={async () => {
            window.dispatchEvent(new CustomEvent("project-insights:open-license-panel"));
          }}
          onOpenBuyLicense={openBuyLicense}
        />
        <ComparisonPanel
          comparison={effectiveAnalysisMode === "comparison" ? result?.versionComparison ?? null : null}
          license={license}
          onRequestLicense={async () => {
            window.dispatchEvent(new CustomEvent("project-insights:open-license-panel"));
          }}
          onOpenBuyLicense={openBuyLicense}
        />
        <InsightsPanel
          presentationMode={presentationMode}
          project={result?.model ?? null}
          disciplines={result?.disciplines ?? []}
          compensationAnalysis={result?.compensationAnalysis ?? null}
          compensationByDiscipline={result?.compensationByDiscipline ?? []}
          weightModel={result?.weightModel ?? null}
          executiveAlerts={result?.executiveAlerts ?? []}
          decisionActions={decisionActions}
          license={license}
          onRequestLicense={async () => {
            window.dispatchEvent(new CustomEvent("project-insights:open-license-panel"));
          }}
          onOpenBuyLicense={openBuyLicense}
        />
        <ResultPanel
          result={result}
          presentationMode={presentationMode}
          license={license}
          onRequestLicense={async () => {
            window.dispatchEvent(new CustomEvent("project-insights:open-license-panel"));
          }}
          onOpenBuyLicense={openBuyLicense}
        />
      </div>
    </main>
  );
}
