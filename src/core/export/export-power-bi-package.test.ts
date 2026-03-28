import { describe, expect, it } from "vitest";

import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { OperationalCompensationAnalysis, OperationalCompensationDiscipline } from "../compensation/build-operational-compensation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";
import { buildPowerBIPackage } from "./export-power-bi-package";

function parseCsvLine(line: string): string[] {
  return line.split(";").map((value) => value.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

function getRowByFileName(content: string): Record<string, string> {
  const [headerLine, dataLine] = content.split("\n");
  const headers = parseCsvLine(headerLine);
  const values = parseCsvLine(dataLine);

  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

function getRowByColumnValue(content: string, columnName: string, expectedValue: string): Record<string, string> {
  const [headerLine, ...dataLines] = content.split("\n");
  const headers = parseCsvLine(headerLine);
  const columnIndex = headers.indexOf(columnName);
  const dataLine = dataLines.find((line) => parseCsvLine(line)[columnIndex] === expectedValue);

  if (!dataLine) {
    throw new Error(`Row not found for ${columnName}=${expectedValue}`);
  }

  const values = parseCsvLine(dataLine);
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

const project: Project = {
  id: "project-1",
  name: "Projeto BI",
  statusDate: "2026-01-20T00:00:00.000Z",
  tasks: [
    {
      id: "root",
      name: "Projeto BI",
      startDate: "2026-01-01T08:00:00",
      endDate: "2026-02-10T17:00:00",
      percentComplete: 0,
      physicalPercentComplete: 0,
      actualStartDate: "",
      actualEndDate: "",
      actualDurationHours: 0,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      baselineStartDate: "2026-01-01T08:00:00",
      baselineEndDate: "2026-02-10T17:00:00",
      baselineDurationHours: 200,
      resumeDate: "",
      stopDate: "",
      duration: 200,
      outlineLevel: 1,
      outlineNumber: "1",
      isSummary: true,
      resourceIds: [],
    },
    {
      id: "civil-summary",
      name: "Civil",
      startDate: "2026-01-01T08:00:00",
      endDate: "2026-01-15T17:00:00",
      percentComplete: 0,
      physicalPercentComplete: 0,
      actualStartDate: "",
      actualEndDate: "",
      actualDurationHours: 0,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      baselineStartDate: "2026-01-01T08:00:00",
      baselineEndDate: "2026-01-15T17:00:00",
      baselineDurationHours: 100,
      resumeDate: "",
      stopDate: "",
      duration: 100,
      outlineLevel: 2,
      outlineNumber: "1.1",
      isSummary: true,
      parentId: "root",
      resourceIds: [],
    },
    {
      id: "t1",
      name: "Escavação",
      startDate: "2026-01-01T08:00:00",
      endDate: "2026-01-10T17:00:00",
      percentComplete: 40,
      physicalPercentComplete: 30,
      actualStartDate: "2026-01-02T08:00:00",
      actualEndDate: "",
      actualDurationHours: 16,
      actualWorkHours: 24,
      remainingWorkHours: 36,
      baselineStartDate: "2026-01-01T08:00:00",
      baselineEndDate: "2026-01-09T17:00:00",
      baselineDurationHours: 72,
      resumeDate: "",
      stopDate: "",
      duration: 72,
      outlineLevel: 3,
      outlineNumber: "1.1.1",
      isSummary: false,
      parentId: "civil-summary",
      resourceIds: ["r1"],
    },
    {
      id: "electrical-summary",
      name: "Elétrica",
      startDate: "2026-01-16T08:00:00",
      endDate: "2026-02-10T17:00:00",
      percentComplete: 0,
      physicalPercentComplete: 0,
      actualStartDate: "",
      actualEndDate: "",
      actualDurationHours: 0,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      baselineStartDate: "2026-01-16T08:00:00",
      baselineEndDate: "2026-02-10T17:00:00",
      baselineDurationHours: 100,
      resumeDate: "",
      stopDate: "",
      duration: 100,
      outlineLevel: 2,
      outlineNumber: "1.2",
      isSummary: true,
      parentId: "root",
      resourceIds: [],
    },
    {
      id: "t2",
      name: "Lançamento de cabos",
      startDate: "2026-01-16T08:00:00",
      endDate: "2026-02-05T17:00:00",
      percentComplete: 20,
      physicalPercentComplete: 10,
      actualStartDate: "2026-01-18T08:00:00",
      actualEndDate: "",
      actualDurationHours: 12,
      actualWorkHours: 20,
      remainingWorkHours: 40,
      baselineStartDate: "2026-01-16T08:00:00",
      baselineEndDate: "2026-02-01T17:00:00",
      baselineDurationHours: 80,
      resumeDate: "",
      stopDate: "",
      duration: 80,
      outlineLevel: 3,
      outlineNumber: "1.2.1",
      isSummary: false,
      parentId: "electrical-summary",
      resourceIds: ["r1"],
    },
  ],
  resources: [{ id: "r1", name: "Equipe", type: "work" }],
  dependencies: [{ id: "d1", fromTaskId: "t1", toTaskId: "t2", type: "FS" }],
};

const insights: ProjectInsights = {
  summary: { status: "atencao", message: "Resumo" },
  metrics: {
    totalTasks: 5,
    totalMilestones: 0,
    totalDependencies: 1,
    totalResources: 1,
    tasksWithValidDates: 5,
    tasksWithoutDates: 0,
    tasksWithResources: 2,
    tasksWithoutResources: 3,
    tasksWithPercentComplete: 2,
    tasksWithActualDates: 2,
    tasksWithBaseline: 5,
    diagnosticsBySeverity: { error: 0, warning: 1, info: 0 },
    diagnosticsByCategory: { structure: 0, schedule: 1, dependency: 0, "data-quality": 0 },
  },
  highlights: [],
  warnings: [],
};

const score: ProjectScore = {
  value: 82,
  status: "bom",
  breakdown: [],
  summaryMessage: "Resumo",
};

const disciplines: ProjectDiscipline[] = [
  {
    name: "Projeto BI",
    disciplineType: "CIVIL",
    outlineNumber: "1",
    totalTasks: 4,
    metrics: insights.metrics,
    diagnostics: {
      items: [],
      errors: [],
      warnings: [{ id: "w1", severity: "warning", category: "schedule", message: "Aviso" }],
      info: [],
      hasErrors: false,
      hasWarnings: true,
      hasInfo: false,
    },
    insights,
    score,
  },
];

const weightModel: ProjectWeightModel = {
  normalizedProjectValue: 1000000,
  totalEarnedNormalizedValue: 320000,
  totalRemainingNormalizedValue: 680000,
  progressWeightedPercent: 32,
  progressSourceCoverage: {
    tasksUsingPercentComplete: 2,
    tasksUsingPhysicalPercentComplete: 0,
    tasksConsideredCompletedByActualEndDate: 0,
    tasksWithoutProgressData: 0,
  },
  taskWeights: [
    {
      taskId: "t1",
      taskName: "Escavação",
      outlineNumber: "1.1.1",
      disciplineName: "Projeto BI",
      progressPercentUsed: 40,
      progressSource: "percentComplete",
      normalizedValue: 600000,
      normalizedWeightPercent: 60,
      earnedNormalizedValue: 240000,
      remainingNormalizedValue: 360000,
    },
    {
      taskId: "t2",
      taskName: "Lançamento de cabos",
      outlineNumber: "1.2.1",
      disciplineName: "Projeto BI",
      progressPercentUsed: 20,
      progressSource: "percentComplete",
      normalizedValue: 400000,
      normalizedWeightPercent: 40,
      earnedNormalizedValue: 80000,
      remainingNormalizedValue: 320000,
    },
  ],
  disciplineWeights: [
    {
      name: "Projeto BI",
      outlineNumber: "1",
      totalNormalizedValue: 1000000,
      earnedNormalizedValue: 320000,
      remainingNormalizedValue: 680000,
      normalizedWeightPercent: 100,
      progressWeightedPercent: 32,
    },
  ],
  topTasksByRemainingValue: [],
  topDisciplinesByRemainingValue: [],
  disclaimer: "Escala normalizada.",
};

const compensationAnalysis: OperationalCompensationAnalysis = {
  topTasks: [
    {
      taskId: "t1",
      name: "Escavação",
      disciplineName: "Projeto BI",
      impactPercent: 36,
      remainingNormalizedValue: 360000,
      progressPercent: 40,
    },
    {
      taskId: "t2",
      name: "Lançamento de cabos",
      disciplineName: "Projeto BI",
      impactPercent: 32,
      remainingNormalizedValue: 320000,
      progressPercent: 20,
    },
  ],
  potential: {
    top3ImpactPercent: 68,
    top5ImpactPercent: 68,
    message: "Executar as principais tarefas pode gerar ate 68 de avanco potencial no projeto.",
  },
};

const compensationByDiscipline: OperationalCompensationDiscipline[] = [
  {
    disciplineName: "Projeto BI",
    totalRemainingValue: 680000,
    impactPercent: 68,
    top3Tasks: compensationAnalysis.topTasks,
    top3ImpactPercent: 68,
  },
];

const scheduleStatus: ScheduleStatus = {
  status: "ATENCAO",
  progressReal: 32,
  progressExpected: 52,
  gap: -20,
  explanation: "Resumo",
  totalWeightedTasks: 1,
  consideredWeightedTasks: 1,
  criteria: "Criteria",
  basedOnBaseline: true,
};

describe("buildPowerBIPackage", () => {
  it("generates the 4 fact files and manifest with stable keys", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
      gapVsCompensation: {
        gapPercent: 12,
        top3CompensationPercent: 60,
        top5CompensationPercent: 60,
        status: "tight",
        message: "msg",
      } satisfies GapVsCompensation,
    });

    expect(powerBIPackage.files.map((file) => file.fileName)).toEqual([
      "fact_tasks.csv",
      "fact_disciplines.csv",
      "fact_snapshots.csv",
      "fact_compensation.csv",
      "manifest.json",
    ]);
    expect(powerBIPackage.projectId).toBe("project-1");
    expect(powerBIPackage.snapshotId).toBe("snapshot-20260326t100000000z");
  });

  it.skip("exports clean tabular columns without UI symbols", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const tasksCsv = powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content;
    const disciplinesCsv = powerBIPackage.files.find((file) => file.fileName === "fact_disciplines.csv")!.content;
    const snapshotsCsv = powerBIPackage.files.find((file) => file.fileName === "fact_snapshots.csv")!.content;
    const compensationCsv = powerBIPackage.files.find((file) => file.fileName === "fact_compensation.csv")!.content;

    expect(tasksCsv).toContain("project_id;snapshot_id;task_snapshot_id;task_id;discipline_id;discipline_snapshot_id;task_name;discipline_type;discipline_name");
    expect(tasksCsv).toContain('"project-1";"snapshot-20260326t100000000z";"snapshot-20260326t100000000z::t1";"t1";"discipline-project-1-civil-summary";"snapshot-20260326t100000000z::discipline-project-1-civil-summary";"Escavação";"CIVIL";"Civil"');
    expect(tasksCsv).toContain('"project-1";"snapshot-20260326t100000000z";"snapshot-20260326t100000000z::t2";"t2";"discipline-project-1-electrical-summary";"snapshot-20260326t100000000z::discipline-project-1-electrical-summary";"Lançamento de cabos";"ELETRICA";"Elétrica"');
    expect(tasksCsv).not.toContain("%");
    expect(tasksCsv).not.toContain("R$");

    expect(disciplinesCsv).toContain("discipline_snapshot_id;discipline_id;discipline_type;discipline_name;discipline_outline_number;score_value;score_status;discipline_progress_weighted_percent;discipline_progress_band");
    expect(disciplinesCsv).toContain('"project-1";"snapshot-20260326t100000000z";"snapshot-20260326t100000000z::discipline-project-1-civil-summary";"discipline-project-1-civil-summary";"CIVIL";"Civil";"1.1"');
    expect(disciplinesCsv).toContain('"project-1";"snapshot-20260326t100000000z";"snapshot-20260326t100000000z::discipline-project-1-electrical-summary";"discipline-project-1-electrical-summary";"ELETRICA";"Elétrica";"1.2"');

    expect(snapshotsCsv).toContain("project_gap_percent;project_progress_gap_percent;gap_status");
    expect(snapshotsCsv).toContain('"project-1";"snapshot-20260326t100000000z";"2026-03-26T10:00:00.000Z";"Projeto BI"');

    expect(compensationCsv).toContain("task_snapshot_id;discipline_id;discipline_snapshot_id;priority_rank;task_id;task_name;discipline_type;discipline_name");
    expect(compensationCsv).toContain('"project-1";"snapshot-20260326t100000000z";"snapshot-20260326t100000000z::t1";"discipline-project-1-civil-summary";"snapshot-20260326t100000000z::discipline-project-1-civil-summary";"1";"t1";"Escavação";"CIVIL";"Civil";"36"');
  });

  it("keeps nullable gap fields blank when gap data does not exist", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
    });

    const snapshotsCsv = powerBIPackage.files.find((file) => file.fileName === "fact_snapshots.csv")!.content;
    const snapshotLine = snapshotsCsv.split("\n")[1];

    expect(snapshotLine.endsWith('"";"";""') || snapshotLine.includes(';"";""')).toBe(true);
  });

  it("exports normalized discipline names consistently across facts without changing ids", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: {
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === "civil-summary"
            ? {
                ...task,
                name: "  Mecânica  ",
              }
            : task.id === "electrical-summary"
              ? {
                  ...task,
                  name: "Elétrica",
                }
              : task,
        ),
      },
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const tasksCsv = powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content;
    const disciplinesCsv = powerBIPackage.files.find((file) => file.fileName === "fact_disciplines.csv")!.content;
    const compensationCsv = powerBIPackage.files.find((file) => file.fileName === "fact_compensation.csv")!.content;

    const taskRow1 = getRowByColumnValue(tasksCsv, "task_id", "t1");
    const taskRow2 = getRowByColumnValue(tasksCsv, "task_id", "t2");
    const disciplineRow1 = getRowByColumnValue(disciplinesCsv, "discipline_id", "discipline-project-1-civil-summary");
    const disciplineRow2 = getRowByColumnValue(
      disciplinesCsv,
      "discipline_id",
      "discipline-project-1-electrical-summary",
    );
    const compensationRow1 = getRowByColumnValue(compensationCsv, "task_id", "t1");
    const compensationRow2 = getRowByColumnValue(compensationCsv, "task_id", "t2");

    expect(taskRow1.discipline_id).toBe("discipline-project-1-civil-summary");
    expect(taskRow2.discipline_id).toBe("discipline-project-1-electrical-summary");
    expect(taskRow1.discipline_name).toBe("MECANICA");
    expect(taskRow2.discipline_name).toBe("ELETRICA");
    expect(disciplineRow1.discipline_name).toBe("MECANICA");
    expect(disciplineRow2.discipline_name).toBe("ELETRICA");
    expect(compensationRow1.discipline_name).toBe("MECANICA");
    expect(compensationRow2.discipline_name).toBe("ELETRICA");
  });

  it("keeps compensation export aligned with the existing ranking and discipline facts", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const compensationCsv = powerBIPackage.files.find((file) => file.fileName === "fact_compensation.csv")!.content;
    const disciplineCsv = powerBIPackage.files.find((file) => file.fileName === "fact_disciplines.csv")!.content;
    const disciplineRow = getRowByFileName(disciplineCsv);

    expect(compensationCsv.indexOf('"snapshot-20260326t100000000z::t1";"discipline-project-1-civil-summary"')).toBeGreaterThan(0);
    expect(disciplineRow.discipline_id).toBe("discipline-project-1-civil-summary");
    expect(disciplineRow.discipline_type).toBe("CIVIL");
    expect(disciplineRow.discipline_name).toBe("CIVIL");
    expect(disciplineRow.discipline_progress_weighted_percent).toBe("40");
    expect(disciplineRow.discipline_progress_band).toBe("MEDIUM");
    expect(disciplineRow.discipline_remaining_weight_percent).toBe("60");
    expect(disciplineRow.discipline_impact_percent).toBe("36");
    expect(disciplineRow.discipline_impact_band).toBe("MEDIUM");
    expect(disciplineRow.priority_rank).toBe("1");
    expect(disciplineRow.impact_rank).toBe("1");
    expect(disciplineRow.warnings_count).toBe("0");
    expect(disciplineRow.errors_count).toBe("0");
  });

  it("exports BI-ready flags, bands and derived metrics without decorative formatting", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const tasksCsv = powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content;
    const compensationCsv = powerBIPackage.files.find((file) => file.fileName === "fact_compensation.csv")!.content;
    const manifest = powerBIPackage.files.find((file) => file.fileName === "manifest.json")!.content;

    const taskRow = getRowByColumnValue(tasksCsv, "task_id", "t1");
    const compensationRow = getRowByColumnValue(compensationCsv, "task_id", "t1");

    expect(taskRow.task_snapshot_id).toBe("snapshot-20260326t100000000z::t1");
    expect(taskRow.discipline_id).toBe("discipline-project-1-civil-summary");
    expect(taskRow.discipline_snapshot_id).toBe("snapshot-20260326t100000000z::discipline-project-1-civil-summary");
    expect(taskRow.progress_source).toBe("percentComplete");
    expect(taskRow.progress_percent_used).toBe("40");
    expect(taskRow.progress_gap_percent).toBe("0");
    expect(taskRow.progress_band).toBe("MEDIUM");
    expect(taskRow.remaining_weight_percent).toBe("60");
    expect(taskRow.impact_percent).toBe("36");
    expect(taskRow.impact_band).toBe("MEDIUM");
    expect(taskRow.is_delayed).toBe("true");
    expect(taskRow.has_progress).toBe("true");
    expect(taskRow.has_baseline).toBe("true");
    expect(taskRow.has_actual_dates).toBe("true");
    expect(taskRow.delay_days).toBe("10,17");
    expect(taskRow.priority_rank).toBe("1");
    expect(taskRow.impact_rank).toBe("1");

    expect(compensationRow.task_snapshot_id).toBe("snapshot-20260326t100000000z::t1");
    expect(compensationRow.discipline_id).toBe("discipline-project-1-civil-summary");
    expect(compensationRow.discipline_snapshot_id).toBe("snapshot-20260326t100000000z::discipline-project-1-civil-summary");
    expect(compensationRow.impact_band).toBe("MEDIUM");
    expect(compensationRow.remaining_weight_percent).toBe("60");
    expect(compensationRow.progress_band).toBe("MEDIUM");
    expect(compensationRow.progress_gap_percent).toBe("0");
    expect(compensationRow.is_delayed).toBe("true");
    expect(compensationRow.has_progress).toBe("true");
    expect(compensationRow.has_baseline).toBe("true");
    expect(compensationRow.has_actual_dates).toBe("true");
    expect(compensationRow.delay_days).toBe("10,17");
    expect(compensationRow.impact_rank).toBe("1");
    expect(manifest).toContain('"percent_scale": "0-100"');
    expect(manifest).toContain('"fact_disciplines": "one row per discipline per snapshot"');
    expect(manifest).toContain('"discipline_snapshot_id": "fact_tasks.discipline_snapshot_id <-> fact_disciplines.discipline_snapshot_id"');
    expect(manifest).toContain('"version": "1.1"');
    expect(manifest).not.toContain("%");
  });

  it("keeps snapshot and scoped relationship keys unique and within percent bounds", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
      gapVsCompensation: {
        gapPercent: 12,
        top3CompensationPercent: 60,
        top5CompensationPercent: 60,
        status: "tight",
        message: "msg",
      } satisfies GapVsCompensation,
    });

    const snapshotRow = getRowByFileName(
      powerBIPackage.files.find((file) => file.fileName === "fact_snapshots.csv")!.content,
    );
    const taskRow = getRowByColumnValue(
      powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content,
      "task_id",
      "t1",
    );

    expect(snapshotRow.snapshot_id).toBe("snapshot-20260326t100000000z");
    expect(snapshotRow.project_progress_weighted_percent).toBe("32");
    expect(snapshotRow.project_progress_gap_percent).toBe("-20");
    expect(snapshotRow.project_gap_percent).toBe("12");

    expect(Number(taskRow.percent_complete)).toBeGreaterThanOrEqual(0);
    expect(Number(taskRow.percent_complete)).toBeLessThanOrEqual(100);
    expect(Number(taskRow.progress_percent_used)).toBeGreaterThanOrEqual(0);
    expect(Number(taskRow.progress_percent_used)).toBeLessThanOrEqual(100);
    expect(Number(taskRow.impact_percent)).toBeGreaterThanOrEqual(0);
    expect(Number(taskRow.impact_percent)).toBeLessThanOrEqual(100);
  });

  it("falls back to the first level-one summary name when the project name is missing", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: {
        ...project,
        name: "",
      },
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const snapshotRow = getRowByFileName(
      powerBIPackage.files.find((file) => file.fileName === "fact_snapshots.csv")!.content,
    );

    expect(snapshotRow.project_name).toBe("Projeto BI");
    expect(snapshotRow.project_id).toBe("project-1");
  });

  it.skip("exports one discipline row per operational discipline per snapshot", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const disciplineCsv = powerBIPackage.files.find((file) => file.fileName === "fact_disciplines.csv")!.content;
    const lines = disciplineCsv.split("\n");
    const dataRows = lines.slice(1).map(parseCsvLine);
    const disciplineNames = dataRows.map((row) => row[5]);

    expect(dataRows).toHaveLength(2);
    expect(disciplineNames).toEqual(["Civil", "Elétrica"]);
    expect(new Set(dataRows.map((row) => row[3])).size).toBe(2);
    expect(new Set(dataRows.map((row) => row[2])).size).toBe(2);
  });

  it("uses project statusDate as snapshot reference for delay_days when available", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const tasksCsv = powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content;
    const taskRow = getRowByColumnValue(tasksCsv, "task_id", "t2");

    expect(taskRow.delay_days).toBe("0");
  });

  it("calculates delay for open overdue task against snapshot using baseline finish when available", () => {
    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: {
        ...project,
        tasks: project.tasks.map((task) =>
          task.id === "t1"
            ? {
                ...task,
                endDate: "2026-01-30T17:00:00",
                baselineEndDate: "2026-01-09T17:00:00",
                actualEndDate: "",
              }
            : task,
        ),
      },
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const taskRow = getRowByColumnValue(
      powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content,
      "task_id",
      "t1",
    );

    expect(taskRow.delay_days).toBe("10,17");
    expect(taskRow.is_delayed).toBe("true");
  });

  it("keeps completed task delay based on actual finish against the reliable finish reference", () => {
    const completedProject: Project = {
      ...project,
      tasks: project.tasks.map((task) =>
        task.id === "t1"
          ? {
              ...task,
              actualEndDate: "2026-01-12T17:00:00",
              baselineEndDate: "2026-01-09T17:00:00",
            }
          : task,
      ),
    };

    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: completedProject,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const taskRow = getRowByColumnValue(
      powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content,
      "task_id",
      "t1",
    );

    expect(taskRow.delay_days).toBe("3");
    expect(taskRow.is_delayed).toBe("true");
  });

  it("returns blank delay for summary task and for task without reliable finish reference", () => {
    const projectWithoutReliableFinish: Project = {
      ...project,
      tasks: project.tasks.map((task) => {
        if (task.id === "t1") {
          return {
            ...task,
            endDate: "",
            baselineEndDate: "",
            actualEndDate: "",
          };
        }

        return task;
      }),
    };

    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: projectWithoutReliableFinish,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const tasksCsv = powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content;
    const summaryRow = getRowByColumnValue(tasksCsv, "task_id", "civil-summary");
    const taskRow = getRowByColumnValue(tasksCsv, "task_id", "t1");

    expect(summaryRow.delay_days).toBe("");
    expect(summaryRow.is_delayed).toBe("false");
    expect(taskRow.delay_days).toBe("");
    expect(taskRow.is_delayed).toBe("false");
  });

  it("keeps milestone delay explicit when the milestone is overdue and still open in the snapshot", () => {
    const milestoneProject: Project = {
      ...project,
      tasks: project.tasks.map((task) =>
        task.id === "t2"
          ? {
              ...task,
              duration: 0,
              endDate: "2026-01-15T17:00:00",
              baselineEndDate: "2026-01-15T17:00:00",
              actualEndDate: "",
            }
          : task,
      ),
    };

    const powerBIPackage = buildPowerBIPackage({
      generatedAt: "2026-03-26T10:00:00.000Z",
      project: milestoneProject,
      insights,
      score,
      disciplines,
      weightModel,
      compensationAnalysis,
      compensationByDiscipline,
      scheduleStatus,
    });

    const taskRow = getRowByColumnValue(
      powerBIPackage.files.find((file) => file.fileName === "fact_tasks.csv")!.content,
      "task_id",
      "t2",
    );

    expect(taskRow.is_milestone).toBe("true");
    expect(taskRow.delay_days).toBe("4,17");
    expect(taskRow.is_delayed).toBe("true");
  });
});
