import { describe, expect, it } from "vitest";

import type { ProcessResult } from "./process-mpp";
import { buildExecutiveReportForScope } from "./build-executive-report-scope";
import { buildExecutivePdfReportForScope } from "./build-executive-pdf-report-scope";

function createResult(): ProcessResult {
  return {
    generatedAt: "2026-03-26T10:00:00.000Z",
    model: {
      id: "project-1",
      name: "Sem nome",
      tasks: [
        {
          id: "1",
          name: "Civil",
          startDate: "2026-03-01T08:00:00",
          endDate: "2026-03-30T17:00:00",
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
          duration: 0,
          outlineLevel: 1,
          outlineNumber: "1",
          isSummary: true,
          resourceIds: [],
        },
        {
          id: "1.1",
          name: "Escavação",
          startDate: "2026-03-01T08:00:00",
          endDate: "2026-03-10T17:00:00",
          percentComplete: 50,
          physicalPercentComplete: 0,
          actualStartDate: "",
          actualEndDate: "",
          actualDurationHours: 0,
          actualWorkHours: 0,
          remainingWorkHours: 0,
          baselineStartDate: "2026-03-01T08:00:00",
          baselineEndDate: "2026-03-10T17:00:00",
          baselineDurationHours: 72,
          resumeDate: "",
          stopDate: "",
          duration: 72,
          outlineLevel: 2,
          outlineNumber: "1.1",
          isSummary: false,
          parentId: "1",
          resourceIds: ["r1"],
        },
        {
          id: "2",
          name: "Mecânica",
          startDate: "2026-03-01T08:00:00",
          endDate: "2026-03-30T17:00:00",
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
          duration: 0,
          outlineLevel: 1,
          outlineNumber: "2",
          isSummary: true,
          resourceIds: [],
        },
        {
          id: "2.1",
          name: "Montagem",
          startDate: "2026-03-05T08:00:00",
          endDate: "2026-03-15T17:00:00",
          percentComplete: 0,
          physicalPercentComplete: 0,
          actualStartDate: "",
          actualEndDate: "",
          actualDurationHours: 0,
          actualWorkHours: 0,
          remainingWorkHours: 0,
          baselineStartDate: "2026-03-05T08:00:00",
          baselineEndDate: "2026-03-15T17:00:00",
          baselineDurationHours: 80,
          resumeDate: "",
          stopDate: "",
          duration: 80,
          outlineLevel: 2,
          outlineNumber: "2.1",
          isSummary: false,
          parentId: "2",
          resourceIds: ["r2"],
        },
      ],
      resources: [
        { id: "r1", name: "Equipe Civil", type: "work" },
        { id: "r2", name: "Equipe Mecânica", type: "work" },
      ],
      dependencies: [],
    },
    diagnostics: {
      hasErrors: false,
      hasWarnings: false,
      hasInfo: false,
      items: [],
      errors: [],
      warnings: [],
      info: [],
    },
    diagnosticsAggregation: {
      totalItems: 0,
      totalGroups: 0,
      groups: [],
      topGroups: [],
    },
    json: "{}",
    structuredXml: "<xml />",
    csv: "",
    insights: {
      summary: {
        status: "consistente",
        message: "Resumo",
      },
      metrics: {
        totalTasks: 4,
        totalMilestones: 0,
        totalDependencies: 0,
        totalResources: 2,
        tasksWithValidDates: 4,
        tasksWithoutDates: 0,
        tasksWithResources: 2,
        tasksWithoutResources: 2,
        tasksWithPercentComplete: 1,
        tasksWithActualDates: 0,
        tasksWithBaseline: 2,
        diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
        diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
      },
      highlights: [],
      warnings: [],
    },
    score: {
      value: 82,
      status: "bom",
      breakdown: [],
      summaryMessage: "Resumo",
    },
    disciplines: [
      {
        name: "Civil",
        outlineNumber: "1",
        totalTasks: 2,
        metrics: {
          totalTasks: 2,
          totalMilestones: 0,
          totalDependencies: 0,
          totalResources: 1,
          tasksWithValidDates: 2,
          tasksWithoutDates: 0,
          tasksWithResources: 1,
          tasksWithoutResources: 1,
          tasksWithPercentComplete: 1,
          tasksWithActualDates: 0,
          tasksWithBaseline: 1,
          diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
          diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
        },
        diagnostics: {
          hasErrors: false,
          hasWarnings: false,
          hasInfo: false,
          items: [],
          errors: [],
          warnings: [],
          info: [],
        },
        insights: {
          summary: {
            status: "consistente",
            message: "Resumo",
          },
          metrics: {
            totalTasks: 2,
            totalMilestones: 0,
            totalDependencies: 0,
            totalResources: 1,
            tasksWithValidDates: 2,
            tasksWithoutDates: 0,
            tasksWithResources: 1,
            tasksWithoutResources: 1,
            tasksWithPercentComplete: 1,
            tasksWithActualDates: 0,
            tasksWithBaseline: 1,
            diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
            diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
          },
          highlights: [],
          warnings: [],
        },
        score: {
          value: 84,
          status: "bom",
          breakdown: [],
          summaryMessage: "Resumo",
        },
      },
      {
        name: "Mecânica",
        outlineNumber: "2",
        totalTasks: 2,
        metrics: {
          totalTasks: 2,
          totalMilestones: 0,
          totalDependencies: 0,
          totalResources: 1,
          tasksWithValidDates: 2,
          tasksWithoutDates: 0,
          tasksWithResources: 1,
          tasksWithoutResources: 1,
          tasksWithPercentComplete: 0,
          tasksWithActualDates: 0,
          tasksWithBaseline: 1,
          diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
          diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
        },
        diagnostics: {
          hasErrors: false,
          hasWarnings: false,
          hasInfo: false,
          items: [],
          errors: [],
          warnings: [],
          info: [],
        },
        insights: {
          summary: {
            status: "atencao",
            message: "Resumo",
          },
          metrics: {
            totalTasks: 2,
            totalMilestones: 0,
            totalDependencies: 0,
            totalResources: 1,
            tasksWithValidDates: 2,
            tasksWithoutDates: 0,
            tasksWithResources: 1,
            tasksWithoutResources: 1,
            tasksWithPercentComplete: 0,
            tasksWithActualDates: 0,
            tasksWithBaseline: 1,
            diagnosticsBySeverity: { error: 0, warning: 0, info: 0 },
            diagnosticsByCategory: { structure: 0, schedule: 0, dependency: 0, "data-quality": 0 },
          },
          highlights: [],
          warnings: [],
        },
        score: {
          value: 78,
          status: "bom",
          breakdown: [],
          summaryMessage: "Resumo",
        },
      },
    ],
    weightModel: {
      normalizedProjectValue: 1_000_000,
      totalEarnedNormalizedValue: 236_065.57,
      totalRemainingNormalizedValue: 763_934.43,
      progressWeightedPercent: 23.61,
      progressSourceCoverage: {
        tasksUsingPercentComplete: 1,
        tasksUsingPhysicalPercentComplete: 0,
        tasksConsideredCompletedByActualEndDate: 0,
        tasksWithoutProgressData: 1,
      },
      taskWeights: [],
      disciplineWeights: [
        {
          name: "Civil",
          outlineNumber: "1",
          totalNormalizedValue: 473_770.49,
          earnedNormalizedValue: 236_885.25,
          remainingNormalizedValue: 236_885.24,
          normalizedWeightPercent: 47.38,
          progressWeightedPercent: 50,
        },
        {
          name: "Mecânica",
          outlineNumber: "2",
          totalNormalizedValue: 526_229.51,
          earnedNormalizedValue: 0,
          remainingNormalizedValue: 526_229.51,
          normalizedWeightPercent: 52.62,
          progressWeightedPercent: 0,
        },
      ],
      topTasksByRemainingValue: [],
      topDisciplinesByRemainingValue: [],
      disclaimer: "Escala normalizada.",
    },
    compensationAnalysis: {
      topTasks: [],
      potential: {
        top3ImpactPercent: 0,
        top5ImpactPercent: 0,
        message: "x",
      },
    },
    compensationByDiscipline: [],
    executiveAlerts: [],
    executiveReportHtml: "<html></html>",
  };
}

describe("buildExecutiveReportForScope", () => {
  it("builds a discipline-scoped report with filtered universe and fallback name", () => {
    const html = buildExecutiveReportForScope(createResult(), {
      kind: "discipline",
      outlineNumber: "1",
    });

    expect(html).toContain(">Civil<");
    expect(html).toContain("Escavação");
    expect(html).not.toContain("\uFFFD");
    expect(html).not.toContain("Montagem");
    expect(html).not.toContain("Gap vs compensação");
    expect(html).not.toContain("Diagnostics consolidados");
    expect(html).not.toContain("Sem nome");
  });

  it("builds a compact PDF-oriented executive report without duplicating scope calculations", () => {
    const html = buildExecutivePdfReportForScope(createResult(), {
      kind: "global",
    });

    expect(html).toContain("RELATORIO EXECUTIVO");
    expect(html).toContain("Mecânica");
    expect(html).not.toContain("\uFFFD");
    expect(html).toContain("COMPENSACAO OPERACIONAL");
    expect(html).toContain("DISCIPLINAS");
    expect(html).not.toContain("Curva S");
  });
});

