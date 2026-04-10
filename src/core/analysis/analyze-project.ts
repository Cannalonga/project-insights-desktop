import {
  buildCompensationByDiscipline,
  buildOperationalCompensation,
  type OperationalCompensationAnalysis,
  type OperationalCompensationDiscipline,
} from "../compensation/build-operational-compensation";
import { buildExecutiveAlerts, type ExecutiveAlert } from "../alerts/build-executive-alerts";
import { buildDiagnostics, type Diagnostics } from "../diagnostics/build-diagnostics";
import { buildDiagnosticsAggregation, type DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import { buildProjectDisciplines, type ProjectDiscipline } from "../disciplines/build-project-disciplines";
import {
  buildProjectInputQuality,
  type ProjectInputQualityAssessment,
} from "../input-quality/build-project-input-quality";
import { buildProjectInsights, type ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import { buildDisciplineProgress, type DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import { buildAnalysisReliability, type AnalysisReliability } from "../reliability/build-analysis-reliability";
import { buildExecutiveReport } from "../report/build-executive-report";
import { buildSCurve, type SCurveResult } from "../s-curve/build-s-curve";
import { buildScheduleStatus, type ScheduleStatus } from "../schedule/build-schedule-status";
import { buildProjectScore, type ProjectScore } from "../score/build-project-score";
import { validateProject } from "../validation/validate-project";
import { buildProjectWeightModel, type ProjectWeightModel } from "../weight/build-project-weight-model";

export type ProjectAnalysisResult = {
  diagnostics: Diagnostics;
  diagnosticsAggregation: DiagnosticsAggregation;
  inputQuality?: ProjectInputQualityAssessment;
  insights: ProjectInsights;
  score: ProjectScore;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
  disciplineProgress?: DisciplineProgressAnalysis;
  sCurve?: SCurveResult;
  scheduleStatus?: ScheduleStatus;
  analysisReliability?: AnalysisReliability;
  executiveAlerts: ExecutiveAlert[];
  executiveReportHtml: string;
};

export class ProjectAnalysisFatalError extends Error {
  code = "PROJECT_ANALYSIS_FATAL" as const;

  constructor(message: string) {
    super(message);
    this.name = "ProjectAnalysisFatalError";
  }
}

export function analyzeProject(project: Project, generatedAt: string): ProjectAnalysisResult {
  const validation = validateProject(project);
  const diagnostics = buildDiagnostics(validation);
  const diagnosticsAggregation = buildDiagnosticsAggregation(diagnostics);
  const inputQuality = buildProjectInputQuality(project, diagnostics);

  if (inputQuality.level === "fatal") {
    throw new ProjectAnalysisFatalError(inputQuality.issues[0]?.message ?? inputQuality.summary);
  }

  const insights = buildProjectInsights(project, diagnostics);
  const score = buildProjectScore(diagnostics, insights);
  const disciplines = buildProjectDisciplines(project);
  const weightModel = buildProjectWeightModel(project, disciplines);
  const disciplineProgress = buildDisciplineProgress(disciplines, weightModel);
  const sCurve = buildSCurve(project, weightModel, "Projeto completo");
  const scheduleStatus = buildScheduleStatus(project, weightModel, generatedAt);
  const compensationAnalysis = buildOperationalCompensation(weightModel);
  const compensationByDiscipline = buildCompensationByDiscipline(weightModel);
  const analysisReliability = buildAnalysisReliability({
    diagnostics,
    diagnosticsAggregation,
    project,
    insights,
    weightModel,
    disciplineProgress,
    scheduleStatus,
    inputQuality,
  });
  const executiveAlerts = buildExecutiveAlerts(
    diagnostics,
    insights,
    score,
    weightModel,
    compensationAnalysis,
    disciplines,
  );
  const executiveReportHtml = buildExecutiveReport({
    project,
    generatedAt,
    diagnosticsAggregation,
    score,
    executiveAlerts,
    insights,
    disciplines,
    weightModel,
    disciplineProgress,
    scheduleStatus,
    analysisReliability,
    compensationAnalysis,
    compensationByDiscipline,
  });

  return {
    diagnostics,
    diagnosticsAggregation,
    inputQuality,
    insights,
    score,
    disciplines,
    weightModel,
    disciplineProgress,
    sCurve,
    scheduleStatus,
    analysisReliability,
    compensationAnalysis,
    compensationByDiscipline,
    executiveAlerts,
    executiveReportHtml,
  };
}
