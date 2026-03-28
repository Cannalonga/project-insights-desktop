import { describe, expect, it } from "vitest";

import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { Project } from "../model/project";
import { buildProjectInsights } from "./build-project-insights";

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto Teste",
    tasks: [],
    resources: [],
    dependencies: [],
    ...overrides,
  };
}

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

function createTask(overrides: Partial<Project["tasks"][number]> = {}): Project["tasks"][number] {
  return {
    id: "task-1",
    name: "Task",
    startDate: "2026-01-01T08:00:00",
    endDate: "2026-01-01T17:00:00",
    percentComplete: 0,
    physicalPercentComplete: 0,
    actualStartDate: "",
    actualEndDate: "",
    actualDurationHours: 0,
    actualWorkHours: 0,
    remainingWorkHours: 0,
    baselineStartDate: "",
    baselineEndDate: "",
    baselineDurationHours: 0,
    resumeDate: "",
    stopDate: "",
    duration: 8,
    outlineLevel: 1,
    outlineNumber: "1",
    isSummary: false,
    resourceIds: [],
    ...overrides,
  } as Project["tasks"][number];
}

describe("buildProjectInsights", () => {
  it("calculates the core metrics from model and diagnostics", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task 1",
          resourceIds: ["r1"],
        }),
        createTask({
          id: "2",
          name: "Task 2",
          startDate: "",
          endDate: "",
          duration: 0,
        }),
      ],
      resources: [{ id: "r1", name: "Equipe", type: "work" }],
      dependencies: [{ id: "dep-1", fromTaskId: "1", toTaskId: "2", type: "FS" }],
    });

    const diagnostics = createDiagnostics();
    const insights = buildProjectInsights(project, diagnostics);

    expect(insights.metrics).toMatchObject({
      totalTasks: 2,
      totalMilestones: 1,
      totalDependencies: 1,
      totalResources: 1,
      tasksWithValidDates: 1,
      tasksWithoutDates: 1,
      tasksWithResources: 1,
      tasksWithoutResources: 1,
      tasksWithPercentComplete: 0,
      tasksWithActualDates: 0,
      tasksWithBaseline: 0,
    });
  });

  it("generates warning for low resource coverage", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task 1",
        }),
        createTask({
          id: "2",
          name: "Task 2",
          startDate: "2026-01-02T08:00:00",
          endDate: "2026-01-02T17:00:00",
          resourceIds: ["-1"],
        }),
      ],
    });

    const insights = buildProjectInsights(project, createDiagnostics());

    expect(insights.warnings).toContain("O projeto apresenta baixa cobertura de recursos nas tasks.");
    expect(insights.summary.status).toBe("atencao");
  });

  it("generates critical summary and aggregated warnings from diagnostics", () => {
    const diagnostics = createDiagnostics({
      hasErrors: true,
      errors: [
        {
          id: "task-missing-name",
          severity: "error",
          category: "data-quality",
          message: "Task sem nome.",
          taskId: "1",
        },
      ],
      warnings: [
        {
          id: "task-zero-duration",
          severity: "warning",
          category: "schedule",
          message: "Task 1 possui duration 0.",
          taskId: "1",
        },
      ],
      items: [
        {
          id: "task-missing-name",
          severity: "error",
          category: "data-quality",
          message: "Task sem nome.",
          taskId: "1",
        },
        {
          id: "task-zero-duration",
          severity: "warning",
          category: "schedule",
          message: "Task 1 possui duration 0.",
          taskId: "1",
        },
      ],
    });

    const insights = buildProjectInsights(createProject(), diagnostics);

    expect(insights.summary.status).toBe("critico");
    expect(insights.metrics.diagnosticsBySeverity).toEqual({
      error: 1,
      warning: 1,
      info: 0,
    });
    expect(insights.metrics.diagnosticsByCategory).toEqual({
      structure: 0,
      schedule: 1,
      dependency: 0,
      "data-quality": 1,
    });
    expect(insights.warnings).toEqual(
      expect.arrayContaining([
        "O projeto apresenta problemas criticos que devem ser corrigidos antes da conversao final.",
        "O cronograma apresenta inconsistencias de datas, duracoes ou marcos.",
        "O projeto apresenta problemas agregados de qualidade de dados.",
      ]),
    );
  });

  it("calculates schedule performance from baseline data when available", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task com baseline",
          startDate: "2026-01-05T08:00:00",
          endDate: "2026-01-12T17:00:00",
          baselineStartDate: "2026-01-01T08:00:00",
          baselineEndDate: "2026-01-10T17:00:00",
        }),
      ],
    });

    const insights = buildProjectInsights(project, createDiagnostics());

    expect(insights.schedulePerformance).toMatchObject({
      status: "CRITICO",
      tasksDelayed: 1,
      totalTasks: 1,
      averageDelay: 2,
      maxDelay: 2,
    });
  });

  it("calculates schedule performance from actual data when available", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task com actual",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-10T17:00:00",
          actualStartDate: "2026-01-01T08:00:00",
          actualEndDate: "2026-01-11T17:00:00",
        }),
      ],
    });

    const insights = buildProjectInsights(project, createDiagnostics());

    expect(insights.schedulePerformance).toMatchObject({
      status: "CRITICO",
      tasksDelayed: 1,
      totalTasks: 1,
      averageDelay: 1,
      maxDelay: 1,
    });
  });

  it("does not expose schedule performance when there is no real schedule data", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task sem prazo real",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-10T17:00:00",
        }),
      ],
    });

    const insights = buildProjectInsights(project, createDiagnostics());

    expect(insights.schedulePerformance).toBeUndefined();
  });

  it("exposes progress coverage metrics when real progress fields exist", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "Task com progresso",
          percentComplete: 50,
          actualStartDate: "2026-01-02T08:00:00",
          actualEndDate: "2026-01-05T17:00:00",
          baselineStartDate: "2026-01-01T08:00:00",
          baselineEndDate: "2026-01-06T17:00:00",
          baselineDurationHours: 8,
        }),
      ],
    });

    const insights = buildProjectInsights(project, createDiagnostics());

    expect(insights.metrics).toMatchObject({
      tasksWithPercentComplete: 1,
      tasksWithActualDates: 1,
      tasksWithBaseline: 1,
    });
    expect(insights.highlights).toEqual(
      expect.arrayContaining([
        "O projeto possui dados reais de percentual concluido para acompanhamento de progresso.",
        "O projeto possui datas reais de execucao registradas no cronograma.",
        "O projeto possui baseline registrada para comparacoes futuras.",
      ]),
    );
  });
});
