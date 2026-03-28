import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import { buildProjectDisciplines } from "../disciplines/build-project-disciplines";
import { buildProjectWeightModel } from "./build-project-weight-model";

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
    name: "Projeto Peso",
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
        id: "1.1",
        name: "Escavacao",
        outlineLevel: 2,
        outlineNumber: "1.1",
        duration: 10,
        percentComplete: 50,
      }),
      createTask({
        id: "1.2",
        name: "Concretagem",
        outlineLevel: 2,
        outlineNumber: "1.2",
        duration: 30,
        percentComplete: 0,
      }),
      createTask({
        id: "d2",
        name: "Eletrica",
        outlineLevel: 1,
        outlineNumber: "2",
        isSummary: true,
        duration: 20,
      }),
      createTask({
        id: "2.1",
        name: "Cabos",
        outlineLevel: 2,
        outlineNumber: "2.1",
        duration: 20,
        percentComplete: 100,
      }),
      createTask({
        id: "2.2",
        name: "Marco",
        outlineLevel: 2,
        outlineNumber: "2.2",
        duration: 0,
        percentComplete: 0,
      }),
    ],
    resources: [],
    dependencies: [],
  };
}

describe("buildProjectWeightModel", () => {
  it("distributes the normalized 1,000,000 total across operational tasks", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);

    const total = model.taskWeights.reduce((sum, taskWeight) => sum + taskWeight.normalizedValue, 0);

    expect(model.normalizedProjectValue).toBe(1000000);
    expect(total).toBe(1000000);
  });

  it("does not let summary tasks or milestones distort the operational distribution", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);

    expect(model.taskWeights.map((taskWeight) => taskWeight.taskId)).toEqual(["1.1", "1.2", "2.1"]);
  });

  it("calculates earned and remaining values from percentComplete", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);
    const excavation = model.taskWeights.find((taskWeight) => taskWeight.taskId === "1.1");
    const cabos = model.taskWeights.find((taskWeight) => taskWeight.taskId === "2.1");

    expect(excavation).toMatchObject({
      normalizedValue: 166666.67,
      progressPercentUsed: 50,
      progressSource: "percentComplete",
      earnedNormalizedValue: 83333.34,
      remainingNormalizedValue: 83333.33,
    });
    expect(cabos).toMatchObject({
      normalizedValue: 333333.33,
      progressPercentUsed: 100,
      progressSource: "percentComplete",
      earnedNormalizedValue: 333333.33,
      remainingNormalizedValue: 0,
    });
  });

  it("uses physicalPercentComplete when percentComplete is unavailable", () => {
    const project = createProject();
    project.tasks = project.tasks.map((task) =>
      task.id === "1.2"
        ? { ...task, percentComplete: 0, physicalPercentComplete: 25 }
        : task,
    );

    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);
    const concretagem = model.taskWeights.find((taskWeight) => taskWeight.taskId === "1.2");

    expect(concretagem).toMatchObject({
      progressSource: "physicalPercentComplete",
      progressPercentUsed: 25,
      earnedNormalizedValue: 125000,
      remainingNormalizedValue: 375000,
    });
  });

  it("treats actualEndDate as 100 percent completion when no percentages exist", () => {
    const project = createProject();
    project.tasks = project.tasks.map((task) =>
      task.id === "1.2"
        ? { ...task, percentComplete: 0, physicalPercentComplete: 0, actualEndDate: "2026-01-05T17:00:00" }
        : task,
    );

    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);
    const concretagem = model.taskWeights.find((taskWeight) => taskWeight.taskId === "1.2");

    expect(concretagem).toMatchObject({
      progressSource: "actualEndDate",
      progressPercentUsed: 100,
      earnedNormalizedValue: 500000,
      remainingNormalizedValue: 0,
    });
  });

  it("does not invent progress when only actualStartDate exists", () => {
    const project = createProject();
    project.tasks = project.tasks.map((task) =>
      task.id === "1.2"
        ? {
            ...task,
            percentComplete: 0,
            physicalPercentComplete: 0,
            actualStartDate: "2026-01-03T08:00:00",
            actualEndDate: "",
          }
        : task,
    );

    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);
    const concretagem = model.taskWeights.find((taskWeight) => taskWeight.taskId === "1.2");

    expect(concretagem).toMatchObject({
      progressSource: "none",
      progressPercentUsed: 0,
      earnedNormalizedValue: 0,
      remainingNormalizedValue: 500000,
    });
  });

  it("aggregates normalized values by discipline", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);
    const civil = model.disciplineWeights.find((discipline) => discipline.outlineNumber === "1");
    const eletrica = model.disciplineWeights.find((discipline) => discipline.outlineNumber === "2");

    expect(civil).toMatchObject({
      totalNormalizedValue: 666666.67,
      earnedNormalizedValue: 83333.34,
      remainingNormalizedValue: 583333.33,
      progressWeightedPercent: 12.5,
    });
    expect(eletrica).toMatchObject({
      totalNormalizedValue: 333333.33,
      earnedNormalizedValue: 333333.33,
      remainingNormalizedValue: 0,
      progressWeightedPercent: 100,
    });
  });

  it("calculates coherent global weighted progress", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);

    expect(model.totalEarnedNormalizedValue).toBe(416666.67);
    expect(model.totalRemainingNormalizedValue).toBe(583333.33);
    expect(model.progressWeightedPercent).toBe(41.67);
  });

  it("keeps global weighted progress coherent with mixed real progress sources", () => {
    const project = createProject();
    project.tasks = project.tasks.map((task) => {
      if (task.id === "1.1") {
        return { ...task, percentComplete: 40 };
      }

      if (task.id === "1.2") {
        return { ...task, percentComplete: 0, physicalPercentComplete: 20 };
      }

      if (task.id === "2.1") {
        return { ...task, percentComplete: 0, physicalPercentComplete: 0, actualEndDate: "2026-01-12T17:00:00" };
      }

      return task;
    });

    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);

    expect(model.totalEarnedNormalizedValue).toBe(500000);
    expect(model.totalRemainingNormalizedValue).toBe(500000);
    expect(model.progressWeightedPercent).toBe(50);
    expect(model.progressSourceCoverage).toEqual({
      tasksUsingPercentComplete: 1,
      tasksUsingPhysicalPercentComplete: 1,
      tasksConsideredCompletedByActualEndDate: 1,
      tasksWithoutProgressData: 0,
    });
  });

  it("exposes top pending tasks and disciplines by remaining value", () => {
    const project = createProject();
    const disciplines = buildProjectDisciplines(project);
    const model = buildProjectWeightModel(project, disciplines);

    expect(model.topTasksByRemainingValue[0]).toMatchObject({
      taskId: "1.2",
      remainingNormalizedValue: 500000,
    });
    expect(model.topDisciplinesByRemainingValue[0]).toMatchObject({
      outlineNumber: "1",
      remainingNormalizedValue: 583333.33,
    });
  });
});
