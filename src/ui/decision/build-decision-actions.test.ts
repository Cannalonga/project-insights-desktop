import { describe, expect, it } from "vitest";

import type { ProjectDiscipline } from "../../core/disciplines/build-project-disciplines";
import type { Project } from "../../core/model/project";
import type { AnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import type { ScheduleStatus } from "../../core/schedule/build-schedule-status";
import type { ProjectWeightModel } from "../../core/weight/build-project-weight-model";
import { buildDecisionActions } from "./build-decision-actions";

describe("buildDecisionActions", () => {
  it("groups tasks with the same operational name and keeps deterministic reasons", () => {
    const project: Project = {
      id: "project-1",
      name: "Projeto teste",
      statusDate: "2024-05-26T18:00:00",
      tasks: [
        {
          id: "1",
          name: "Recebimento frente Alfa",
          startDate: "2024-05-01",
          endDate: "2024-05-20",
          percentComplete: 40,
          physicalPercentComplete: 0,
          actualStartDate: "2024-05-03",
          actualEndDate: "",
          actualDurationHours: 0,
          actualWorkHours: 0,
          remainingWorkHours: 0,
          baselineStartDate: "2024-05-01",
          baselineEndDate: "2024-05-20",
          baselineDurationHours: 0,
          resumeDate: "",
          stopDate: "",
          duration: 10,
          outlineLevel: 3,
          outlineNumber: "1.1.1",
          isSummary: false,
          resourceIds: [],
        },
        {
          id: "2",
          name: "Recebimento frente Alfa",
          startDate: "2024-05-02",
          endDate: "2024-05-18",
          percentComplete: 20,
          physicalPercentComplete: 0,
          actualStartDate: "",
          actualEndDate: "",
          actualDurationHours: 0,
          actualWorkHours: 0,
          remainingWorkHours: 0,
          baselineStartDate: "2024-05-02",
          baselineEndDate: "2024-05-18",
          baselineDurationHours: 0,
          resumeDate: "",
          stopDate: "",
          duration: 8,
          outlineLevel: 3,
          outlineNumber: "1.1.2",
          isSummary: false,
          resourceIds: [],
        },
      ],
      resources: [],
      dependencies: [],
    };

    const disciplines: ProjectDiscipline[] = [
      {
        name: "Elétrica",
        outlineNumber: "1",
        disciplineType: "ELETRICA",
        totalTasks: 2,
        metrics: {} as ProjectDiscipline["metrics"],
        diagnostics: {} as ProjectDiscipline["diagnostics"],
        insights: {} as ProjectDiscipline["insights"],
        score: { value: 70, status: "atencao", breakdown: [], summaryMessage: "teste" },
      },
    ];

    const weightModel: ProjectWeightModel = {
      normalizedProjectValue: 1000000,
      totalEarnedNormalizedValue: 100000,
      totalRemainingNormalizedValue: 900000,
      progressWeightedPercent: 10,
      progressSourceCoverage: {
        tasksUsingPercentComplete: 2,
        tasksUsingPhysicalPercentComplete: 0,
        tasksConsideredCompletedByActualEndDate: 0,
        tasksWithoutProgressData: 0,
      },
      taskWeights: [],
      disciplineWeights: [
        {
          name: "Elétrica",
          outlineNumber: "1",
          totalNormalizedValue: 1000000,
          earnedNormalizedValue: 100000,
          remainingNormalizedValue: 900000,
          normalizedWeightPercent: 100,
          progressWeightedPercent: 10,
        },
      ],
      topTasksByRemainingValue: [],
      topDisciplinesByRemainingValue: [
        {
          name: "Elétrica",
          outlineNumber: "1",
          totalNormalizedValue: 1000000,
          earnedNormalizedValue: 100000,
          remainingNormalizedValue: 900000,
          normalizedWeightPercent: 100,
          progressWeightedPercent: 10,
        },
      ],
      disclaimer: "teste",
    };

    const analysisReliability: AnalysisReliability = {
      overallReliability: "MODERATE",
      progressReliability: "MODERATE",
      scheduleReliability: "LOW",
      dataQualityReliability: "MODERATE",
      dominantIssues: [],
      blockedConclusions: [],
      warnings: [],
      explanation: "teste",
    };

    const scheduleStatus: ScheduleStatus = {
      status: "ATRASADO",
      progressReal: 10,
      progressExpected: 20,
      gap: -10,
      explanation: "teste",
      totalWeightedTasks: 2,
      consideredWeightedTasks: 2,
      criteria: "teste",
      basedOnBaseline: true,
    };

    const actions = buildDecisionActions({
      project,
      disciplines,
      weightModel,
      analysisReliability,
      scheduleStatus,
      executiveAlerts: [{ id: "1", severity: "critical", message: "teste" }],
      compensationAnalysis: {
        topTasks: [
          {
            taskId: "1",
            name: "Recebimento frente Alfa",
            disciplineName: "Elétrica",
            remainingNormalizedValue: 300000,
            impactPercent: 30,
            progressPercent: 40,
          },
          {
            taskId: "2",
            name: "Recebimento frente Alfa",
            disciplineName: "Elétrica",
            remainingNormalizedValue: 200000,
            impactPercent: 20,
            progressPercent: 20,
          },
        ],
        potential: {
          top3ImpactPercent: 50,
          top5ImpactPercent: 50,
          message: "teste",
        },
      },
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain("(2 tarefas)");
    expect(actions[0].disciplineType).toBe("ELETRICA");
    expect(actions[0].impactPercent).toBe(50);
    expect(actions[0].confidence).toBe("medium");
    expect(actions[0].reasons).toContain("alto impacto no avanço do projeto");
    expect(actions[0].reasons).toContain("disciplina crítica no volume pendente atual");
    expect(actions[0].consequences.length).toBeGreaterThan(0);
    expect(actions[0].relatedTasks[0].delayDays).toBeGreaterThanOrEqual(0);
  });
});
