import type { ProjectComparison } from "../../app/history/snapshot-history";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectInsights } from "../insights/build-project-insights";

export type ProjectScoreStatus = "excelente" | "bom" | "atencao" | "critico";

export type ProjectScoreBreakdownItem = {
  id: string;
  label: string;
  penalty: number;
};

export type ProjectScore = {
  value: number;
  status: ProjectScoreStatus;
  breakdown: ProjectScoreBreakdownItem[];
  summaryMessage: string;
};

const ERROR_PENALTY_PER_ITEM = 10;
const ERROR_PENALTY_CAP = 30;
const WARNING_PENALTY_PER_ITEM = 2;
const WARNING_PENALTY_CAP = 20;
const MISSING_DATES_PENALTY_CAP = 12;
const MISSING_RESOURCES_PENALTY_CAP = 12;
const LOW_BASELINE_PENALTY = 6;
const LOW_PROGRESS_COVERAGE_PENALTY = 4;
const SCHEDULE_PERFORMANCE_ATTENTION_PENALTY = 8;
const SCHEDULE_PERFORMANCE_CRITICAL_PENALTY = 15;
const HISTORY_WARNING_INCREASE_PENALTY_CAP = 6;
const HISTORY_ERROR_INCREASE_PENALTY_CAP = 8;
const HISTORY_FINISH_SLIP_PENALTY_CAP = 6;
const HISTORY_PROGRESS_REGRESSION_PENALTY_CAP = 4;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function calculateCoveragePenalty(
  missingCount: number,
  totalCount: number,
  cap: number,
): number {
  if (totalCount === 0 || missingCount <= 0) {
    return 0;
  }

  return Math.min(cap, Math.ceil((missingCount / totalCount) * cap));
}

function getScoreStatus(value: number): ProjectScoreStatus {
  if (value >= 90) {
    return "excelente";
  }

  if (value >= 75) {
    return "bom";
  }

  if (value >= 50) {
    return "atencao";
  }

  return "critico";
}

function buildSummaryMessage(status: ProjectScoreStatus, breakdown: ProjectScoreBreakdownItem[]): string {
  if (breakdown.length === 0) {
    return "O cronograma apresenta saude geral alta nas regras atuais.";
  }

  const mainFactor = breakdown[0]?.label.toLowerCase() ?? "penalizacoes identificadas";

  if (status === "critico") {
    return `O cronograma esta em estado critico, com impacto principal em ${mainFactor}.`;
  }

  if (status === "atencao") {
    return `O cronograma exige atencao, principalmente por ${mainFactor}.`;
  }

  if (status === "bom") {
    return `O cronograma esta em bom estado, com pequenas restricoes ligadas a ${mainFactor}.`;
  }

  return "O cronograma apresenta saude geral alta nas regras atuais.";
}

export function buildProjectScore(
  diagnostics: Diagnostics,
  insights: ProjectInsights,
  comparison?: ProjectComparison,
): ProjectScore {
  const breakdown: ProjectScoreBreakdownItem[] = [];
  const totalTasks = insights.metrics.totalTasks;
  const progressCoverage = totalTasks === 0 ? 0 : Math.max(
    insights.metrics.tasksWithPercentComplete,
    insights.metrics.tasksWithActualDates,
  ) / totalTasks;

  const errorPenalty = Math.min(diagnostics.errors.length * ERROR_PENALTY_PER_ITEM, ERROR_PENALTY_CAP);
  if (errorPenalty > 0) {
    breakdown.push({
      id: "diagnostics-errors",
      label: "diagnostics errors",
      penalty: errorPenalty,
    });
  }

  const warningPenalty = Math.min(diagnostics.warnings.length * WARNING_PENALTY_PER_ITEM, WARNING_PENALTY_CAP);
  if (warningPenalty > 0) {
    breakdown.push({
      id: "diagnostics-warnings",
      label: "diagnostics warnings",
      penalty: warningPenalty,
    });
  }

  const missingDatesPenalty = calculateCoveragePenalty(
    insights.metrics.tasksWithoutDates,
    totalTasks,
    MISSING_DATES_PENALTY_CAP,
  );
  if (missingDatesPenalty > 0) {
    breakdown.push({
      id: "missing-valid-dates",
      label: "baixa cobertura de datas validas",
      penalty: missingDatesPenalty,
    });
  }

  const missingResourcesPenalty = calculateCoveragePenalty(
    insights.metrics.tasksWithoutResources,
    totalTasks,
    MISSING_RESOURCES_PENALTY_CAP,
  );
  if (missingResourcesPenalty > 0) {
    breakdown.push({
      id: "missing-resources",
      label: "baixa cobertura de recursos",
      penalty: missingResourcesPenalty,
    });
  }

  if (totalTasks > 0 && insights.metrics.tasksWithBaseline / totalTasks < 0.3) {
    breakdown.push({
      id: "low-baseline-coverage",
      label: "baixa cobertura de baseline",
      penalty: LOW_BASELINE_PENALTY,
    });
  }

  if (progressCoverage > 0 && progressCoverage < 0.3) {
    breakdown.push({
      id: "low-progress-coverage",
      label: "baixa cobertura de dados de progresso",
      penalty: LOW_PROGRESS_COVERAGE_PENALTY,
    });
  }

  if (insights.schedulePerformance?.status === "ATENCAO") {
    breakdown.push({
      id: "schedule-performance-attention",
      label: "atrasos pontuais nas tasks monitoradas",
      penalty: SCHEDULE_PERFORMANCE_ATTENTION_PENALTY,
    });
  }

  if (insights.schedulePerformance?.status === "CRITICO") {
    breakdown.push({
      id: "schedule-performance-critical",
      label: "incidencia relevante de atraso",
      penalty: SCHEDULE_PERFORMANCE_CRITICAL_PENALTY,
    });
  }

  if (comparison) {
    const warningIncreasePenalty = Math.min(
      Math.max(0, comparison.metricsDelta.warningDelta),
      HISTORY_WARNING_INCREASE_PENALTY_CAP,
    );
    if (warningIncreasePenalty > 0) {
      breakdown.push({
        id: "history-warning-increase",
        label: "piora historica de warnings",
        penalty: warningIncreasePenalty,
      });
    }

    const errorIncreasePenalty = Math.min(
      Math.max(0, comparison.metricsDelta.errorDelta) * 2,
      HISTORY_ERROR_INCREASE_PENALTY_CAP,
    );
    if (errorIncreasePenalty > 0) {
      breakdown.push({
        id: "history-error-increase",
        label: "piora historica de errors",
        penalty: errorIncreasePenalty,
      });
    }

    const finishSlipPenalty = Math.min(
      Math.max(0, Math.ceil(comparison.metricsDelta.finishDateDeltaDays ?? 0)),
      HISTORY_FINISH_SLIP_PENALTY_CAP,
    );
    if (finishSlipPenalty > 0) {
      breakdown.push({
        id: "history-finish-slip",
        label: "piora da data final prevista",
        penalty: finishSlipPenalty,
      });
    }

    const progressRegressionPenalty = Math.min(
      Math.max(0, Math.ceil(Math.abs(Math.min(0, comparison.metricsDelta.percentCompleteDelta ?? 0)) / 5)),
      HISTORY_PROGRESS_REGRESSION_PENALTY_CAP,
    );
    if (progressRegressionPenalty > 0) {
      breakdown.push({
        id: "history-progress-regression",
        label: "regressao de progresso historico",
        penalty: progressRegressionPenalty,
      });
    }
  }

  const sortedBreakdown = [...breakdown].sort((left, right) => right.penalty - left.penalty);
  const totalPenalty = sortedBreakdown.reduce((sum, item) => sum + item.penalty, 0);
  const value = clampScore(100 - totalPenalty);
  const status = getScoreStatus(value);

  return {
    value,
    status,
    breakdown: sortedBreakdown,
    summaryMessage: buildSummaryMessage(status, sortedBreakdown),
  };
}
