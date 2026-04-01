import { buildExecutiveAlerts } from "../../core/alerts/build-executive-alerts";
import {
  buildCompensationByDiscipline,
  buildOperationalCompensation,
} from "../../core/compensation/build-operational-compensation";
import { buildDiagnostics } from "../../core/diagnostics/build-diagnostics";
import { buildDiagnosticsAggregation } from "../../core/diagnostics/build-diagnostics-aggregation";
import {
  buildProjectDisciplines,
  buildScopedProjectByOutlineNumber,
  type ProjectDiscipline,
} from "../../core/disciplines/build-project-disciplines";
import { buildProjectInsights } from "../../core/insights/build-project-insights";
import type { Project } from "../../core/model/project";
import { buildAnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import {
  buildExecutiveReport,
  type ExecutiveReportInput,
} from "../../core/report/build-executive-report";
import { buildDisciplineProgress } from "../../core/progress/build-discipline-progress";
import { buildSCurve } from "../../core/s-curve/build-s-curve";
import { buildScheduleStatus } from "../../core/schedule/build-schedule-status";
import { buildProjectScore } from "../../core/score/build-project-score";
import { validateProject } from "../../core/validation/validate-project";
import { buildProjectWeightModel } from "../../core/weight/build-project-weight-model";
import type { ProcessResult } from "./process-mpp";

export type ExecutiveReportScope =
  | { kind: "global" }
  | { kind: "discipline"; outlineNumber: string };

function hasUsableName(name: string | undefined): boolean {
  if (!name) {
    return false;
  }

  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "sem nome";
}

function resolveProjectDisplayName(
  project: Project,
  disciplines: ProjectDiscipline[],
  dominantOutlineNumber?: string,
): string {
  if (hasUsableName(project.name)) {
    return project.name.trim();
  }

  const dominantDiscipline = dominantOutlineNumber
    ? disciplines.find((discipline) => discipline.outlineNumber === dominantOutlineNumber)
    : disciplines[0];
  if (dominantDiscipline?.name) {
    return dominantDiscipline.name;
  }

  const rootSummary = project.tasks.find((task) => task.isSummary && task.outlineLevel === 1 && hasUsableName(task.name));
  if (rootSummary?.name) {
    return rootSummary.name.trim();
  }

  const firstTask = project.tasks.find((task) => hasUsableName(task.name));
  if (firstTask?.name) {
    return firstTask.name.trim();
  }

  return "Projeto sem identificação";
}

function buildScopedAnalytics(
  project: Project,
  comparison: ProcessResult["comparison"],
  generatedAt: string,
) {
  const validation = validateProject(project);
  const diagnostics = buildDiagnostics(validation);
  const diagnosticsAggregation = buildDiagnosticsAggregation(diagnostics);
  const insights = buildProjectInsights(project, diagnostics);
  const disciplines = buildProjectDisciplines(project);
  const weightModel = buildProjectWeightModel(project, disciplines);
  const disciplineProgress = buildDisciplineProgress(disciplines, weightModel);
  const sCurve = buildSCurve(project, weightModel, project.name || "Recorte atual");
  const scheduleStatus = buildScheduleStatus(project, weightModel, generatedAt);
  const compensationAnalysis = buildOperationalCompensation(weightModel);
  const compensationByDiscipline = buildCompensationByDiscipline(weightModel);
  const score = buildProjectScore(diagnostics, insights, comparison);
  const analysisReliability = buildAnalysisReliability({
    diagnostics,
    diagnosticsAggregation,
    project,
    insights,
    weightModel,
    disciplineProgress,
    scheduleStatus,
  });
  const executiveAlerts = buildExecutiveAlerts(
    diagnostics,
    insights,
    score,
    weightModel,
    compensationAnalysis,
    disciplines,
  );

  return {
    project,
    diagnostics,
    diagnosticsAggregation,
    insights,
    disciplines,
    weightModel,
    disciplineProgress,
    sCurve,
    scheduleStatus,
    analysisReliability,
    compensationAnalysis,
    compensationByDiscipline,
    score,
    executiveAlerts,
  };
}

export function resolveExecutiveReportInputForScope(
  result: ProcessResult,
  scope: ExecutiveReportScope,
): ExecutiveReportInput {
  if (scope.kind === "global") {
    const dominantOutlineNumber = result.weightModel.disciplineWeights
      .slice()
      .sort((left, right) => right.totalNormalizedValue - left.totalNormalizedValue)[0]?.outlineNumber;

    return {
      project: result.model,
      projectDisplayName: resolveProjectDisplayName(result.model, result.disciplines, dominantOutlineNumber),
      analysisAreaLabel: "Projeto completo",
      generatedAt: result.generatedAt,
      diagnosticsAggregation: result.diagnosticsAggregation,
      score: result.score,
      executiveAlerts: result.executiveAlerts,
      insights: result.insights,
      disciplines: result.disciplines,
      weightModel: result.weightModel,
      disciplineProgress: result.disciplineProgress,
      sCurve: result.sCurve,
      scheduleStatus: result.scheduleStatus,
      analysisReliability: result.analysisReliability,
      compensationAnalysis: result.compensationAnalysis,
      compensationByDiscipline: result.compensationByDiscipline,
      gapVsCompensation: result.gapVsCompensation,
    };
  }

  const discipline = result.disciplines.find((item) => item.outlineNumber === scope.outlineNumber);
  if (!discipline) {
    return resolveExecutiveReportInputForScope(result, { kind: "global" });
  }

  const scopedProject = buildScopedProjectByOutlineNumber(result.model, discipline.outlineNumber);
  const scopedAnalytics = buildScopedAnalytics(
    {
      ...scopedProject,
      name: discipline.name,
    },
    undefined,
    result.generatedAt,
  );

  return {
    project: scopedAnalytics.project,
    projectDisplayName: resolveProjectDisplayName(
      scopedAnalytics.project,
      scopedAnalytics.disciplines,
      discipline.outlineNumber,
    ),
    analysisAreaLabel: discipline.name,
    generatedAt: result.generatedAt,
    diagnosticsAggregation: scopedAnalytics.diagnosticsAggregation,
    score: scopedAnalytics.score,
    executiveAlerts: scopedAnalytics.executiveAlerts,
    insights: scopedAnalytics.insights,
    disciplines: scopedAnalytics.disciplines,
    weightModel: scopedAnalytics.weightModel,
    disciplineProgress: scopedAnalytics.disciplineProgress,
    sCurve: scopedAnalytics.sCurve,
    scheduleStatus: scopedAnalytics.scheduleStatus,
    analysisReliability: scopedAnalytics.analysisReliability,
    compensationAnalysis: scopedAnalytics.compensationAnalysis,
    compensationByDiscipline: scopedAnalytics.compensationByDiscipline,
  };
}

export function buildExecutiveReportForScope(
  result: ProcessResult,
  scope: ExecutiveReportScope,
): string {
  return buildExecutiveReport(resolveExecutiveReportInputForScope(result, scope));
}
