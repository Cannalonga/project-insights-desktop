import { describe, expect, it } from "vitest";

import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import {
  buildCompensationByDiscipline,
  buildOperationalCompensation,
} from "./build-operational-compensation";

function createWeightModel(): ProjectWeightModel {
  return {
    normalizedProjectValue: 1000000,
    totalEarnedNormalizedValue: 250000,
    totalRemainingNormalizedValue: 750000,
    progressWeightedPercent: 25,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 2,
      tasksUsingPhysicalPercentComplete: 1,
      tasksConsideredCompletedByActualEndDate: 0,
      tasksWithoutProgressData: 3,
    },
    taskWeights: [
      {
        taskId: "t1",
        taskName: "Task 1",
        outlineNumber: "1.1",
        disciplineName: "Civil",
        progressPercentUsed: 20,
        progressSource: "percentComplete",
        normalizedValue: 200000,
        normalizedWeightPercent: 20,
        earnedNormalizedValue: 40000,
        remainingNormalizedValue: 160000,
      },
      {
        taskId: "t2",
        taskName: "Task 2",
        outlineNumber: "1.2",
        disciplineName: "Civil",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 300000,
        normalizedWeightPercent: 30,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 300000,
      },
      {
        taskId: "t3",
        taskName: "Task 3",
        outlineNumber: "2.1",
        disciplineName: "Eletrica",
        progressPercentUsed: 100,
        progressSource: "actualEndDate",
        normalizedValue: 100000,
        normalizedWeightPercent: 10,
        earnedNormalizedValue: 100000,
        remainingNormalizedValue: 0,
      },
      {
        taskId: "t4",
        taskName: "Task 4",
        outlineNumber: "2.2",
        disciplineName: "Eletrica",
        progressPercentUsed: 10,
        progressSource: "physicalPercentComplete",
        normalizedValue: 150000,
        normalizedWeightPercent: 15,
        earnedNormalizedValue: 15000,
        remainingNormalizedValue: 135000,
      },
      {
        taskId: "t5",
        taskName: "Task 5",
        outlineNumber: "3.1",
        disciplineName: "Mecanica",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 120000,
        normalizedWeightPercent: 12,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 120000,
      },
      {
        taskId: "t6",
        taskName: "Task 6",
        outlineNumber: "3.2",
        disciplineName: "Mecanica",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 130000,
        normalizedWeightPercent: 13,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 130000,
      },
    ],
    disciplineWeights: [],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer: "Escala normalizada.",
  };
}

describe("buildOperationalCompensation", () => {
  it("selects only tasks that are not completed and still have remaining value", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.topTasks.map((task) => task.taskId)).not.toContain("t3");
    expect(result.topTasks.every((task) => task.remainingNormalizedValue > 0)).toBe(true);
  });

  it("orders tasks by remaining normalized value descending", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.topTasks.map((task) => task.taskId)).toEqual(["t2", "t1", "t4", "t6", "t5"]);
  });

  it("calculates impact percent from the normalized project value", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.topTasks[0]).toMatchObject({
      taskId: "t2",
      impactPercent: 30,
      remainingNormalizedValue: 300000,
    });
  });

  it("limits the output to the top five tasks", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.topTasks).toHaveLength(5);
  });

  it("calculates the combined impact for the top 3 tasks", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.potential.top3ImpactPercent).toBe(59.5);
  });

  it("calculates the combined impact for the top 5 tasks", () => {
    const result = buildOperationalCompensation(createWeightModel());

    expect(result.potential.top5ImpactPercent).toBe(84.5);
  });

  it("keeps the combined impact coherent when there are fewer than 3 or 5 tasks", () => {
    const result = buildOperationalCompensation({
      ...createWeightModel(),
      taskWeights: createWeightModel().taskWeights.slice(0, 2),
    });

    expect(result.topTasks).toHaveLength(2);
    expect(result.potential.top3ImpactPercent).toBe(46);
    expect(result.potential.top5ImpactPercent).toBe(46);
  });

  it("sums remaining value correctly by discipline", () => {
    const result = buildCompensationByDiscipline(createWeightModel());

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disciplineName: "Civil",
          totalRemainingValue: 460000,
          impactPercent: 46,
        }),
        expect.objectContaining({
          disciplineName: "Eletrica",
          totalRemainingValue: 135000,
          impactPercent: 13.5,
        }),
      ]),
    );
  });

  it("orders disciplines by impact descending", () => {
    const result = buildCompensationByDiscipline(createWeightModel());

    expect(result.map((discipline) => discipline.disciplineName)).toEqual([
      "Civil",
      "Mecanica",
      "Eletrica",
    ]);
  });

  it("calculates top 3 impact by discipline", () => {
    const result = buildCompensationByDiscipline(createWeightModel());
    const civil = result.find((discipline) => discipline.disciplineName === "Civil");

    expect(civil?.top3ImpactPercent).toBe(46);
    expect(civil?.top3Tasks.map((task) => task.taskId)).toEqual(["t2", "t1"]);
  });

  it("keeps discipline aggregation coherent when there are few tasks", () => {
    const result = buildCompensationByDiscipline({
      ...createWeightModel(),
      taskWeights: [
        {
          ...createWeightModel().taskWeights[0],
          disciplineName: "Civil",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      disciplineName: "Civil",
      totalRemainingValue: 160000,
      impactPercent: 16,
      top3ImpactPercent: 16,
    });
  });
});
