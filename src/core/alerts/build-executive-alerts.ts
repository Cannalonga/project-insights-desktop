import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import type { OperationalCompensationAnalysis } from "../compensation/build-operational-compensation";

export type ExecutiveAlertSeverity = "info" | "warning" | "critical";

export type ExecutiveAlert = {
  id: string;
  severity: ExecutiveAlertSeverity;
  message: string;
};

const MAX_ALERTS = 5;
const LOW_RESOURCE_COVERAGE_THRESHOLD = 0.3;
const HIGH_DISCIPLINE_PENDING_SHARE_THRESHOLD = 0.4;
const HIGH_TASK_IMPACT_THRESHOLD = 10;
const LOW_PROGRESS_COVERAGE_THRESHOLD = 0.5;
const HIGH_COMPENSATION_CONCENTRATION_THRESHOLD = 20;

function toTitleCase(value: string): string {
  const normalized = value.toLocaleLowerCase("pt-BR");
  return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
}

function resolveOperationalFocus(
  topDiscipline: ProjectWeightModel["topDisciplinesByRemainingValue"][number] | undefined,
  topTask: OperationalCompensationAnalysis["topTasks"][number] | undefined,
  disciplines: ProjectDiscipline[],
): { kind: "discipline" | "front" | "project"; label: string } {
  const matchedDiscipline = topDiscipline
    ? disciplines.find((discipline) => discipline.name === topDiscipline.name || discipline.outlineNumber === topDiscipline.outlineNumber)
    : undefined;

  if (matchedDiscipline?.disciplineType && matchedDiscipline.disciplineType !== "OUTRO") {
    return {
      kind: "discipline",
      label: toTitleCase(matchedDiscipline.disciplineType),
    };
  }

  if (topTask?.name?.trim()) {
    return {
      kind: "front",
      label: topTask.name.trim(),
    };
  }

  if (matchedDiscipline?.name?.trim()) {
    return {
      kind: "front",
      label: matchedDiscipline.name.trim(),
    };
  }

  return {
    kind: "project",
    label: "projeto",
  };
}

function getSeverityWeight(severity: ExecutiveAlertSeverity): number {
  if (severity === "critical") {
    return 3;
  }

  if (severity === "warning") {
    return 2;
  }

  return 1;
}

function createAlert(id: string, severity: ExecutiveAlertSeverity, message: string): ExecutiveAlert {
  return { id, severity, message };
}

export function buildExecutiveAlerts(
  diagnostics: Diagnostics,
  insights: ProjectInsights,
  score: ProjectScore,
  weightModel: ProjectWeightModel,
  compensationAnalysis: OperationalCompensationAnalysis,
  disciplines: ProjectDiscipline[],
  gapVsCompensation?: GapVsCompensation,
): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];
  const totalTasks = insights.metrics.totalTasks;
  const totalRemainingValue = weightModel.totalRemainingNormalizedValue;
  const topDiscipline = weightModel.topDisciplinesByRemainingValue[0];
  const topTask = compensationAnalysis.topTasks[0];
  const operationalFocus = resolveOperationalFocus(topDiscipline, topTask, disciplines);
  const totalWeightedTasks = weightModel.taskWeights.length;
  const tasksWithProgressSource = totalWeightedTasks - weightModel.progressSourceCoverage.tasksWithoutProgressData;
  const progressCoverage = totalWeightedTasks === 0 ? 0 : tasksWithProgressSource / totalWeightedTasks;
  const resourceCoverageGap = totalTasks === 0 ? 0 : insights.metrics.tasksWithoutResources / totalTasks;

  if (insights.schedulePerformance?.status === "CRITICO") {
    alerts.push(
      createAlert("critical-schedule-delay", "critical", "Alta incidência de atraso nas tasks com dados reais."),
    );
  } else if (insights.schedulePerformance?.status === "ATENCAO") {
    alerts.push(
      createAlert("warning-schedule-delay", "warning", "Existem atrasos relevantes nas tasks com dados reais de prazo."),
    );
  }

  if (resourceCoverageGap > LOW_RESOURCE_COVERAGE_THRESHOLD) {
    alerts.push(
      createAlert("warning-resource-coverage", "warning", "Baixa cobertura de recursos pode comprometer a execução."),
    );
  }

  if (topDiscipline && totalRemainingValue > 0 && topDiscipline.remainingNormalizedValue / totalRemainingValue > HIGH_DISCIPLINE_PENDING_SHARE_THRESHOLD) {
    const message =
      operationalFocus.kind === "discipline"
        ? `A disciplina ${operationalFocus.label} concentra grande parte do valor pendente do projeto.`
        : operationalFocus.kind === "front"
          ? `A frente ${operationalFocus.label} concentra parte relevante do valor pendente do projeto.`
          : "O valor pendente do projeto está concentrado em uma frente operacional prioritária.";

    alerts.push(
      createAlert(
        "warning-discipline-concentration",
        "warning",
        message,
      ),
    );
  }

  if (topTask && topTask.impactPercent > HIGH_TASK_IMPACT_THRESHOLD) {
    alerts.push(
      createAlert(
        "warning-task-concentration",
        "warning",
        operationalFocus.kind === "discipline"
          ? `A ação prioritária está concentrada na disciplina ${operationalFocus.label}.`
          : "A ação prioritária atual concentra impacto relevante no projeto.",
      ),
    );
  }

  if (topTask && topTask.progressPercent < 100 && compensationAnalysis.potential.top3ImpactPercent > HIGH_COMPENSATION_CONCENTRATION_THRESHOLD) {
    alerts.push(
      createAlert(
        "info-compensation-concentration",
        "info",
        operationalFocus.kind === "discipline"
          ? `A recuperação está concentrada na disciplina ${operationalFocus.label}.`
          : "A capacidade de recuperação está concentrada em poucas ações prioritárias.",
      ),
    );
  }

  if (totalWeightedTasks > 0 && progressCoverage < LOW_PROGRESS_COVERAGE_THRESHOLD) {
    alerts.push(
      createAlert(
        "warning-progress-coverage",
        "warning",
        "Baixa cobertura de progresso pode reduzir a confiabilidade da análise.",
      ),
    );
  }

  if (gapVsCompensation?.status === "insufficient") {
    alerts.push(
      createAlert(
        "critical-gap-insufficient",
        "critical",
        "A capacidade atual de compensação não cobre o gap identificado.",
      ),
    );
  }

  if (gapVsCompensation?.status === "recoverable") {
    alerts.push(
      createAlert(
        "info-gap-recoverable",
        "info",
        "Existe capacidade potencial de recuperação do projeto.",
      ),
    );
  }

  if (alerts.length === 0 && diagnostics.errors.length === 0 && score.status === "excelente" && disciplines.length > 0) {
    alerts.push(
      createAlert("info-stable-project", "info", "O projeto apresenta leitura executiva estável nas regras atuais."),
    );
  }

  return alerts
    .sort((left, right) => getSeverityWeight(right.severity) - getSeverityWeight(left.severity))
    .slice(0, MAX_ALERTS);
}

