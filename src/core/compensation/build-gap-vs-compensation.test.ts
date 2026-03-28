import { describe, expect, it } from "vitest";

import type { ProjectComparison } from "../../app/history/snapshot-history";
import type { OperationalCompensationAnalysis } from "./build-operational-compensation";
import { buildGapVsCompensation } from "./build-gap-vs-compensation";

function createCompensationAnalysis(
  overrides: Partial<OperationalCompensationAnalysis> = {},
): OperationalCompensationAnalysis {
  return {
    topTasks: [],
    potential: {
      top3ImpactPercent: 12,
      top5ImpactPercent: 20,
      message: "Mensagem",
    },
    ...overrides,
  };
}

function createComparison(
  percentCompleteDelta?: number,
): ProjectComparison {
  return {
    previousSnapshotAt: "2026-03-19T08:00:00.000Z",
    currentSnapshotAt: "2026-03-26T08:00:00.000Z",
    projectMatched: true,
    metricsDelta: {
      percentCompleteDelta,
      completedTasksDelta: 0,
      tasksWithProgressDelta: 0,
      warningDelta: 0,
      errorDelta: 0,
      infoDelta: 0,
    },
    highlights: [],
    warnings: [],
  };
}

describe("buildGapVsCompensation", () => {
  it("returns unavailable when there is no historical base", () => {
    const result = buildGapVsCompensation(undefined, createCompensationAnalysis());

    expect(result).toMatchObject({
      status: "unavailable",
      top3CompensationPercent: 12,
      top5CompensationPercent: 20,
    });
    expect(result.gapPercent).toBeUndefined();
  });

  it("returns recoverable when top 3 covers the gap", () => {
    const result = buildGapVsCompensation(
      createComparison(-8),
      createCompensationAnalysis(),
    );

    expect(result).toMatchObject({
      gapPercent: 8,
      status: "recoverable",
    });
  });

  it("returns tight when top 3 does not cover but top 5 covers the gap", () => {
    const result = buildGapVsCompensation(
      createComparison(-15),
      createCompensationAnalysis(),
    );

    expect(result).toMatchObject({
      gapPercent: 15,
      status: "tight",
    });
  });

  it("returns insufficient when top 5 does not cover the gap", () => {
    const result = buildGapVsCompensation(
      createComparison(-24),
      createCompensationAnalysis(),
    );

    expect(result).toMatchObject({
      gapPercent: 24,
      status: "insufficient",
    });
  });

  it("keeps calculation coherent with comparison and compensation inputs", () => {
    const result = buildGapVsCompensation(
      createComparison(-12.34),
      createCompensationAnalysis({
        potential: {
          top3ImpactPercent: 10,
          top5ImpactPercent: 18,
          message: "Mensagem",
        },
      }),
    );

    expect(result).toEqual({
      gapPercent: 12.34,
      top3CompensationPercent: 10,
      top5CompensationPercent: 18,
      status: "tight",
      message: "A recuperação depende de executar mais do que as 3 tarefas principais.",
    });
  });
});
