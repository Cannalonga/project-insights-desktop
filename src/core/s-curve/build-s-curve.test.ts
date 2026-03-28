import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildSCurve } from "./build-s-curve";

function createProject(tasks: Project["tasks"]): Project {
  return {
    id: "project-1",
    name: "Projeto Curva S",
    tasks,
    resources: [],
    dependencies: [],
  };
}

function createTask(
  id: string,
  outlineNumber: string,
  overrides: Partial<Project["tasks"][number]> = {},
): Project["tasks"][number] {
  return {
    id,
    name: `Task ${id}`,
    startDate: "2026-01-05T08:00:00",
    endDate: "2026-01-09T17:00:00",
    percentComplete: 0,
    physicalPercentComplete: 0,
    actualStartDate: "",
    actualEndDate: "",
    actualDurationHours: 0,
    actualWorkHours: 0,
    remainingWorkHours: 0,
    baselineStartDate: "2026-01-05T08:00:00",
    baselineEndDate: "2026-01-09T17:00:00",
    baselineDurationHours: 40,
    resumeDate: "",
    stopDate: "",
    duration: 40,
    outlineLevel: 2,
    outlineNumber,
    isSummary: false,
    resourceIds: [],
    ...overrides,
  };
}

function createWeightModel(taskWeights: ProjectWeightModel["taskWeights"]): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 0,
    totalRemainingNormalizedValue: taskWeights.reduce((sum, task) => sum + task.remainingNormalizedValue, 0),
    progressWeightedPercent: 0,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 0,
      tasksUsingPhysicalPercentComplete: 0,
      tasksConsideredCompletedByActualEndDate: 0,
      tasksWithoutProgressData: taskWeights.length,
    },
    taskWeights,
    disciplineWeights: [],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer: "Escala normalizada.",
  };
}

describe("buildSCurve", () => {
  it("builds a weekly planned curve from valid baseline", () => {
    const project = createProject([createTask("1", "1.1", { percentComplete: 50 })]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 100_000,
        normalizedWeightPercent: 10,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 100_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.timelineGranularity).toBe("weekly");
    expect(result.percentBaseValue).toBe(100_000);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({
      date: "2026-01-05",
      planned: 100_000,
      plannedAccumulated: 100_000,
      replanned: 100_000,
      replannedAccumulated: 100_000,
      real: 50_000,
      realAccumulated: 50_000,
    });
  });

  it("keeps planned values at zero when baseline is missing", () => {
    const project = createProject([
      createTask("1", "1.1", {
        baselineStartDate: "",
        baselineEndDate: "",
      }),
    ]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 100_000,
        normalizedWeightPercent: 10,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 100_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points[0]?.planned).toBe(0);
    expect(result.points[0]?.plannedAccumulated).toBe(0);
    expect(result.explanation).toContain("baseline valida");
  });

  it("captures replanned distribution when current dates move", () => {
    const project = createProject([
      createTask("1", "1.1", {
        baselineStartDate: "2026-01-05T08:00:00",
        baselineEndDate: "2026-01-09T17:00:00",
        startDate: "2026-01-12T08:00:00",
        endDate: "2026-01-16T17:00:00",
      }),
    ]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 100_000,
        normalizedWeightPercent: 10,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 100_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points).toHaveLength(2);
    expect(result.points[0].planned).toBe(100_000);
    expect(result.points[0].replanned).toBe(0);
    expect(result.points[1].replanned).toBe(100_000);
  });

  it("allocates a single-week task entirely to one week", () => {
    const project = createProject([createTask("1", "1.1")]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 50_000,
        normalizedWeightPercent: 5,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 50_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points[0].planned).toBe(50_000);
    expect(result.points[0].plannedAccumulated).toBe(50_000);
  });

  it("distributes a multi-week task proportionally across weeks", () => {
    const project = createProject([
      createTask("1", "1.1", {
        baselineStartDate: "2026-01-05T08:00:00",
        baselineEndDate: "2026-01-19T17:00:00",
        startDate: "2026-01-05T08:00:00",
        endDate: "2026-01-19T17:00:00",
      }),
    ]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 90_000,
        normalizedWeightPercent: 9,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 90_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points).toHaveLength(3);
    expect(result.points[0].planned).toBeGreaterThan(0);
    expect(result.points[1].planned).toBeGreaterThan(0);
    expect(result.points[2].planned).toBeGreaterThan(0);
    expect(result.points[2].plannedAccumulated).toBe(90_000);
  });

  it("builds a real accumulated curve from percent complete and current dates", () => {
    const project = createProject([
      createTask("1", "1.1", {
        percentComplete: 50,
        startDate: "2026-01-05T08:00:00",
        endDate: "2026-01-19T17:00:00",
      }),
    ]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 50,
        progressSource: "percentComplete",
        normalizedValue: 100_000,
        normalizedWeightPercent: 10,
        earnedNormalizedValue: 50_000,
        remainingNormalizedValue: 50_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points).toHaveLength(3);
    expect(result.points[0].real).toBeGreaterThan(0);
    expect(result.points[1].real).toBeGreaterThan(0);
    expect(result.points[2].real).toBeGreaterThan(0);
    expect(result.points[2].realAccumulated).toBe(50_000);
  });

  it("computes accumulated values progressively", () => {
    const project = createProject([
      createTask("1", "1.1"),
      createTask("2", "1.2", {
        baselineStartDate: "2026-01-12T08:00:00",
        baselineEndDate: "2026-01-16T17:00:00",
        startDate: "2026-01-12T08:00:00",
        endDate: "2026-01-16T17:00:00",
      }),
    ]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 40_000,
        normalizedWeightPercent: 4,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 40_000,
      },
      {
        taskId: "2",
        taskName: "Task 2",
        outlineNumber: "1.2",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 60_000,
        normalizedWeightPercent: 6,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 60_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Projeto completo");

    expect(result.points).toHaveLength(2);
    expect(result.points[0].plannedAccumulated).toBe(40_000);
    expect(result.points[1].plannedAccumulated).toBe(100_000);
  });

  it("keeps scope label for discipline recortes", () => {
    const project = createProject([createTask("1", "2.1")]);
    const weightModel = createWeightModel([
      {
        taskId: "1",
        taskName: "Task 1",
        outlineNumber: "2.1",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 25_000,
        normalizedWeightPercent: 2.5,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 25_000,
      },
    ]);

    const result = buildSCurve(project, weightModel, "Mecanica");

    expect(result.scopeLabel).toBe("Mecanica");
  });
});
