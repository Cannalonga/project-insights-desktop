import { describe, expect, it } from "vitest";

import type { ExecutiveAlert } from "../alerts/build-executive-alerts";
import type { OperationalCompensationAnalysis, OperationalCompensationDiscipline } from "../compensation/build-operational-compensation";
import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { AnalysisReliability } from "../reliability/build-analysis-reliability";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildExecutiveReport } from "./build-executive-report";

function createProject(): Project {
  return {
    id: "p1",
    name: "Projeto Executivo",
    tasks: [
      {
        id: "root-1",
        name: "Civil",
        startDate: "2026-03-01T08:00:00",
        endDate: "2026-03-10T17:00:00",
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
        id: "t1",
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
        parentId: "root-1",
        resourceIds: ["r1"],
      },
      {
        id: "t2",
        name: "Mobilização futura",
        startDate: "2026-05-10T08:00:00",
        endDate: "2026-05-20T17:00:00",
        percentComplete: 0,
        physicalPercentComplete: 0,
        actualStartDate: "",
        actualEndDate: "",
        actualDurationHours: 0,
        actualWorkHours: 0,
        remainingWorkHours: 0,
        baselineStartDate: "2026-05-08T08:00:00",
        baselineEndDate: "2026-05-18T17:00:00",
        baselineDurationHours: 40,
        resumeDate: "",
        stopDate: "",
        duration: 40,
        outlineLevel: 2,
        outlineNumber: "1.2",
        isSummary: false,
        parentId: "root-1",
        resourceIds: ["r1"],
      },
    ],
    resources: [{ id: "r1", name: "Equipe", type: "work" }],
    dependencies: [],
  };
}

function createInsights(): ProjectInsights {
  return {
    summary: {
      status: "atencao",
      message: "Resumo",
    },
    metrics: {
      totalTasks: 10,
      totalMilestones: 1,
      totalDependencies: 2,
      totalResources: 3,
      tasksWithValidDates: 8,
      tasksWithoutDates: 2,
      tasksWithResources: 7,
      tasksWithoutResources: 3,
      tasksWithPercentComplete: 5,
      tasksWithActualDates: 4,
      tasksWithBaseline: 6,
      diagnosticsBySeverity: { error: 1, warning: 2, info: 0 },
      diagnosticsByCategory: { structure: 0, schedule: 2, dependency: 1, "data-quality": 0 },
    },
    schedulePerformance: {
      status: "ATENCAO",
      tasksDelayed: 2,
      totalTasks: 5,
      averageDelay: 3.2,
      maxDelay: 6,
      message: "Há atrasos pontuais nas tasks com dados reais de prazo.",
    },
    highlights: [],
    warnings: [],
  };
}

function createScore(): ProjectScore {
  return {
    value: 72,
    status: "atencao",
    breakdown: [],
    summaryMessage: "Resumo de score",
  };
}

function createWeightModel(): ProjectWeightModel {
  return {
    normalizedProjectValue: 1_000_000,
    totalEarnedNormalizedValue: 320_000,
    totalRemainingNormalizedValue: 680_000,
    progressWeightedPercent: 75.71,
    progressSourceCoverage: {
      tasksUsingPercentComplete: 3,
      tasksUsingPhysicalPercentComplete: 1,
      tasksConsideredCompletedByActualEndDate: 1,
      tasksWithoutProgressData: 5,
    },
    taskWeights: [
      {
        taskId: "t1",
        taskName: "Escavação",
        outlineNumber: "1.1",
        disciplineName: "Civil",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 140_000,
        normalizedWeightPercent: 14,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 140_000,
      },
      {
        taskId: "t2",
        taskName: "Mobilização futura",
        outlineNumber: "1.2",
        disciplineName: "Civil",
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 220_000,
        normalizedWeightPercent: 22,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 220_000,
      },
    ],
    disciplineWeights: [
      {
        name: "Civil",
        outlineNumber: "1",
        totalNormalizedValue: 400_000,
        earnedNormalizedValue: 100_000,
        remainingNormalizedValue: 300_000,
        normalizedWeightPercent: 40,
        progressWeightedPercent: 25,
      },
    ],
    topTasksByRemainingValue: [],
    topDisciplinesByRemainingValue: [],
    disclaimer:
      "O valor 1.000.000 é uma escala normalizada de peso relativo do projeto. Não representa custo real e serve apenas para interpretar impacto, valor executado, valor pendente e avanço ponderado.",
  };
}

function createDisciplines(): ProjectDiscipline[] {
  return [
    {
      name: "Civil",
      outlineNumber: "1",
      totalTasks: 10,
      metrics: createInsights().metrics,
      diagnostics: {
        items: [],
        errors: [],
        warnings: [],
        info: [],
        hasErrors: false,
        hasWarnings: false,
        hasInfo: false,
      },
      insights: createInsights(),
      score: {
        value: 68,
        status: "atencao",
        breakdown: [],
        summaryMessage: "x",
      },
    },
  ];
}

function createAlerts(): ExecutiveAlert[] {
  return [{ id: "a1", severity: "critical", message: "Alta incidencia de atraso nas tasks com dados reais." }];
}

function createCompensationAnalysis(): OperationalCompensationAnalysis {
  return {
    topTasks: [
      {
        taskId: "t1",
        name: "Escavacao",
        disciplineName: "Civil",
        remainingNormalizedValue: 140_000,
        impactPercent: 14,
        progressPercent: 0,
      },
    ],
    potential: {
      top3ImpactPercent: 22,
      top5ImpactPercent: 30,
      message: "Executar as principais tarefas pode gerar ate 22% de avanco potencial no projeto.",
    },
  };
}

function createCompensationByDiscipline(): OperationalCompensationDiscipline[] {
  return [
    {
      disciplineName: "Civil",
      totalRemainingValue: 300_000,
      impactPercent: 30,
      top3Tasks: [],
      top3ImpactPercent: 18,
    },
  ];
}

function createDisciplineProgress(): DisciplineProgressAnalysis {
  return {
    disciplines: [
      {
        disciplineName: "Mecânica",
        outlineNumber: "1",
        averagePercentComplete: 60.67,
        progressWeightedPercent: 75.71,
        earnedNormalizedValue: 320_000,
        remainingNormalizedValue: 680_000,
        totalOperationalTasks: 3,
        completedTasks: 1,
        inProgressTasks: 1,
        notStartedTasks: 1,
        topTasksByProgressPercent: [
          {
            taskId: "t1",
            outlineNumber: "1.3.2.1",
            taskIdentifier: "1.3.2.1",
            name: "Precipitador eletrostático",
            disciplineName: "Mecânica",
            progressPercent: 82,
            impactPercent: 1.47,
            earnedNormalizedValue: 8_500,
            remainingNormalizedValue: 1_994.45,
            status: "em-andamento",
          },
        ],
        topTasksByEarnedValue: [
          {
            taskId: "t1",
            outlineNumber: "1.3.2.1",
            taskIdentifier: "1.3.2.1",
            name: "Precipitador eletrostático",
            disciplineName: "Mecânica",
            progressPercent: 82,
            impactPercent: 1.47,
            earnedNormalizedValue: 8_500,
            remainingNormalizedValue: 1_994.45,
            status: "em-andamento",
          },
        ],
        topTasksWithoutProgress: [
          {
            taskId: "t2",
            outlineNumber: "1.3.2.2",
            taskIdentifier: "1.3.2.2",
            name: "Montagem de dutos",
            disciplineName: "Mecânica",
            progressPercent: 0,
            impactPercent: 1.05,
            earnedNormalizedValue: 0,
            remainingNormalizedValue: 10_494.45,
            status: "nao-iniciado",
          },
        ],
      },
    ],
  };
}

function createDiagnosticsAggregation(): DiagnosticsAggregation {
  return {
    totalItems: 1122,
    totalGroups: 3,
    groups: [],
    topGroups: [
      {
        severity: "error",
        category: "data-quality",
        groupKey: "error|data-quality|task-missing-resource-reference|resource-reference:-65535",
        title: "Referências a resources inexistentes",
        normalizedMessage: "Task {taskId} referencia recurso inexistente -65535.",
        count: 1122,
        affectedTaskIds: ["1", "2", "3"],
        sampleDiagnostics: [],
        dominantPattern: "missing-resource:-65535",
      },
    ],
  };
}

function createScheduleStatus(): ScheduleStatus {
  return {
    status: "ATRASADO",
    progressReal: 80.86,
    progressExpected: 92,
    gap: -11.14,
    explanation: "Comparação por baseline válida em 661 tasks com peso válido de 805.",
    totalWeightedTasks: 805,
    consideredWeightedTasks: 661,
    criteria: "Tasks com baseline válida, comparadas pela data atual.",
    basedOnBaseline: true,
  };
}

function createAnalysisReliability(): AnalysisReliability {
  return {
    overallReliability: "MODERATE",
    progressReliability: "HIGH",
    scheduleReliability: "LOW",
    dataQualityReliability: "CRITICAL",
    dominantIssues: [
      {
        id: "dq-1",
        level: "CRITICAL",
        title: "Referências massivas a resources inexistentes",
        message: "A estrutura de recursos apresenta 1122 referencias a resources inexistentes, comprometendo parte relevante da leitura.",
      },
    ],
    blockedConclusions: [
      {
        area: "schedule",
        reason: "O status de prazo não deve ser tratado como conclusão forte porque a expectativa foi inferida sem baseline válida.",
      },
    ],
    warnings: ["A qualidade de dados está criticamente comprometida por referencias massivas a resources inexistentes."],
    explanation:
      "A leitura de progresso é utilizável com boa sustentação de sinais reais. A leitura de prazo está limitada e deve ser tratada com ressalva. A qualidade de dados está criticamente comprometida.",
  };
}

function createSCurve(): SCurveResult {
  return {
    scopeLabel: "Projeto completo",
    timelineGranularity: "weekly",
    percentBaseValue: 300000,
    points: [
      {
        date: "2026-03-02",
        planned: 120000,
        plannedAccumulated: 120000,
        replanned: 100000,
        replannedAccumulated: 100000,
        real: 90000,
        realAccumulated: 90000,
      },
      {
        date: "2026-03-09",
        planned: 180000,
        plannedAccumulated: 300000,
        replanned: 150000,
        replannedAccumulated: 250000,
        real: 60000,
        realAccumulated: 150000,
      },
    ],
    explanation: "Curva S semanal baseada na distribuição do peso das tasks ao longo das datas planejadas, replanejadas e do progresso executado no recorte analisado.",
  };
}

describe("buildExecutiveReport", () => {
  it("builds standalone HTML with the main sections", () => {
    const html = buildExecutiveReport({
      project: createProject(),
      generatedAt: "2026-03-26T10:00:00.000Z",
      diagnosticsAggregation: createDiagnosticsAggregation(),
      score: createScore(),
      executiveAlerts: createAlerts(),
      insights: createInsights(),
      disciplines: createDisciplines(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      sCurve: createSCurve(),
      scheduleStatus: createScheduleStatus(),
      analysisReliability: createAnalysisReliability(),
      compensationAnalysis: createCompensationAnalysis(),
      compensationByDiscipline: createCompensationByDiscipline(),
      gapVsCompensation: {
        gapPercent: 12,
        top3CompensationPercent: 22,
        top5CompensationPercent: 30,
        status: "tight",
        message: "A recuperação depende de executar mais do que as 3 tarefas principais.",
      },
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Relatório Executivo");
    expect(html).toContain("Área do relatório");
    expect(html).toContain("Confiabilidade da análise");
    expect(html).toContain("Status do prazo");
    expect(html).toContain("Curva S");
    expect(html).toContain("Tarefas com impacto no periodo atual");
    expect(html).toContain("Avanço por disciplina");
    expect(html).toContain("<td>Mecânica</td>");
    expect(html).toContain("<td>75,71%</td>");
    expect(html).not.toContain("Disciplina MECANICA com");
    expect(html).toContain("<th>Disciplina</th>");
    expect(html).toContain("75,71%");
    expect(html).toContain("Progresso real</span><strong>80,86%");
    expect(html).toContain("Progresso esperado</span><strong>92%");
    expect(html).toContain("Gap</span><strong>-11,14%");
    expect(html).toContain("Confiabilidade geral</span><strong>MODERATE");
    expect(html).toContain("Mar/26");
    expect(html).toContain("Planejado acum.");
    expect(html).toContain("Real acum.");
    expect(html).toContain("Vermelho:</strong> real acumulado");
    expect(html).toContain("Série semanal detalhada");
    expect(html).toContain("Impacto da disciplina no avanço do projeto");
    expect(html).toContain("A disciplina representa 30% do avanço total do recorte analisado.");
    expect(html).toContain("As 3 tasks com maior contribuição dentro da disciplina representam 18% do avanço total.");
    expect(html).toContain('<span class="task-name">Escavação</span>');
    expect(html).toContain('<span class="task-subline">1.1</span>');
    expect(html).toContain("<td>100%</td>");
    expect(html).toContain("<td>0%</td>");
    expect(html).toContain('class="gap-negative">-100%');
    expect(html).toContain('class="impact-negative">14%');
    expect(html).not.toContain("Mobilização futura");
    expect(html).not.toContain("Gap vs compensação");
    expect(html).not.toContain("Alertas executivos");
    expect(html).not.toContain("Diagnostics consolidados");
    expect(html).not.toContain("Problema prioritario");
    expect(html).not.toContain("Top 3 compensacao");
    expect(html).toContain("O valor 1.000.000 é uma escala normalizada");
  });

  it("keeps the executive view free of historical compensation blocks when base is unavailable", () => {
    const html = buildExecutiveReport({
      project: createProject(),
      generatedAt: "2026-03-26T10:00:00.000Z",
      diagnosticsAggregation: createDiagnosticsAggregation(),
      score: createScore(),
      executiveAlerts: createAlerts(),
      insights: createInsights(),
      disciplines: createDisciplines(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      sCurve: createSCurve(),
      scheduleStatus: createScheduleStatus(),
      analysisReliability: createAnalysisReliability(),
      compensationAnalysis: createCompensationAnalysis(),
      compensationByDiscipline: createCompensationByDiscipline(),
    });

    expect(html).not.toContain("Gap vs compensacao");
    expect(html).not.toContain("Ainda nao ha base historica suficiente");
    expect(html).toContain("Projeto Executivo");
    expect(html).toContain("Escavação");
  });

  it("falls back to a usable name when project name is not available", () => {
    const html = buildExecutiveReport({
      project: {
        ...createProject(),
        name: "Sem nome",
      },
      generatedAt: "2026-03-26T10:00:00.000Z",
      diagnosticsAggregation: createDiagnosticsAggregation(),
      score: createScore(),
      executiveAlerts: createAlerts(),
      insights: createInsights(),
      disciplines: createDisciplines(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      sCurve: createSCurve(),
      scheduleStatus: createScheduleStatus(),
      analysisReliability: createAnalysisReliability(),
      compensationAnalysis: createCompensationAnalysis(),
      compensationByDiscipline: createCompensationByDiscipline(),
    });

    expect(html).not.toContain("Sem nome");
    expect(html).toContain(">Civil<");
  });

  it("escapes dynamic content and blocks script execution in the exported html", () => {
    const maliciousTaskName = `<img src=x onerror=alert(1)>`;
    const html = buildExecutiveReport({
      project: {
        ...createProject(),
        name: `<script>alert("x")</script>`,
        tasks: createProject().tasks.map((task) =>
          task.id === "t1"
            ? {
                ...task,
                name: maliciousTaskName,
              }
            : task,
        ),
      },
      generatedAt: "2026-03-26T10:00:00.000Z",
      diagnosticsAggregation: createDiagnosticsAggregation(),
      score: createScore(),
      executiveAlerts: createAlerts(),
      insights: createInsights(),
      disciplines: createDisciplines(),
      weightModel: createWeightModel(),
      disciplineProgress: createDisciplineProgress(),
      sCurve: createSCurve(),
      scheduleStatus: createScheduleStatus(),
      analysisReliability: createAnalysisReliability(),
      compensationAnalysis: createCompensationAnalysis(),
      compensationByDiscipline: createCompensationByDiscipline(),
    });

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(\"x\")</script>");
    expect(html).not.toContain(maliciousTaskName);
  });
});
