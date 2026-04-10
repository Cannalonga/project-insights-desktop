import type { GapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import {
  analyzeProject,
  ProjectAnalysisFatalError,
  type ProjectAnalysisResult,
} from "../../core/analysis/analyze-project";
import type { Project } from "../../core/model/project";
import type { ProjectComparison } from "../history/snapshot-history";
import type { VersionComparisonSummary } from "../comparison/compare-project-versions";
import { exportAnalyticalCSV } from "../../core/export/export-csv";
import { exportToJSON } from "../../core/export/export-json";
import { exportToXML } from "../../core/export/export-xml";
import { mapRawProjectToModel } from "../../core/mapper/map-project";
import { parseProject } from "../../core/parser/parse-project";

export type ProcessResult = ProjectAnalysisResult & {
  analysisMode?: "single" | "comparison";
  generatedAt: string;
  model: Project;
  json: string;
  structuredXml: string;
  csv: string;
  gapVsCompensation?: GapVsCompensation;
  comparison?: ProjectComparison;
  versionComparison?: VersionComparisonSummary;
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
  model?: Project;
};

export function processMPP(input: ProcessInput): ProcessResult {
  const generatedAt = new Date().toISOString();
  const model = input.model ?? mapRawProjectToModel(parseProject(input));
  let analysis: ProjectAnalysisResult;

  try {
    analysis = analyzeProject(model, generatedAt);
  } catch (error) {
    if (error instanceof ProjectAnalysisFatalError) {
      throw new MPPInputFatalError(error.message);
    }

    throw error;
  }

  const json = exportToJSON({
    generatedAt,
    project: model,
    insights: analysis.insights,
    score: analysis.score,
    disciplines: analysis.disciplines,
    weightModel: analysis.weightModel,
    compensationAnalysis: analysis.compensationAnalysis,
    compensationByDiscipline: analysis.compensationByDiscipline,
    disciplineProgress: analysis.disciplineProgress,
    sCurve: analysis.sCurve,
    scheduleStatus: analysis.scheduleStatus,
    analysisReliability: analysis.analysisReliability,
  });
  const structuredXml = exportToXML({
    generatedAt,
    project: model,
    diagnostics: analysis.diagnostics,
    diagnosticsAggregation: analysis.diagnosticsAggregation,
    insights: analysis.insights,
    score: analysis.score,
    disciplines: analysis.disciplines,
    weightModel: analysis.weightModel,
    disciplineProgress: analysis.disciplineProgress,
    sCurve: analysis.sCurve,
    scheduleStatus: analysis.scheduleStatus,
    analysisReliability: analysis.analysisReliability,
    compensationAnalysis: analysis.compensationAnalysis,
    compensationByDiscipline: analysis.compensationByDiscipline,
  });
  const csv = exportAnalyticalCSV({
    project: model,
    diagnostics: analysis.diagnostics,
    insights: analysis.insights,
    weightModel: analysis.weightModel,
    generatedAt,
    analysisReliability: analysis.analysisReliability,
    scheduleStatus: analysis.scheduleStatus,
    disciplineProgress: analysis.disciplineProgress,
    sCurve: analysis.sCurve,
  });

  return {
    analysisMode: "single",
    generatedAt,
    model,
    ...analysis,
    json,
    structuredXml,
    csv,
  };
}
