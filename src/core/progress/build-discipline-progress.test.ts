import { describe, expect, it } from "vitest";

import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildDisciplineProgress } from "./build-discipline-progress";

function createDisciplines(): ProjectDiscipline[] {
  return [
    {
      name: "Mecanica",
      outlineNumber: "1",
      totalTasks: 3,
      metrics: {
        totalTasks: 3,
        totalMilestones: 0,
        totalDependencies: 0,
        totalResources: 1,
        tasksWithValidDates: 3,
        tasksWithoutDates: 0,
        tasksWithResources: 3,
        tasksWithoutResources: 0,
        tasksWithPercentComplete: 2,
        tasksWithActualDates: 1,
        tasksWithBaseline: 3,
        diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
        diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
      },
      diagnostics: {
        hasErrors: false,
        hasWarnings: false,
        hasInfo: false,
        items: [],
        errors: [],
        warnings: [],
        info: [],
      },
      insights: {
        summary: {
          status: "consistente",
          message: "x",
        },
        metrics: {
          totalTasks: 3,
          totalMilestones: 0,
          totalDependencies: 0,
          totalResources: 1,
          tasksWithValidDates: 3,
          tasksWithoutDates: 0,
          tasksWithResources: 3,
          tasksWithoutResources: 0,
          tasksWithPercentComplete: 2,
          tasksWithActualDates: 1,
          tasksWithBaseline: 3,
          diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
          diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
        },
        highlights: [],
        warnings: [],
      },
      score: {
        value: 90,
        status: "excelente",
        breakdown: [],
        summaryMessage: "x",
      },
    },
  ];
}

function createWeightModel(): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 420_000,
    totalRemainingNormalizedValue: 580_000,
    progressWeightedPercent: 42,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 2,
      tasksUsingPhysicalPercentComplete: 0,
      tasksConsideredCompletedByActualEndDate: 0,
      tasksWithoutProgressData: 1,
    },
    taskWeights: [
      {
        taskId: "a",
        taskName: "Precipitador eletrostatico",
        outlineNumber: "1.3.2.1",
        disciplineName: "Mecanica",
        progressPercentUsed: 82,
        progressSource: "percentComplete",
        normalizedValue: 200_000,
        normalizedWeightPercent: 20,
        earnedNormalizedValue: 164_000,
        remainingNormalizedValue: 36_000,
      },
      {
        taskId: "b",
        taskName: "Montagem de dutos",
        outlineNumber: "1.3.2.2",
        disciplineName: "Mecanica",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 150_000,
        normalizedWeightPercent: 15,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 150_000,
      },
      {
        taskId: "c",
        taskName: "Suportes",
        outlineNumber: "1.3.2.3",
        disciplineName: "Mecanica",
        progressPercentUsed: 100,
        progressSource: "actualEndDate",
        normalizedValue: 650_000,
        normalizedWeightPercent: 65,
        earnedNormalizedValue: 650_000,
        remainingNormalizedValue: 0,
      },
    ],
    disciplineWeights: [
      {
        name: "Mecanica",
        outlineNumber: "1",
        totalNormalizedValue: 1_000_000,
        earnedNormalizedValue: 814_000,
        remainingNormalizedValue: 186_000,
        normalizedWeightPercent: 100,
        progressWeightedPercent: 81.4,
      },
    ],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer: "x",
  };
}

describe("buildDisciplineProgress", () => {
  it("summarizes real progress and keeps operational task identifiers", () => {
    const analysis = buildDisciplineProgress(createDisciplines(), createWeightModel());

    expect(analysis.disciplines).toHaveLength(1);
    expect(analysis.disciplines[0].averagePercentComplete).toBe(60.67);
    expect(analysis.disciplines[0].completedTasks).toBe(1);
    expect(analysis.disciplines[0].inProgressTasks).toBe(1);
    expect(analysis.disciplines[0].notStartedTasks).toBe(1);
    expect(analysis.disciplines[0].topTasksByEarnedValue[0].taskIdentifier).toBe("1.3.2.3");
    expect(analysis.disciplines[0].topTasksWithoutProgress[0].taskIdentifier).toBe("1.3.2.2");
  });
});
