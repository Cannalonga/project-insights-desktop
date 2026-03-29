import { describe, expect, it } from "vitest";

import type { Diagnostics } from "../diagnostics/build-diagnostics";
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
import { exportAnalyticalCSV, exportDiagnosticsToCSV, exportInsightsToCSV, exportSCurveToCSV, exportTasksToCSV } from "./export-csv";
import { buildPowerBIPackage } from "./export-power-bi-package";
import { exportToJSON } from "./export-json";
import { exportToXML } from "./export-xml";

const project: Project = {
  id: "project-1",
  name: "Projeto Teste",
  tasks: [
    {
      id: "1",
      name: "Task 1",
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
      resourceIds: ["r1"],
    },
  ],
  resources: [{ id: "r1", name: "Equipe", type: "work" }],
  dependencies: [],
};

const diagnostics: Diagnostics = {
  hasErrors: false,
  hasWarnings: true,
  hasInfo: false,
  items: [
    {
      id: "task-missing-dates",
      severity: "warning",
      category: "schedule",
      message: "Task 1 esta sem datas suficientes para analise de cronograma.",
      taskId: "1",
      taskName: "Task 1",
    },
  ],
  errors: [],
  warnings: [
    {
      id: "task-missing-dates",
      severity: "warning",
      category: "schedule",
      message: "Task 1 esta sem datas suficientes para analise de cronograma.",
      taskId: "1",
      taskName: "Task 1",
    },
  ],
  info: [],
};

const diagnosticsAggregation: DiagnosticsAggregation = {
  totalItems: 1,
  totalGroups: 1,
  groups: [
    {
      severity: "warning",
      category: "schedule",
      groupKey: "warning|schedule|task-missing-dates|task-missing-dates",
      title: "Tasks sem datas suficientes",
      normalizedMessage: "Task {taskId} esta sem datas suficientes para analise de cronograma.",
      count: 1,
      affectedTaskIds: ["1"],
      sampleDiagnostics: [diagnostics.items[0]],
      dominantPattern: "task-missing-dates",
    },
  ],
  topGroups: [
    {
      severity: "warning",
      category: "schedule",
      groupKey: "warning|schedule|task-missing-dates|task-missing-dates",
      title: "Tasks sem datas suficientes",
      normalizedMessage: "Task {taskId} esta sem datas suficientes para analise de cronograma.",
      count: 1,
      affectedTaskIds: ["1"],
      sampleDiagnostics: [diagnostics.items[0]],
      dominantPattern: "task-missing-dates",
    },
  ],
};

const insights: ProjectInsights = {
  summary: {
    status: "atencao",
    message: "O projeto requer atencao antes de uso analitico mais confiavel.",
  },
  metrics: {
    totalTasks: 1,
    totalMilestones: 0,
    totalDependencies: 0,
    totalResources: 1,
    tasksWithValidDates: 1,
    tasksWithoutDates: 0,
    tasksWithResources: 1,
    tasksWithoutResources: 0,
    tasksWithPercentComplete: 0,
    tasksWithActualDates: 0,
    tasksWithBaseline: 0,
    diagnosticsBySeverity: { error: 0, warning: 1, info: 0 },
    diagnosticsByCategory: { structure: 0, schedule: 1, dependency: 0, "data-quality": 0 },
  },
  highlights: ["Todas as tasks possuem datas validas para analise de cronograma."],
  warnings: ["O cronograma apresenta inconsistencias de datas, duracoes ou marcos."],
};

const weightModel: ProjectWeightModel = {
  normalizedProjectValue: 1000000,
  totalEarnedNormalizedValue: 250000,
  totalRemainingNormalizedValue: 750000,
  progressWeightedPercent: 25,
  progressSourceCoverage: {
    tasksUsingPercentComplete: 1,
    tasksUsingPhysicalPercentComplete: 0,
    tasksConsideredCompletedByActualEndDate: 0,
    tasksWithoutProgressData: 0,
  },
  taskWeights: [
    {
      taskId: "1",
      taskName: "Task 1",
      outlineNumber: "1",
      progressPercentUsed: 25,
      progressSource: "percentComplete",
      normalizedValue: 1000000,
      normalizedWeightPercent: 100,
      earnedNormalizedValue: 250000,
      remainingNormalizedValue: 750000,
      disciplineName: "Disciplina A",
    },
  ],
  disciplineWeights: [
    {
      name: "Disciplina A",
      outlineNumber: "1",
      totalNormalizedValue: 1000000,
      earnedNormalizedValue: 250000,
      remainingNormalizedValue: 750000,
      normalizedWeightPercent: 100,
      progressWeightedPercent: 25,
    },
  ],
  topTasksByRemainingValue: [
    {
      taskId: "1",
      taskName: "Task 1",
      outlineNumber: "1",
      progressPercentUsed: 25,
      progressSource: "percentComplete",
      normalizedValue: 1000000,
      normalizedWeightPercent: 100,
      earnedNormalizedValue: 250000,
      remainingNormalizedValue: 750000,
      disciplineName: "Disciplina A",
    },
  ],
  topDisciplinesByRemainingValue: [
    {
      name: "Disciplina A",
      outlineNumber: "1",
      totalNormalizedValue: 1000000,
      earnedNormalizedValue: 250000,
      remainingNormalizedValue: 750000,
      normalizedWeightPercent: 100,
      progressWeightedPercent: 25,
    },
  ],
  disclaimer:
    "O valor 1.000.000 e uma escala normalizada de peso relativo do projeto. Nao representa custo real e serve apenas para interpretar impacto, valor executado, valor pendente e avanco ponderado.",
};

const score: ProjectScore = {
  value: 78,
  status: "bom",
  breakdown: [],
  summaryMessage: "O cronograma esta em bom estado.",
};

const disciplines: ProjectDiscipline[] = [
  {
    name: "Disciplina A",
    outlineNumber: "1",
    totalTasks: 1,
    metrics: insights.metrics,
    diagnostics,
    insights,
    score,
  },
];

const disciplineProgress: DisciplineProgressAnalysis = {
  disciplines: [
    {
      disciplineName: "Disciplina A",
      outlineNumber: "1",
      averagePercentComplete: 25,
      progressWeightedPercent: 25,
      earnedNormalizedValue: 250000,
      remainingNormalizedValue: 750000,
      totalOperationalTasks: 1,
      completedTasks: 0,
      inProgressTasks: 1,
      notStartedTasks: 0,
      topTasksByProgressPercent: [
        {
          taskId: "1",
          outlineNumber: "1",
          taskIdentifier: "1",
          name: "Task 1",
          disciplineName: "Disciplina A",
          progressPercent: 25,
          impactPercent: 75,
          earnedNormalizedValue: 250000,
          remainingNormalizedValue: 750000,
          status: "em-andamento",
        },
      ],
      topTasksByEarnedValue: [],
      topTasksWithoutProgress: [],
    },
  ],
};

const scheduleStatus: ScheduleStatus = {
  status: "ATENCAO",
  progressReal: 25,
  progressExpected: 35,
  gap: -10,
  explanation: "Comparacao por baseline valida.",
  totalWeightedTasks: 1,
  consideredWeightedTasks: 1,
  criteria: "Tasks com baseline valida.",
  basedOnBaseline: true,
};

const analysisReliability: AnalysisReliability = {
  overallReliability: "MODERATE",
  progressReliability: "HIGH",
  scheduleReliability: "MODERATE",
  dataQualityReliability: "MODERATE",
  dominantIssues: [],
  blockedConclusions: [],
  warnings: [],
  explanation: "A leitura de progresso e utilizavel.",
};

const sCurve: SCurveResult = {
  scopeLabel: "Projeto completo",
  timelineGranularity: "weekly",
  percentBaseValue: 120000,
  points: [
    {
      date: "2026-01-05",
      planned: 100000,
      plannedAccumulated: 100000,
      replanned: 120000,
      replannedAccumulated: 120000,
      real: 50000,
      realAccumulated: 50000,
    },
  ],
  explanation: "Curva S semanal baseada na distribuicao do peso das tasks.",
};

describe("export formats", () => {
  it("keeps the tasks CSV compatible", () => {
    const csv = exportTasksToCSV(project);

    expect(csv).toContain("id,outlineNumber,outlineLevel,parentId,name,startDate,endDate,actualStartDate,actualEndDate,baselineStartDate,baselineEndDate,percentComplete");
    expect(csv).toContain('"1","1","1","","Task 1"');
  });

  it("exports enriched JSON with diagnostics and insights", () => {
    const json = JSON.parse(
      exportToJSON({
        generatedAt: "2026-03-26T10:00:00.000Z",
        project,
        insights,
        score,
        disciplines,
        weightModel,
        compensationAnalysis: {
          topTasks: [
            {
              taskId: "1",
              name: "Task 1",
              disciplineName: "Disciplina A",
              remainingNormalizedValue: 750000,
              impactPercent: 75,
              progressPercent: 25,
            },
          ],
          potential: {
            top3ImpactPercent: 75,
            top5ImpactPercent: 75,
            message: "Executar as principais tarefas pode gerar ate 75% de avanco potencial no projeto.",
          },
        },
        compensationByDiscipline: [
          {
            disciplineName: "Disciplina A",
            totalRemainingValue: 750000,
            impactPercent: 75,
            top3Tasks: [],
            top3ImpactPercent: 75,
          },
        ],
        disciplineProgress,
        sCurve,
        scheduleStatus,
        analysisReliability,
      }),
    );

    expect(json).toMatchObject({
      schema_version: "2.0.0",
      package_type: "project_insights_export",
      project: {
        project_id: "project-1",
        project_name: "Projeto Teste",
      },
      conventions: {
        percent_scale: "0_100",
        decimal_format: "dot",
      },
      snapshot: {
        project_status_code: "PROJECT_ATTENTION",
        schedule_status_code: "ATTENTION",
        data_confidence_code: "MODERATE",
        project_score: 78,
      },
    });
    expect(json.disciplines).toHaveLength(1);
    expect(json.tasks[0]).toMatchObject({
      task_id: "1",
      task_type: "TASK",
      progress_source_code: "PERCENT_COMPLETE",
    });
    expect(json.compensation[0]).toMatchObject({
      task_id: "1",
      priority_rank: 1,
    });
  });

  it("keeps the legacy CSV builders available internally", () => {
    const diagnosticsCsv = exportDiagnosticsToCSV(diagnostics);
    const insightsCsv = exportInsightsToCSV(insights);
    const sCurveCsv = exportSCurveToCSV(sCurve);

    expect(diagnosticsCsv).toContain("id,severity,category,message,taskId,taskName");
    expect(diagnosticsCsv).toContain('"task-missing-dates","warning","schedule"');

    expect(insightsCsv).toContain("section,key,value");
    expect(insightsCsv).toContain('"metrics","totalTasks","1"');
    expect(insightsCsv).toContain('"warnings","0","O cronograma apresenta inconsistencias de datas, duracoes ou marcos."');

    expect(sCurveCsv).toContain("date,planned,plannedAccumulated,replanned,replannedAccumulated,real,realAccumulated");
    expect(sCurveCsv).toContain('"2026-01-05","100000","100000","120000","120000","50000","50000"');
  });

  it("exports one consolidated analytical CSV with typed records", () => {
    const csv = exportAnalyticalCSV({
      project,
      diagnostics,
      insights,
      weightModel,
      generatedAt: "2026-03-26T10:00:00.000Z",
      analysisReliability,
      scheduleStatus,
      disciplineProgress,
      sCurve,
    });

    expect(csv).toContain("recordType,projectName,generatedAt,statusDate,reportStatus,analysisReliability");
    expect(csv).toContain('"task","Projeto Teste","2026-03-26T10:00:00.000Z","2026-03-26T10:00:00.000Z","ATENCAO","MODERATE","1","Task 1"');
    expect(csv).toContain('"discipline","Projeto Teste","2026-03-26T10:00:00.000Z"');
    expect(csv).toContain('"curve_s_point","Projeto Teste","2026-03-26T10:00:00.000Z"');
    expect(csv).toContain('"diagnostic","Projeto Teste","2026-03-26T10:00:00.000Z"');
    expect(csv).toContain('"insight","Projeto Teste","2026-03-26T10:00:00.000Z"');
  });

  it("exports structured XML for external interoperability", () => {
    const xml = exportToXML({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      diagnostics,
      diagnosticsAggregation,
      insights,
      score,
      disciplines,
      weightModel,
      disciplineProgress,
      sCurve,
      scheduleStatus,
      analysisReliability,
      compensationAnalysis: {
        topTasks: [
          {
            taskId: "1",
            name: "Task 1",
            disciplineName: "Disciplina A",
            remainingNormalizedValue: 750000,
            impactPercent: 75,
            progressPercent: 25,
          },
        ],
        potential: {
          top3ImpactPercent: 75,
          top5ImpactPercent: 75,
          message: "Executar as principais tarefas pode gerar ate 75% de avanco potencial no projeto.",
        },
      },
      compensationByDiscipline: [
        {
          disciplineName: "Disciplina A",
          totalRemainingValue: 750000,
          impactPercent: 75,
          top3Tasks: [],
          top3ImpactPercent: 75,
        },
      ],
    });

    expect(xml).toContain("<cannaConverterExport version=\"1.0\">");
    expect(xml).toContain("<inputFormats>mpp,xml</inputFormats>");
    expect(xml).toContain("<outlineNumber>1</outlineNumber>");
    expect(xml).toContain("<analysisReliability>");
    expect(xml).toContain("<sCurve scopeLabel=\"Projeto completo\" granularity=\"weekly\">");
  });

  it("builds a tabular Power BI package without visual formatting noise", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis: {
        topTasks: [
          {
            taskId: "1",
            name: "Task 1",
            disciplineName: "Disciplina A",
            remainingNormalizedValue: 750000,
            impactPercent: 75,
            progressPercent: 25,
          },
        ],
        potential: {
          top3ImpactPercent: 75,
          top5ImpactPercent: 75,
          message: "Executar as principais tarefas pode gerar ate 75 de avanco potencial no projeto.",
        },
      },
      compensationByDiscipline: [
        {
          disciplineName: "Disciplina A",
          totalRemainingValue: 750000,
          impactPercent: 75,
          top3Tasks: [],
          top3ImpactPercent: 75,
        },
      ],
      scheduleStatus,
      analysisReliability,
    });

    expect(powerBIPackage.files).toHaveLength(6);
    expect(powerBIPackage.files[0]?.fileName).toBe("project_insights_export.json");
    expect(powerBIPackage.files.map((file) => file.fileName)).toContain("project_insights_export.json");
    expect(powerBIPackage.files.map((file) => file.fileName)).toContain("manifest.json");
    expect(powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")?.content).not.toContain("%");
    expect(powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")?.content).toContain("project_id;snapshot_id;task_snapshot_id");
  });
});
