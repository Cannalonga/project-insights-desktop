import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import { buildProjectDisciplines } from "./build-project-disciplines";
import { buildDiagnostics } from "../diagnostics/build-diagnostics";
import { buildProjectInsights } from "../insights/build-project-insights";
import { buildProjectScore } from "../score/build-project-score";
import { validateProject } from "../validation/validate-project";

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

function createProject(): Project {
  return {
    id: "project-1",
    name: "Projeto Teste",
    tasks: [
      createTask({
        id: "d1",
        name: "Civil",
        outlineLevel: 1,
        outlineNumber: "1",
        isSummary: true,
        duration: 40,
      }),
      createTask({
        id: "d1-1",
        name: "Fundacao",
        outlineLevel: 2,
        outlineNumber: "1.1",
        resourceIds: ["r1"],
      }),
      createTask({
        id: "d1-2",
        name: "",
        outlineLevel: 2,
        outlineNumber: "1.2",
        resourceIds: ["r9"],
      }),
      createTask({
        id: "d2",
        name: "Eletrica",
        outlineLevel: 1,
        outlineNumber: "2",
        isSummary: true,
        duration: 40,
      }),
      createTask({
        id: "d2-1",
        name: "Cabos",
        outlineLevel: 2,
        outlineNumber: "2.1",
        resourceIds: ["r2"],
      }),
      createTask({
        id: "other",
        name: "Task externa",
        outlineLevel: 1,
        outlineNumber: "10",
        isSummary: false,
      }),
    ],
    resources: [
      { id: "r1", name: "Equipe Civil", type: "work" },
      { id: "r2", name: "Equipe Eletrica", type: "work" },
    ],
    dependencies: [
      { id: "dep-1", fromTaskId: "d1-1", toTaskId: "d1-2", type: "FS" },
      { id: "dep-2", fromTaskId: "d1-2", toTaskId: "d2-1", type: "FS" },
    ],
  };
}

describe("buildProjectDisciplines", () => {
  it("identifies disciplines only from summary tasks at outline level 1", () => {
    const disciplines = buildProjectDisciplines(createProject());

    expect(disciplines.map((discipline) => discipline.name)).toEqual(["Civil", "Eletrica"]);
    expect(disciplines.map((discipline) => discipline.outlineNumber)).toEqual(["1", "2"]);
    expect(disciplines.map((discipline) => discipline.disciplineType)).toEqual(["CIVIL", "ELETRICA"]);
  });

  it("groups tasks by outlineNumber prefix without mixing other branches", () => {
    const disciplines = buildProjectDisciplines(createProject());
    const civil = disciplines.find((discipline) => discipline.outlineNumber === "1");
    const eletrica = disciplines.find((discipline) => discipline.outlineNumber === "2");

    expect(civil?.totalTasks).toBe(3);
    expect(civil?.metrics.totalDependencies).toBe(1);
    expect(eletrica?.totalTasks).toBe(2);
    expect(eletrica?.metrics.totalDependencies).toBe(0);
  });

  it("reuses diagnostics logic for discipline subsets", () => {
    const disciplines = buildProjectDisciplines(createProject());
    const civil = disciplines.find((discipline) => discipline.outlineNumber === "1");

    expect(civil?.diagnostics.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task-missing-name", taskId: "d1-2" }),
        expect.objectContaining({ id: "task-missing-resource-reference", taskId: "d1-2" }),
      ]),
    );
  });

  it("builds discipline score consistently from the subset diagnostics and insights", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const civil = disciplines.find((discipline) => discipline.outlineNumber === "1");

    const subsetProject: Project = {
      id: "project-1:d1",
      name: "Civil",
      tasks: project.tasks.filter((task) => task.outlineNumber === "1" || task.outlineNumber.startsWith("1.")),
      resources: project.resources.filter((resource) => resource.id === "r1"),
      dependencies: [{ id: "dep-1", fromTaskId: "d1-1", toTaskId: "d1-2", type: "FS" }],
    };
    const diagnostics = buildDiagnostics(validateProject(subsetProject));
    const insights = buildProjectInsights(subsetProject, diagnostics);
    const score = buildProjectScore(diagnostics, insights);

    expect(civil?.score.value).toBe(score.value);
    expect(civil?.score.breakdown).toEqual(score.breakdown);
  });

  it("keeps discipline and global score aligned when the project has a single discipline", () => {
    const singleDisciplineProject: Project = {
      ...createProject(),
      tasks: createProject().tasks.filter((task) => task.outlineNumber === "1" || task.outlineNumber.startsWith("1.")),
      resources: [{ id: "r1", name: "Equipe Civil", type: "work" }],
      dependencies: [{ id: "dep-1", fromTaskId: "d1-1", toTaskId: "d1-2", type: "FS" }],
    };

    const globalDiagnostics = buildDiagnostics(validateProject(singleDisciplineProject));
    const globalInsights = buildProjectInsights(singleDisciplineProject, globalDiagnostics);
    const globalScore = buildProjectScore(globalDiagnostics, globalInsights);
    const [discipline] = buildProjectDisciplines(singleDisciplineProject);

    expect(discipline.score.value).toBe(globalScore.value);
    expect(discipline.score.status).toBe(globalScore.status);
  });

  it("falls back to OUTRO when the discipline type is not inferable", () => {
    const project: Project = {
      ...createProject(),
      tasks: [
        createTask({
          id: "d3",
          name: "PROJETO INDUSTRIAL BLOCO A",
          outlineLevel: 1,
          outlineNumber: "3",
          isSummary: true,
          duration: 40,
        }),
        createTask({
          id: "d3-1",
          name: "Recebimento geral",
          outlineLevel: 2,
          outlineNumber: "3.1",
          resourceIds: ["r1"],
        }),
      ],
      resources: [{ id: "r1", name: "Equipe geral", type: "work" }],
      dependencies: [],
    };

    const [discipline] = buildProjectDisciplines(project);
    expect(discipline.disciplineType).toBe("OUTRO");
  });
});
