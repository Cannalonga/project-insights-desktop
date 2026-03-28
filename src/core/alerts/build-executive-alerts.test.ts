import { describe, expect, it } from "vitest";

import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import type { OperationalCompensationAnalysis } from "../compensation/build-operational-compensation";
import { buildExecutiveAlerts } from "./build-executive-alerts";
import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";

function createDiagnostics(): Diagnostics {
  return {
    items: [],
    errors: [],
    warnings: [],
    info: [],
    hasErrors: false,
    hasWarnings: false,
    hasInfo: false,
  };
}

function createInsights(overrides: Partial<ProjectInsights> = {}): ProjectInsights {
  return {
    summary: {
      status: "consistente",
      message: "ok",
    },
    metrics: {
      totalTasks: 10,
      totalMilestones: 1,
      totalDependencies: 2,
      totalResources: 3,
      tasksWithValidDates: 10,
      tasksWithoutDates: 0,
      tasksWithResources: 10,
      tasksWithoutResources: 0,
      tasksWithPercentComplete: 8,
      tasksWithActualDates: 8,
      tasksWithBaseline: 6,
      diagnosticsBySeverity: {
        error: 0,
        warning: 0,
        info: 0,
      },
      diagnosticsByCategory: {
        structure: 0,
        schedule: 0,
        dependency: 0,
        "data-quality": 0,
      },
    },
    highlights: [],
    warnings: [],
    ...overrides,
  };
}

function createScore(overrides: Partial<ProjectScore> = {}): ProjectScore {
  return {
    value: 95,
    status: "excelente",
    breakdown: [],
    summaryMessage: "ok",
    ...overrides,
  };
}

function createWeightModel(overrides: Partial<ProjectWeightModel> = {}): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 400_000,
    totalRemainingNormalizedValue: 600_000,
    progressWeightedPercent: 40,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 4,
      tasksUsingPhysicalPercentComplete: 2,
      tasksConsideredCompletedByActualEndDate: 1,
      tasksWithoutProgressData: 1,
    },
    taskWeights: [],
    disciplineWeights: [],
    topTasksByRemainingValue: [
      {
        taskId: "t1",
        taskName: "Task critica",
        outlineNumber: "1.1",
        disciplineName: "Civil",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 150_000,
        normalizedWeightPercent: 15,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 150_000,
      },
    ],
    topDisciplinesByRemainingValue: [
      {
        name: "Civil",
        outlineNumber: "1",
        totalNormalizedValue: 500_000,
        earnedNormalizedValue: 100_000,
        remainingNormalizedValue: 300_000,
        normalizedWeightPercent: 50,
        progressWeightedPercent: 20,
      },
    ],
    disclaimer: "x",
    ...overrides,
  };
}

function createCompensationAnalysis(
  overrides: Partial<OperationalCompensationAnalysis> = {},
): OperationalCompensationAnalysis {
  return {
    topTasks: [
      {
        taskId: "t1",
        name: "Task critica",
        disciplineName: "Civil",
        remainingNormalizedValue: 150_000,
        impactPercent: 15,
        progressPercent: 0,
      },
    ],
    potential: {
      top3ImpactPercent: 25,
      top5ImpactPercent: 35,
      message: "x",
    },
    ...overrides,
  };
}

function createDisciplines(): ProjectDiscipline[] {
  return [
    {
      name: "Civil",
      outlineNumber: "1",
      totalTasks: 10,
      metrics: createInsights().metrics,
      diagnostics: createDiagnostics(),
      insights: createInsights(),
      score: createScore(),
    },
  ];
}

describe("buildExecutiveAlerts", () => {
  it("generates alerts from the configured rules", () => {
    const alerts = buildExecutiveAlerts(
      createDiagnostics(),
      createInsights({
        schedulePerformance: {
          status: "CRITICO",
          tasksDelayed: 4,
          totalTasks: 5,
          averageDelay: 6,
          maxDelay: 12,
          message: "delay",
        },
        metrics: {
          ...createInsights().metrics,
          tasksWithResources: 5,
          tasksWithoutResources: 5,
        },
      }),
      createScore(),
      createWeightModel({
        progressSourceCoverage: {
          tasksUsingPercentComplete: 2,
          tasksUsingPhysicalPercentComplete: 0,
          tasksConsideredCompletedByActualEndDate: 0,
          tasksWithoutProgressData: 8,
        },
        totalRemainingNormalizedValue: 500_000,
        topDisciplinesByRemainingValue: [
          {
            name: "Civil",
            outlineNumber: "1",
            totalNormalizedValue: 600_000,
            earnedNormalizedValue: 100_000,
            remainingNormalizedValue: 300_000,
            normalizedWeightPercent: 60,
            progressWeightedPercent: 16.67,
          },
        ],
      }),
      createCompensationAnalysis(),
      createDisciplines(),
      {
        gapPercent: 30,
        top3CompensationPercent: 25,
        top5CompensationPercent: 35,
        status: "insufficient",
        message: "x",
      },
    );

    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        "critical-schedule-delay",
        "critical-gap-insufficient",
        "warning-resource-coverage",
        "warning-discipline-concentration",
        "warning-task-concentration",
      ]),
    );
  });

  it("returns no alert when nothing applies", () => {
    const alerts = buildExecutiveAlerts(
      createDiagnostics(),
      createInsights(),
      createScore({ status: "bom" }),
      createWeightModel({
        totalRemainingNormalizedValue: 600_000,
        progressSourceCoverage: {
          tasksUsingPercentComplete: 6,
          tasksUsingPhysicalPercentComplete: 2,
          tasksConsideredCompletedByActualEndDate: 1,
          tasksWithoutProgressData: 1,
        },
        topDisciplinesByRemainingValue: [
          {
            name: "Civil",
            outlineNumber: "1",
            totalNormalizedValue: 500_000,
            earnedNormalizedValue: 300_000,
            remainingNormalizedValue: 200_000,
            normalizedWeightPercent: 50,
            progressWeightedPercent: 60,
          },
        ],
      }),
      createCompensationAnalysis({
        topTasks: [
          {
            taskId: "t1",
            name: "Task",
            disciplineName: "Civil",
            remainingNormalizedValue: 80_000,
            impactPercent: 8,
            progressPercent: 20,
          },
        ],
        potential: {
          top3ImpactPercent: 12,
          top5ImpactPercent: 18,
          message: "x",
        },
      }),
      createDisciplines(),
    );

    expect(alerts).toEqual([]);
  });

  it("orders alerts by severity and limits to five", () => {
    const alerts = buildExecutiveAlerts(
      createDiagnostics(),
      createInsights({
        schedulePerformance: {
          status: "CRITICO",
          tasksDelayed: 3,
          totalTasks: 4,
          averageDelay: 4,
          maxDelay: 10,
          message: "delay",
        },
        metrics: {
          ...createInsights().metrics,
          tasksWithResources: 4,
          tasksWithoutResources: 6,
        },
      }),
      createScore(),
      createWeightModel({
        progressSourceCoverage: {
          tasksUsingPercentComplete: 1,
          tasksUsingPhysicalPercentComplete: 0,
          tasksConsideredCompletedByActualEndDate: 0,
          tasksWithoutProgressData: 9,
        },
        totalRemainingNormalizedValue: 600_000,
        topDisciplinesByRemainingValue: [
          {
            name: "Civil",
            outlineNumber: "1",
            totalNormalizedValue: 700_000,
            earnedNormalizedValue: 100_000,
            remainingNormalizedValue: 320_000,
            normalizedWeightPercent: 70,
            progressWeightedPercent: 14.29,
          },
        ],
      }),
      createCompensationAnalysis({
        topTasks: [
          {
            taskId: "t1",
            name: "Task critica",
            disciplineName: "Civil",
            remainingNormalizedValue: 180_000,
            impactPercent: 18,
            progressPercent: 0,
          },
        ],
        potential: {
          top3ImpactPercent: 28,
          top5ImpactPercent: 35,
          message: "x",
        },
      }),
      createDisciplines(),
      {
        gapPercent: 12,
        top3CompensationPercent: 28,
        top5CompensationPercent: 35,
        status: "recoverable",
        message: "x",
      },
    );

    expect(alerts).toHaveLength(5);
    expect(alerts[0]?.severity).toBe("critical");
    expect(alerts[1]?.severity).toBe("warning");
  });

  it("adds recoverable gap as informational alert", () => {
    const alerts = buildExecutiveAlerts(
      createDiagnostics(),
      createInsights(),
      createScore(),
      createWeightModel(),
      createCompensationAnalysis(),
      createDisciplines(),
      {
        gapPercent: 10,
        top3CompensationPercent: 25,
        top5CompensationPercent: 30,
        status: "recoverable",
        message: "x",
      } as GapVsCompensation,
    );

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "info-gap-recoverable",
          severity: "info",
        }),
      ]),
    );
  });
});
