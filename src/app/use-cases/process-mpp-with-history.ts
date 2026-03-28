import {
  buildProjectSnapshot,
  compareProjectSnapshots,
  findLatestCompatibleSnapshot,
} from "../history/snapshot-history";
import { tauriSnapshotStore, type SnapshotStore } from "../history/snapshot-store";
import { buildGapVsCompensation as buildGapVsCompensationAnalysis } from "../../core/compensation/build-gap-vs-compensation";
import { buildExecutiveAlerts } from "../../core/alerts/build-executive-alerts";
import { buildAnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import { buildExecutiveReport } from "../../core/report/build-executive-report";
import { buildProjectScore } from "../../core/score/build-project-score";
import { processMPP, type ProcessInput, type ProcessResult } from "./process-mpp";

export async function processMPPWithHistory(
  input: ProcessInput,
  snapshotStore: SnapshotStore = tauriSnapshotStore,
): Promise<ProcessResult> {
  const result = processMPP(input);
  const snapshot = buildProjectSnapshot(result, input);

  try {
    const snapshots = await snapshotStore.loadSnapshots();
    const previousSnapshot = findLatestCompatibleSnapshot(snapshot, snapshots);
    const comparison = previousSnapshot ? compareProjectSnapshots(previousSnapshot, snapshot) : undefined;
    const score = buildProjectScore(result.diagnostics, result.insights, comparison);
    const gapVsCompensation = buildGapVsCompensationAnalysis(comparison, result.compensationAnalysis);
    const analysisReliability = buildAnalysisReliability({
      diagnostics: result.diagnostics,
      diagnosticsAggregation: result.diagnosticsAggregation,
      project: result.model,
      insights: result.insights,
      weightModel: result.weightModel,
      disciplineProgress: result.disciplineProgress,
      scheduleStatus: result.scheduleStatus,
      gapVsCompensation,
      inputQuality: result.inputQuality,
    });
    const executiveAlerts = buildExecutiveAlerts(
      result.diagnostics,
      result.insights,
      score,
      result.weightModel,
      result.compensationAnalysis,
      result.disciplines,
      gapVsCompensation,
    );

    await snapshotStore.saveSnapshot(snapshot);

    return {
      ...result,
      score,
      gapVsCompensation,
      analysisReliability,
      executiveAlerts,
      executiveReportHtml: buildExecutiveReport({
        project: result.model,
        generatedAt: result.generatedAt,
        score,
        executiveAlerts,
        insights: result.insights,
        disciplines: result.disciplines,
        weightModel: result.weightModel,
        disciplineProgress: result.disciplineProgress,
        sCurve: result.sCurve,
        scheduleStatus: result.scheduleStatus,
        analysisReliability,
        compensationAnalysis: result.compensationAnalysis,
        compensationByDiscipline: result.compensationByDiscipline,
        gapVsCompensation,
      }),
      comparison,
    };
  } catch {
    return result;
  }
}
