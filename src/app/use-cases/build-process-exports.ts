import type { ProjectAnalysisResult } from "../../core/analysis/analyze-project";
import { exportAnalyticalCSV } from "../../core/export/export-csv";
import { exportToJSON } from "../../core/export/export-json";
import { exportToXML } from "../../core/export/export-xml";
import type { Project } from "../../core/model/project";

export type ProcessExports = {
  json: string;
  structuredXml: string;
  csv: string;
};

export type BuildProcessExportsInput = {
  generatedAt: string;
  model: Project;
  analysis: ProjectAnalysisResult;
};

export function buildProcessExports(input: BuildProcessExportsInput): ProcessExports {
  const { analysis, generatedAt, model } = input;

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
    json,
    structuredXml,
    csv,
  };
}
