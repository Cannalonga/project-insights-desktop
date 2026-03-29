import type {
  OperationalCompensationAnalysis,
  OperationalCompensationDiscipline,
} from "../../core/compensation/build-operational-compensation";
import type { GapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import type { ExecutiveAlert } from "../../core/alerts/build-executive-alerts";
import type { Diagnostics } from "../../core/diagnostics/build-diagnostics";
import type { DiagnosticsAggregation } from "../../core/diagnostics/build-diagnostics-aggregation";
import type { ProjectDiscipline } from "../../core/disciplines/build-project-disciplines";
import type { ProjectInsights } from "../../core/insights/build-project-insights";
import type { Project } from "../../core/model/project";
import type { DisciplineProgressAnalysis } from "../../core/progress/build-discipline-progress";
import type { AnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import type { MPPInputQualityAssessment } from "../../core/input-quality/build-mpp-input-quality";
import { buildExecutiveReport } from "../../core/report/build-executive-report";
import type { SCurveResult } from "../../core/s-curve/build-s-curve";
import type { ScheduleStatus } from "../../core/schedule/build-schedule-status";
import type { ProjectComparison } from "../history/snapshot-history";
import type { ProjectWeightModel } from "../../core/weight/build-project-weight-model";
import {
  buildCompensationByDiscipline,
  buildOperationalCompensation,
} from "../../core/compensation/build-operational-compensation";
import { buildExecutiveAlerts } from "../../core/alerts/build-executive-alerts";
import { buildDiagnostics } from "../../core/diagnostics/build-diagnostics";
import { buildDiagnosticsAggregation } from "../../core/diagnostics/build-diagnostics-aggregation";
import { buildProjectDisciplines } from "../../core/disciplines/build-project-disciplines";
import { exportAnalyticalCSV } from "../../core/export/export-csv";
import { exportToJSON } from "../../core/export/export-json";
import { exportToXML } from "../../core/export/export-xml";
import { buildMPPInputQuality } from "../../core/input-quality/build-mpp-input-quality";
import { buildProjectInsights } from "../../core/insights/build-project-insights";
import { mapRawProjectToModel } from "../../core/mapper/map-project";
import { parseProject } from "../../core/parser/parse-project";
import { buildDisciplineProgress } from "../../core/progress/build-discipline-progress";
import { buildAnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import { buildScheduleStatus } from "../../core/schedule/build-schedule-status";
import { buildSCurve } from "../../core/s-curve/build-s-curve";
import { buildProjectScore, type ProjectScore } from "../../core/score/build-project-score";
import { validateProject } from "../../core/validation/validate-project";
import { buildProjectWeightModel } from "../../core/weight/build-project-weight-model";

export type ProcessResult = {
  generatedAt: string;
  model: Project;
  diagnostics: Diagnostics;
  diagnosticsAggregation: DiagnosticsAggregation;
  inputQuality?: MPPInputQualityAssessment;
  json: string;
  structuredXml: string;
  csv: string;
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
  gapVsCompensation?: GapVsCompensation;
  comparison?: ProjectComparison;
};

export class MPPInputFatalError extends Error {
  code = "MPP_INPUT_FATAL" as const;

  constructor(message: string) {
    super(message);
    this.name = "MPPInputFatalError";
  }
}

export type ProcessInput = {
  filePath?: string;
  xmlContent?: string;
};

export function processMPP(input: ProcessInput): ProcessResult {
  const generatedAt = new Date().toISOString();
  const raw = parseProject(input);
  const model = mapRawProjectToModel(raw);

  const validation = validateProject(model);
  const diagnostics = buildDiagnostics(validation);
  const diagnosticsAggregation = buildDiagnosticsAggregation(diagnostics);
  const inputQuality = buildMPPInputQuality(model, diagnostics);

  if (inputQuality.level === "fatal") {
    throw new MPPInputFatalError(inputQuality.issues[0]?.message ?? inputQuality.summary);
  }

  const insights = buildProjectInsights(model, diagnostics);
  const score = buildProjectScore(diagnostics, insights);
  const disciplines = buildProjectDisciplines(model);
  const weightModel = buildProjectWeightModel(model, disciplines);
  const disciplineProgress = buildDisciplineProgress(disciplines, weightModel);
  const sCurve = buildSCurve(model, weightModel, "Projeto completo");
  const scheduleStatus = buildScheduleStatus(model, weightModel, generatedAt);
  const compensationAnalysis = buildOperationalCompensation(weightModel);
  const compensationByDiscipline = buildCompensationByDiscipline(weightModel);
  const analysisReliability = buildAnalysisReliability({
    diagnostics,
    diagnosticsAggregation,
    project: model,
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
    project: model,
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

  const json = exportToJSON({
    generatedAt,
    project: model,
    insights,
    score,
    disciplines,
    weightModel,
    compensationAnalysis,
    compensationByDiscipline,
    disciplineProgress,
    sCurve,
    scheduleStatus,
    analysisReliability,
  });
  const structuredXml = exportToXML({
    generatedAt,
    project: model,
    diagnostics,
    diagnosticsAggregation,
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
  });
  const csv = exportAnalyticalCSV({
    project: model,
    diagnostics,
    insights,
    weightModel,
    generatedAt,
    analysisReliability,
    scheduleStatus,
    disciplineProgress,
    sCurve,
  });

  return {
    generatedAt,
    model,
    diagnostics,
    diagnosticsAggregation,
    inputQuality,
    json,
    structuredXml,
    csv,
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
