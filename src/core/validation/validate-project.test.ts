import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import { validateProject } from "./validate-project";

function createTask(overrides: Partial<Project["tasks"][number]> = {}): Project["tasks"][number] {
  return {
    id: "task-1",
    name: "Task",
    startDate: "2026-01-01T08:00:00",
    endDate: "2026-01-02T17:00:00",
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
  };
}

function createProject(task: Project["tasks"][number]): Project {
  return {
    id: "project-1",
    name: "Projeto Teste",
    tasks: [task],
    resources: [],
    dependencies: [],
  };
}

describe("validateProject milestone duration rules", () => {
  it("does not warn for milestone with duration 0", () => {
    const validation = validateProject(
      createProject(
        createTask({
          id: "m1",
          name: "Marco",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-01T08:00:00",
          duration: 0,
        }),
      ),
    );

    expect(validation.issues.find((issue) => issue.id === "task-zero-duration")).toBeUndefined();
    expect(validation.issues.find((issue) => issue.id === "milestone-incompatible-duration")).toBeUndefined();
  });

  it("warns when a milestone-like task has duration greater than 0", () => {
    const validation = validateProject(
      createProject(
        createTask({
          id: "m2",
          name: "Marco inconsistente",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-01T08:00:00",
          duration: 8,
        }),
      ),
    );

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "milestone-incompatible-duration",
          taskId: "m2",
        }),
      ]),
    );
  });

  it("keeps warning for normal task with duration 0", () => {
    const validation = validateProject(
      createProject(
        createTask({
          id: "t1",
          name: "Atividade suspeita",
          startDate: "2026-01-01T08:00:00",
          endDate: "2026-01-02T17:00:00",
          duration: 0,
        }),
      ),
    );

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-zero-duration",
          taskId: "t1",
        }),
        expect.objectContaining({
          id: "milestone-incompatible-duration",
          taskId: "t1",
        }),
      ]),
    );
  });
});
