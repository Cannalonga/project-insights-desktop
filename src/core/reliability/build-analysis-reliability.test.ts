import { describe, expect, it } from "vitest";

import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import type { MPPInputQualityAssessment } from "../input-quality/build-mpp-input-quality";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildAnalysisReliability } from "./build-analysis-reliability";

function createProject(): Project {
  return {
    id: "project-1",
    name: "Projeto de teste",
    tasks: [],
    resources: [],
    dependencies: [],
  };
}

function createDiagnostics(overrides: Partial<Diagnostics> = {}): Diagnostics {
  const diagnostics: Diagnostics = {
    hasErrors: false,
    hasWarnings: false,
    hasInfo: false,
    items: [],
    errors: [],
    warnings: [],
    info: [],
  };

  return {
    ...diagnostics,
    ...overrides,
  };
}

function createDiagnosticsAggregation(
  overrides: Partial<DiagnosticsAggregation> = {},
): DiagnosticsAggregation {
  return {
    totalItems: 0,
    totalGroups: 0,
    groups: [],
    topGroups: [],
    ...overrides,
  };
}

function createInsights(overrides: Partial<ProjectInsights> = {}): ProjectInsights {
  return {
    summary: {
      status: "consistente",
      message: "Resumo",
    },
    metrics: {
      totalTasks: 100,
      totalMilestones: 0,
      totalDependencies: 0,
      totalResources: 10,
      tasksWithValidDates: 90,
      tasksWithoutDates: 10,
      tasksWithResources: 90,
      tasksWithoutResources: 10,
      tasksWithPercentComplete: 70,
      tasksWithActualDates: 60,
      tasksWithBaseline: 80,
      diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
      diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
    },
    highlights: [],
    warnings: [],
    ...overrides,
  };
}

function createWeightModel(overrides: Partial<ProjectWeightModel> = {}): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 650_000,
    totalRemainingNormalizedValue: 350_000,
    progressWeightedPercent: 65,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 55,
      tasksUsingPhysicalPercentComplete: 5,
      tasksConsideredCompletedByActualEndDate: 2,
      tasksWithoutProgressData: 18,
    },
    taskWeights: Array.from({ length: 80 }, (_, index) => ({
      taskId: `${index + 1}`,
      taskName: `Task ${index + 1}`,
      outlineNumber: `1.${index + 1}`,
      disciplineName: "Civil",
      progressPercentUsed: index < 62 ? 50 : 0,
      progressSource: index < 55 ? "percentComplete" : index < 60 ? "physicalPercentComplete" : index < 62 ? "actualEndDate" : "none",
      normalizedValue: 12_500,
      normalizedWeightPercent: 1.25,
      earnedNormalizedValue: index < 62 ? 6_250 : 0,
      remainingNormalizedValue: index < 62 ? 6_250 : 12_500,
    })),
    disciplineWeights: [],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer: "Escala normalizada.",
    ...overrides,
  };
}

function createDisciplineProgress(): DisciplineProgressAnalysis {
  return {
    disciplines: [
      {
        disciplineName: "Civil",
        outlineNumber: "1",
        averagePercentComplete: 62,
        progressWeightedPercent: 65,
        earnedNormalizedValue: 650_000,
        remainingNormalizedValue: 350_000,
        totalOperationalTasks: 80,
        completedTasks: 20,
        inProgressTasks: 42,
        notStartedTasks: 18,
        topTasksByProgressPercent: [],
        topTasksByEarnedValue: [],
        topTasksWithoutProgress: [],
      },
    ],
  };
}

function createScheduleStatus(overrides: Partial<ScheduleStatus> = {}): ScheduleStatus {
  return {
    status: "ATENCAO",
    progressReal: 65,
    progressExpected: 72,
    gap: -7,
    explanation: "Baseline valida em 60 tasks ponderadas.",
    totalWeightedTasks: 80,
    consideredWeightedTasks: 60,
    criteria: "Tasks com baseline valida.",
    basedOnBaseline: true,
    ...overrides,
  };
}

function createGapVsCompensation(overrides: Partial<GapVsCompensation> = {}): GapVsCompensation {
  return {
    gapPercent: 8,
    top3CompensationPercent: 12,
    top5CompensationPercent: 18,
    status: "recoverable",
    message: "Ha capacidade potencial de recuperacao.",
    ...overrides,
  };
}

function createInputQuality(overrides: Partial<MPPInputQualityAssessment> = {}): MPPInputQualityAssessment {
  return {
    level: "non-fatal",
    summary: "O arquivo .mpp e utilizavel, mas a base apresenta limitacoes.",
    issues: [
      {
        id: "baseline-missing",
        level: "non-fatal",
        area: "schedule",
        message: "O cronograma esta sem baseline valida.",
        reliabilityImpact: "MODERATE",
      },
    ],
    ...overrides,
  };
}

describe("buildAnalysisReliability", () => {
  it("classifies a well-covered analysis as HIGH", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics(),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
      gapVsCompensation: createGapVsCompensation(),
    });

    expect(reliability.overallReliability).toBe("HIGH");
    expect(reliability.progressReliability).toBe("HIGH");
    expect(reliability.scheduleReliability).toBe("HIGH");
    expect(reliability.dataQualityReliability).toBe("HIGH");
  });

  it("degrades to MODERATE when progress coverage is only partial", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics({
        hasWarnings: true,
        warnings: [{ id: "w1", severity: "warning", category: "data-quality", message: "Warn" }],
        items: [{ id: "w1", severity: "warning", category: "data-quality", message: "Warn" }],
      }),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          tasksWithoutResources: 28,
          tasksWithResources: 72,
        },
      }),
      weightModel: createWeightModel({
        progressSourceCoverage: {
          tasksUsingPercentComplete: 20,
          tasksUsingPhysicalPercentComplete: 4,
          tasksConsideredCompletedByActualEndDate: 4,
          tasksWithoutProgressData: 52,
        },
      }),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
    });

    expect(reliability.overallReliability).toBe("MODERATE");
    expect(reliability.progressReliability).toBe("MODERATE");
    expect(reliability.dataQualityReliability).toBe("MODERATE");
  });

  it("marks schedule reliability as LOW when baseline is absent", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics(),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          tasksWithBaseline: 0,
        },
      }),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus({
        basedOnBaseline: false,
        criteria: "Expectativa inferida sem baseline valida.",
      }),
    });

    expect(reliability.scheduleReliability).toBe("LOW");
    expect(reliability.blockedConclusions.some((item) => item.area === "schedule")).toBe(true);
  });

  it("drops data quality to CRITICAL under massive structural problems", () => {
    const error = {
      id: "task-missing-resource-reference",
      severity: "error" as const,
      category: "data-quality" as const,
      message: "Task 1 referencia resource inexistente -65535.",
    };

    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics({
        hasErrors: true,
        errors: [error],
        items: [error],
      }),
      diagnosticsAggregation: createDiagnosticsAggregation({
        totalItems: 1122,
        totalGroups: 1,
        topGroups: [
          {
            severity: "error",
            category: "data-quality",
            groupKey: "g1",
            title: "Referencias a resources inexistentes",
            normalizedMessage: "Task {taskId} referencia resource inexistente -65535.",
            count: 1122,
            affectedTaskIds: ["1"],
            sampleDiagnostics: [],
            dominantPattern: "missing-resource:-65535",
          },
        ],
        groups: [],
      }),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          totalTasks: 100,
          totalResources: 1,
          tasksWithResources: 100,
          tasksWithoutResources: 0,
        },
      }),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
    });

    expect(reliability.dataQualityReliability).toBe("CRITICAL");
    expect(reliability.overallReliability).toBe("CRITICAL");
    expect(reliability.blockedConclusions.some((item) => item.area === "data-quality")).toBe(true);
  });

  it("marks schedule as CRITICAL when date inconsistencies are massive", () => {
    const error = {
      id: "task-missing-dates",
      severity: "error" as const,
      category: "schedule" as const,
      message: "Task 1 esta sem datas suficientes para analise de cronograma.",
    };

    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics({
        hasErrors: true,
        errors: Array.from({ length: 60 }, () => error),
        items: Array.from({ length: 60 }, () => error),
      }),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          tasksWithoutDates: 50,
          tasksWithValidDates: 50,
        },
      }),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
    });

    expect(reliability.scheduleReliability).toBe("CRITICAL");
    expect(reliability.overallReliability).toBe("CRITICAL");
  });

  it("keeps strong progress with weak schedule when signals are asymmetric", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics(),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          tasksWithBaseline: 0,
        },
      }),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus({
        basedOnBaseline: false,
      }),
    });

    expect(reliability.progressReliability).toBe("HIGH");
    expect(reliability.scheduleReliability).toBe("LOW");
  });

  it("classifies the overall analysis as LOW when both prazo and qualidade are degraded", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics({
        hasErrors: true,
        errors: [{ id: "e1", severity: "error", category: "data-quality", message: "Erro estrutural" }],
        items: [{ id: "e1", severity: "error", category: "data-quality", message: "Erro estrutural" }],
      }),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights({
        metrics: {
          ...createInsights().metrics,
          tasksWithoutResources: 55,
          tasksWithResources: 45,
          tasksWithoutDates: 25,
          tasksWithValidDates: 75,
        },
      }),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus({
        consideredWeightedTasks: 20,
        totalWeightedTasks: 80,
      }),
    });

    expect(reliability.dataQualityReliability).toBe("LOW");
    expect(reliability.scheduleReliability).toBe("LOW");
    expect(reliability.overallReliability).toBe("LOW");
  });

  it("blocks gap conclusions when historical base is unavailable", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics(),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
      gapVsCompensation: createGapVsCompensation({
        status: "unavailable",
        gapPercent: undefined,
      }),
    });

    expect(reliability.blockedConclusions.some((item) => item.area === "gap-vs-compensation")).toBe(true);
  });

  it("degrades overall reliability when the input is usable but limited", () => {
    const reliability = buildAnalysisReliability({
      diagnostics: createDiagnostics(),
      diagnosticsAggregation: createDiagnosticsAggregation(),
      project: createProject(),
      insights: createInsights(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      scheduleStatus: createScheduleStatus(),
      inputQuality: createInputQuality(),
    });

    expect(reliability.overallReliability).toBe("MODERATE");
    expect(reliability.warnings[0]).toContain("utilizavel");
    expect(reliability.dominantIssues[0]?.id).toBe("input-quality:baseline-missing");
  });
});
