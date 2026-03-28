import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import { buildDiagnostics } from "./build-diagnostics";
import { validateProject } from "../validation/validate-project";

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

describe("buildDiagnostics", () => {
  it("creates structured diagnostics for missing task name", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "1",
          name: "",
        }),
      ],
    });

    const diagnostics = buildDiagnostics(validateProject(project));

    expect(diagnostics.hasErrors).toBe(true);
    expect(diagnostics.errors).toEqual([
      expect.objectContaining({
        id: "task-missing-name",
        severity: "error",
        category: "data-quality",
        taskId: "1",
      }),
    ]);
  });

  it("creates schedule warnings for inverted dates and incompatible milestone", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "2",
          name: "Marco estranho",
          startDate: "2026-01-03T08:00:00",
          endDate: "2026-01-01T17:00:00",
          duration: 0,
        }),
      ],
    });

    const diagnostics = buildDiagnostics(validateProject(project));

    expect(diagnostics.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-inverted-dates",
          severity: "error",
          category: "schedule",
          taskId: "2",
        }),
        expect.objectContaining({
          id: "milestone-incompatible-duration",
          severity: "warning",
          category: "schedule",
          taskId: "2",
        }),
      ]),
    );
  });

  it("creates dependency diagnostics with explicit category", () => {
    const project = createProject({
      tasks: [
        createTask({
          id: "3",
          name: "Tarefa dependente",
        }),
      ],
      dependencies: [
        {
          id: "dep-1",
          fromTaskId: "999",
          toTaskId: "3",
          type: "FS",
        },
      ],
    });

    const diagnostics = buildDiagnostics(validateProject(project));

    expect(diagnostics.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "dependency-missing-task-reference",
          severity: "error",
          category: "dependency",
          taskId: "3",
          taskName: "Tarefa dependente",
        }),
      ]),
    );
  });
});
