import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildScheduleStatus } from "./build-schedule-status";

function createProjectWithBaseline(): Project {
  return {
    id: "p1",
    name: "Projeto",
    tasks: [
      {
        id: "t1",
        name: "Task 1",
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-10T00:00:00.000Z",
        percentComplete: 40,
        physicalPercentComplete: 0,
        actualStartDate: "",
        actualEndDate: "",
        actualDurationHours: 0,
        actualWorkHours: 0,
        remainingWorkHours: 0,
        baselineStartDate: "2026-03-01T00:00:00.000Z",
        baselineEndDate: "2026-03-11T00:00:00.000Z",
        baselineDurationHours: 80,
        resumeDate: "",
        stopDate: "",
        duration: 80,
        outlineLevel: 1,
        outlineNumber: "1",
        isSummary: false,
        resourceIds: [],
      },
      {
        id: "t2",
        name: "Task 2",
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-20T00:00:00.000Z",
        percentComplete: 10,
        physicalPercentComplete: 0,
        actualStartDate: "",
        actualEndDate: "",
        actualDurationHours: 0,
        actualWorkHours: 0,
        remainingWorkHours: 0,
        baselineStartDate: "2026-03-01T00:00:00.000Z",
        baselineEndDate: "2026-03-21T00:00:00.000Z",
        baselineDurationHours: 160,
        resumeDate: "",
        stopDate: "",
        duration: 160,
        outlineLevel: 1,
        outlineNumber: "2",
        isSummary: false,
        resourceIds: [],
      },
    ],
    resources: [],
    dependencies: [],
  };
}

function createWeightModel(): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 200_000,
    totalRemainingNormalizedValue: 800_000,
    progressWeightedPercent: 20,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 2,
      tasksUsingPhysicalPercentComplete: 0,
      tasksConsideredCompletedByActualEndDate: 0,
      tasksWithoutProgressData: 0,
    },
    taskWeights: [
      {
        taskId: "t1",
        taskName: "Task 1",
        outlineNumber: "1",
        disciplineName: "Civil",
        progressPercentUsed: 40,
        progressSource: "percentComplete",
        normalizedValue: 400_000,
        normalizedWeightPercent: 40,
        earnedNormalizedValue: 160_000,
        remainingNormalizedValue: 240_000,
      },
      {
        taskId: "t2",
        taskName: "Task 2",
        outlineNumber: "2",
        disciplineName: "Civil",
        progressPercentUsed: 10,
        progressSource: "percentComplete",
        normalizedValue: 600_000,
        normalizedWeightPercent: 60,
        earnedNormalizedValue: 60_000,
        remainingNormalizedValue: 540_000,
      },
    ],
    disciplineWeights: [],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer: "x",
  };
}

describe("buildScheduleStatus", () => {
  it("uses baseline when available", () => {
    const status = buildScheduleStatus(
      createProjectWithBaseline(),
      createWeightModel(),
      "2026-03-16T00:00:00.000Z",
    );

    expect(status.basedOnBaseline).toBe(true);
    expect(status.consideredWeightedTasks).toBe(2);
    expect(status.progressExpected).toBeGreaterThan(status.progressReal);
  });

  it("falls back to inferred status when baseline is absent", () => {
    const projectWithoutBaseline: Project = {
      ...createProjectWithBaseline(),
      tasks: createProjectWithBaseline().tasks.map((task) => ({
        ...task,
        baselineStartDate: "",
        baselineEndDate: "",
      })),
    };

    const status = buildScheduleStatus(projectWithoutBaseline, createWeightModel(), "2026-03-16T00:00:00.000Z");

    expect(status.basedOnBaseline).toBe(false);
    expect(status.criteria).toContain("Inferência");
    expect(status.progressExpected).toBeGreaterThan(0);
  });
});
