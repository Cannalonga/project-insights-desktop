import { describe, expect, it } from "vitest";

import type { ProjectComparison } from "../../app/history/snapshot-history";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectInsights } from "../insights/build-project-insights";
import { buildProjectScore } from "./build-project-score";

function createDiagnostics(overrides: Partial<Diagnostics> = {}): Diagnostics {
  return {
    hasErrors: false,
    hasWarnings: false,
    hasInfo: false,
    items: [],
    errors: [],
    warnings: [],
    info: [],
    ...overrides,
  };
}

function createInsights(overrides: Partial<ProjectInsights> = {}): ProjectInsights {
  return {
    summary: {
      status: "consistente",
      message: "O projeto apresenta base consistente para leitura analitica.",
    },
    metrics: {
      totalTasks: 10,
      totalMilestones: 1,
      totalDependencies: 4,
      totalResources: 3,
      tasksWithValidDates: 10,
      tasksWithoutDates: 0,
      tasksWithResources: 10,
      tasksWithoutResources: 0,
      tasksWithPercentComplete: 0,
      tasksWithActualDates: 0,
      tasksWithBaseline: 10,
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

function createComparison(
  overrides: Partial<ProjectComparison> = {},
): ProjectComparison {
  return {
    previousSnapshotAt: "2026-03-16T08:00:00.000Z",
    currentSnapshotAt: "2026-03-23T08:00:00.000Z",
    projectMatched: true,
    metricsDelta: {
      completedTasksDelta: 0,
      tasksWithProgressDelta: 0,
      warningDelta: 0,
      errorDelta: 0,
      infoDelta: 0,
    },
    highlights: [],
    warnings: [],
    ...overrides,
  };
}

describe("buildProjectScore", () => {
  it("keeps a healthy project with high score and no penalties", () => {
    const score = buildProjectScore(createDiagnostics(), createInsights());

    expect(score.value).toBe(100);
    expect(score.status).toBe("excelente");
    expect(score.breakdown).toEqual([]);
  });

  it("reduces score significantly when there are errors", () => {
    const diagnostics = createDiagnostics({
      hasErrors: true,
      errors: [
        {
          id: "e1",
          severity: "error",
          category: "structure",
          message: "Erro 1",
        },
        {
          id: "e2",
          severity: "error",
          category: "schedule",
          message: "Erro 2",
        },
        {
          id: "e3",
          severity: "error",
          category: "dependency",
          message: "Erro 3",
        },
        {
          id: "e4",
          severity: "error",
          category: "data-quality",
          message: "Erro 4",
        },
      ],
    });

    const score = buildProjectScore(diagnostics, createInsights());

    expect(score.value).toBe(70);
    expect(score.status).toBe("atencao");
    expect(score.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "diagnostics-errors",
          penalty: 30,
        }),
      ]),
    );
  });

  it("produces an intermediate score for warnings and low coverage", () => {
    const diagnostics = createDiagnostics({
      hasWarnings: true,
      warnings: Array.from({ length: 6 }, (_, index) => ({
        id: `w${index + 1}`,
        severity: "warning" as const,
        category: "data-quality" as const,
        message: `Warning ${index + 1}`,
      })),
    });
    const insights = createInsights({
      metrics: {
        ...createInsights().metrics,
        totalTasks: 10,
        tasksWithValidDates: 5,
        tasksWithoutDates: 5,
        tasksWithResources: 4,
        tasksWithoutResources: 6,
        tasksWithBaseline: 2,
        tasksWithPercentComplete: 1,
        tasksWithActualDates: 1,
      },
    });

    const score = buildProjectScore(diagnostics, insights);

    expect(score.value).toBe(64);
    expect(score.status).toBe("atencao");
    expect(score.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "diagnostics-warnings", penalty: 12 }),
        expect.objectContaining({ id: "missing-valid-dates", penalty: 6 }),
        expect.objectContaining({ id: "missing-resources", penalty: 8 }),
        expect.objectContaining({ id: "low-baseline-coverage", penalty: 6 }),
        expect.objectContaining({ id: "low-progress-coverage", penalty: 4 }),
      ]),
    );
  });

  it("applies only a light adjustment for historical worsening", () => {
    const comparison = createComparison({
      metricsDelta: {
        completedTasksDelta: 0,
        tasksWithProgressDelta: 0,
        warningDelta: 3,
        errorDelta: 1,
        infoDelta: 0,
        finishDateDeltaDays: 2,
        percentCompleteDelta: -6,
      },
    });

    const score = buildProjectScore(createDiagnostics(), createInsights(), comparison);

    expect(score.value).toBe(91);
    expect(score.status).toBe("excelente");
    expect(score.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "history-warning-increase", penalty: 3 }),
        expect.objectContaining({ id: "history-error-increase", penalty: 2 }),
        expect.objectContaining({ id: "history-finish-slip", penalty: 2 }),
        expect.objectContaining({ id: "history-progress-regression", penalty: 2 }),
      ]),
    );
  });

  it("respects score lower bound at zero", () => {
    const diagnostics = createDiagnostics({
      hasErrors: true,
      hasWarnings: true,
      errors: Array.from({ length: 10 }, (_, index) => ({
        id: `e${index + 1}`,
        severity: "error" as const,
        category: "schedule" as const,
        message: `Erro ${index + 1}`,
      })),
      warnings: Array.from({ length: 20 }, (_, index) => ({
        id: `w${index + 1}`,
        severity: "warning" as const,
        category: "data-quality" as const,
        message: `Warning ${index + 1}`,
      })),
    });
    const insights = createInsights({
      metrics: {
        ...createInsights().metrics,
        totalTasks: 10,
        tasksWithValidDates: 0,
        tasksWithoutDates: 10,
        tasksWithResources: 0,
        tasksWithoutResources: 10,
        tasksWithBaseline: 0,
        tasksWithPercentComplete: 1,
        tasksWithActualDates: 1,
      },
      schedulePerformance: {
        status: "CRITICO",
        tasksDelayed: 8,
        totalTasks: 10,
        averageDelay: 7,
        maxDelay: 20,
        message: "Ha incidencia relevante de atraso nas tasks com dados reais de prazo.",
      },
    });
    const comparison = createComparison({
      metricsDelta: {
        completedTasksDelta: 0,
        tasksWithProgressDelta: 0,
        warningDelta: 10,
        errorDelta: 4,
        infoDelta: 0,
        finishDateDeltaDays: 8,
        percentCompleteDelta: -30,
      },
    });

    const score = buildProjectScore(diagnostics, insights, comparison);

    expect(score.value).toBe(0);
    expect(score.status).toBe("critico");
  });

  it("orders breakdown by highest penalty first", () => {
    const diagnostics = createDiagnostics({
      hasErrors: true,
      hasWarnings: true,
      errors: [
        {
          id: "e1",
          severity: "error",
          category: "schedule",
          message: "Erro",
        },
      ],
      warnings: [
        {
          id: "w1",
          severity: "warning",
          category: "data-quality",
          message: "Warning",
        },
      ],
    });
    const insights = createInsights({
      metrics: {
        ...createInsights().metrics,
        totalTasks: 10,
        tasksWithValidDates: 5,
        tasksWithoutDates: 5,
        tasksWithResources: 5,
        tasksWithoutResources: 5,
      },
    });

    const score = buildProjectScore(diagnostics, insights);

    expect(score.breakdown[0]).toMatchObject({
      id: "diagnostics-errors",
      penalty: 10,
    });
    expect(score.breakdown[1]).toMatchObject({
      id: "missing-valid-dates",
      penalty: 6,
    });
  });
});
