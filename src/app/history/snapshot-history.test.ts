import { describe, expect, it } from "vitest";

import type { ProcessResult } from "../use-cases/process-mpp";
import {
  buildProjectSnapshot,
  compareProjectSnapshots,
  findLatestCompatibleSnapshot,
} from "./snapshot-history";

function createResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  const result: ProcessResult = {
    generatedAt: "2026-03-23T10:00:00.000Z",
    model: {
      id: "project-1",
      name: "Projeto A",
      tasks: [
        {
          id: "1",
          name: "Task 1",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-10T17:00:00",
          percentComplete: 50,
          physicalPercentComplete: 50,
          actualStartDate: "",
          actualEndDate: "",
          actualDurationHours: 0,
          actualWorkHours: 0,
          remainingWorkHours: 0,
          baselineStartDate: "2026-01-01T08:00:00",
          baselineEndDate: "2026-01-09T17:00:00",
          baselineDurationHours: 8,
          resumeDate: "",
          stopDate: "",
          duration: 8,
          outlineLevel: 1,
          outlineNumber: "1",
          isSummary: false,
          resourceIds: ["r1"],
        },
      ],
      resources: [{ id: "r1", name: "Equipe", type: "work" }],
      dependencies: [],
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
    diagnosticsAggregation: {
      totalItems: 0,
      totalGroups: 0,
      groups: [],
      topGroups: [],
    },
    json: "{}",
    structuredXml: "<xml />",
    csv: "",
    insights: {
      summary: {
        status: "atencao",
        message: "Resumo",
      },
      metrics: {
        totalTasks: 1,
        totalMilestones: 0,
        totalDependencies: 0,
        totalResources: 1,
        tasksWithValidDates: 1,
        tasksWithoutDates: 0,
        tasksWithResources: 1,
        tasksWithoutResources: 0,
        tasksWithPercentComplete: 1,
        tasksWithActualDates: 0,
        tasksWithBaseline: 1,
        diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
        diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
      },
      highlights: [],
      warnings: [],
    },
    score: {
      value: 88,
      status: "bom",
      breakdown: [],
      summaryMessage: "Resumo de score",
    },
    disciplines: [],
    weightModel: {
      normalizedProjectValue: 1000000,
      totalEarnedNormalizedValue: 500000,
      totalRemainingNormalizedValue: 500000,
      progressWeightedPercent: 50,
      progressSourceCoverage: {
        tasksUsingPercentComplete: 1,
        tasksUsingPhysicalPercentComplete: 0,
        tasksConsideredCompletedByActualEndDate: 0,
        tasksWithoutProgressData: 0,
      },
      taskWeights: [],
      disciplineWeights: [],
      topTasksByRemainingValue: [],
      topDisciplinesByRemainingValue: [],
      disclaimer: "Escala normalizada.",
    },
    compensationAnalysis: {
      topTasks: [],
      potential: {
        top3ImpactPercent: 0,
        top5ImpactPercent: 0,
        message: "Sem impacto combinado relevante.",
      },
    },
    compensationByDiscipline: [],
    executiveAlerts: [],
    executiveReportHtml: "<html></html>",
  };

  return {
    ...result,
    ...overrides,
    executiveReportHtml: overrides.executiveReportHtml ?? result.executiveReportHtml,
  };
}

describe("snapshot history", () => {
  it("finds the latest compatible snapshot for the same project", () => {
    const currentSnapshot = buildProjectSnapshot(createResult(), { filePath: "D:\\ProjetoA.xml" }, "2026-03-23T10:00:00.000Z");
    const previousSnapshot = buildProjectSnapshot(createResult(), { filePath: "D:\\ProjetoA.xml" }, "2026-03-22T10:00:00.000Z");
    const differentProject = buildProjectSnapshot(
      createResult({
        model: {
          ...createResult().model,
          name: "Projeto B",
        },
      }),
      { filePath: "D:\\ProjetoB.xml" },
      "2026-03-22T11:00:00.000Z",
    );

    const matched = findLatestCompatibleSnapshot(currentSnapshot, [differentProject, previousSnapshot]);

    expect(matched?.capturedAt).toBe("2026-03-22T10:00:00.000Z");
  });

  it("builds deterministic comparison deltas", () => {
    const previousSnapshot = buildProjectSnapshot(createResult(), { filePath: "D:\\ProjetoA.xml" }, "2026-03-22T10:00:00.000Z");
    const currentSnapshot = buildProjectSnapshot(
      createResult({
        model: {
          ...createResult().model,
          tasks: [
            {
              ...createResult().model.tasks[0],
              percentComplete: 70,
              actualEndDate: "2026-01-11T17:00:00",
              endDate: "2026-01-12T17:00:00",
            },
          ],
        },
        diagnostics: {
          ...createResult().diagnostics,
          warnings: [{ id: "w1", severity: "warning", category: "schedule", message: "Warning" }],
          hasWarnings: true,
          items: [{ id: "w1", severity: "warning", category: "schedule", message: "Warning" }],
        },
      }),
      { filePath: "D:\\ProjetoA.xml" },
      "2026-03-23T10:00:00.000Z",
    );

    const comparison = compareProjectSnapshots(previousSnapshot, currentSnapshot);

    expect(comparison.projectMatched).toBe(true);
    expect(comparison.metricsDelta.percentCompleteDelta).toBe(20);
    expect(comparison.metricsDelta.completedTasksDelta).toBe(1);
    expect(comparison.metricsDelta.warningDelta).toBe(1);
  });
});
