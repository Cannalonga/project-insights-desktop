import type { ProjectComparison } from "../../app/history/snapshot-history";
import type { OperationalCompensationAnalysis } from "./build-operational-compensation";

export type GapVsCompensationStatus = "recoverable" | "tight" | "insufficient" | "unavailable";

export type GapVsCompensation = {
  gapPercent?: number;
  top3CompensationPercent: number;
  top5CompensationPercent: number;
  status: GapVsCompensationStatus;
  message: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function buildGapVsCompensation(
  comparison: ProjectComparison | undefined,
  compensationAnalysis: OperationalCompensationAnalysis,
): GapVsCompensation {
  const top3CompensationPercent = compensationAnalysis.potential.top3ImpactPercent;
  const top5CompensationPercent = compensationAnalysis.potential.top5ImpactPercent;
  const progressDelta = comparison?.metricsDelta.percentCompleteDelta;

  if (progressDelta === undefined || progressDelta >= 0) {
    return {
      top3CompensationPercent,
      top5CompensationPercent,
      status: "unavailable",
      message: "Ainda não há base histórica suficiente para comparar gap e compensação.",
    };
  }

  const gapPercent = round2(Math.abs(progressDelta));

  if (top3CompensationPercent >= gapPercent) {
    return {
      gapPercent,
      top3CompensationPercent,
      top5CompensationPercent,
      status: "recoverable",
      message: "A capacidade de compensação atual supera o gap identificado.",
    };
  }

  if (top5CompensationPercent >= gapPercent) {
    return {
      gapPercent,
      top3CompensationPercent,
      top5CompensationPercent,
      status: "tight",
      message: "A recuperação depende de executar mais do que as 3 tarefas principais.",
    };
  }

  return {
    gapPercent,
    top3CompensationPercent,
    top5CompensationPercent,
    status: "insufficient",
    message: "A compensação potencial atual não cobre o gap identificado.",
  };
}

