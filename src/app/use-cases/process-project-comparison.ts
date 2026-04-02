import { buildGapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import type { ProjectComparison } from "../history/snapshot-history";
import { compareProjectVersions } from "../comparison/compare-project-versions";
import { processProjectFile } from "./process-project-file";
import { processMPP, type ProcessResult } from "./process-mpp";

export type ProjectComparisonInput = {
  baseFilePath: string;
  currentFilePath: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildSyntheticProjectComparison(base: ProcessResult, current: ProcessResult): ProjectComparison {
  const weightedDelta = round2(current.weightModel.progressWeightedPercent - base.weightModel.progressWeightedPercent);

  return {
    previousSnapshotAt: base.generatedAt,
    currentSnapshotAt: current.generatedAt,
    projectMatched: true,
    metricsDelta: {
      percentCompleteDelta: weightedDelta,
      completedTasksDelta: 0,
      tasksWithProgressDelta: 0,
      warningDelta: 0,
      errorDelta: 0,
      infoDelta: 0,
    },
    highlights:
      weightedDelta > 0
        ? [`O projeto evoluiu ${weightedDelta} pontos percentuais entre a base e a versao atual.`]
        : [],
    warnings:
      weightedDelta < 0
        ? [`O projeto regrediu ${Math.abs(weightedDelta)} pontos percentuais entre a base e a versao atual.`]
        : [],
  };
}

export async function processProjectComparison(input: ProjectComparisonInput): Promise<ProcessResult> {
  console.log("USE CASE BASE:", input.baseFilePath);
  console.log("USE CASE CURRENT:", input.currentFilePath);

  const baseResult = await processProjectFile(
    { filePath: input.baseFilePath },
    undefined,
    undefined,
    undefined,
    undefined,
    async (processInput) => processMPP(processInput),
  );

  const currentResult = await processProjectFile(
    { filePath: input.currentFilePath },
    undefined,
    undefined,
    undefined,
    undefined,
    async (processInput) => processMPP(processInput),
  );

  const comparison = buildSyntheticProjectComparison(baseResult, currentResult);
  const versionComparison = compareProjectVersions(
    baseResult,
    currentResult,
    input.baseFilePath,
    input.currentFilePath,
  );
  const gapVsCompensation = buildGapVsCompensation(comparison, currentResult.compensationAnalysis);

  return {
    ...currentResult,
    analysisMode: "comparison",
    comparison,
    versionComparison,
    gapVsCompensation,
  };
}
