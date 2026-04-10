import type { GapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import {
  analyzeProject,
  ProjectAnalysisFatalError,
  type ProjectAnalysisResult,
} from "../../core/analysis/analyze-project";
import type { Project } from "../../core/model/project";
import type { ProjectComparison } from "../history/snapshot-history";
import type { VersionComparisonSummary } from "../comparison/compare-project-versions";
import { mapRawProjectToModel } from "../../core/mapper/map-project";
import { parseProject } from "../../core/parser/parse-project";
import { buildProcessExports } from "./build-process-exports";

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

  const { csv, json, structuredXml } = buildProcessExports({
    generatedAt,
    model,
    analysis,
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
