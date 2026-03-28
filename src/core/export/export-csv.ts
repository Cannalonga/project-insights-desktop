import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { AnalysisReliability } from "../reliability/build-analysis-reliability";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import { buildOperationalTaskViews } from "../operations/build-operational-task-views";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

function escapeCSVValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

type ConsolidatedCSVInput = {
  project: Project;
  diagnostics: Diagnostics;
  insights: ProjectInsights;
  weightModel: ProjectWeightModel;
  generatedAt: string;
  analysisReliability?: AnalysisReliability;
  scheduleStatus?: ScheduleStatus;
  disciplineProgress?: DisciplineProgressAnalysis;
  sCurve?: SCurveResult;
};

const CONSOLIDATED_COLUMNS = [
  "recordType",
  "projectName",
  "generatedAt",
  "statusDate",
  "reportStatus",
  "analysisReliability",
  "outlineNumber",
  "taskName",
  "plannedPercent",
  "actualPercent",
  "gapPercent",
  "impactPercent",
  "taskStatus",
  "discipline",
  "start",
  "finish",
  "curveDate",
  "plannedCurve",
  "replannedCurve",
  "realCurve",
  "diagnosticCode",
  "diagnosticMessage",
  "diagnosticSeverity",
  "insightCode",
  "insightTitle",
  "insightValue",
  "insightContext",
];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseDate(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateExpectedPercent(now: number, start: number, end: number): number {
  if (now <= start) {
    return 0;
  }

  if (now >= end || end === start) {
    return 100;
  }

  return round2(((now - start) / (end - start)) * 100);
}

function toCurvePercent(value: number, percentBaseValue: number): number {
  if (percentBaseValue <= 0) {
    return 0;
  }

  return round2((value / percentBaseValue) * 100);
}

function resolveTaskStatus(percentComplete: number, actualEndDate: string, isSummary: boolean): string {
  if (isSummary) {
    return "summary";
  }

  if (percentComplete >= 100 || Boolean(actualEndDate)) {
    return "completed";
  }

  if (percentComplete > 0) {
    return "in_progress";
  }

  return "not_started";
}

function buildConsolidatedRow(values: Partial<Record<(typeof CONSOLIDATED_COLUMNS)[number], string | number>>): string {
  return CONSOLIDATED_COLUMNS.map((column) => escapeCSVValue(String(values[column] ?? ""))).join(",");
}

export function exportTasksToCSV(project: Project): string {
  const header =
    "id,outlineNumber,outlineLevel,parentId,name,startDate,endDate,actualStartDate,actualEndDate,baselineStartDate,baselineEndDate,percentComplete,physicalPercentComplete,duration,baselineDurationHours,actualDurationHours,actualWorkHours,remainingWorkHours,resumeDate,stopDate,resourceIds,hasDependencies,dependencyCount,isUnassigned,isLeaf,isMilestone,isSummary";
  const tasks = project.tasks ?? [];
  const dependencyCountByTaskId = new Map<string, number>();

  for (const dependency of project.dependencies ?? []) {
    const currentCount = dependencyCountByTaskId.get(dependency.toTaskId) ?? 0;
    dependencyCountByTaskId.set(dependency.toTaskId, currentCount + 1);
  }

  const rows = tasks.map((task) => {
    const dependencyCount = dependencyCountByTaskId.get(task.id) ?? 0;
    const hasDependencies = dependencyCount > 0;
    const isUnassigned = task.resourceIds.includes("-1");
    const isLeaf = !task.isSummary;
    const isMilestone = task.duration === 0;

    return [
      escapeCSVValue(task.id),
      escapeCSVValue(task.outlineNumber),
      escapeCSVValue(String(task.outlineLevel)),
      escapeCSVValue(task.parentId ?? ""),
      escapeCSVValue(task.name),
      escapeCSVValue(task.startDate),
      escapeCSVValue(task.endDate),
      escapeCSVValue(task.actualStartDate),
      escapeCSVValue(task.actualEndDate),
      escapeCSVValue(task.baselineStartDate),
      escapeCSVValue(task.baselineEndDate),
      escapeCSVValue(String(task.percentComplete)),
      escapeCSVValue(String(task.physicalPercentComplete)),
      escapeCSVValue(String(task.duration)),
      escapeCSVValue(String(task.baselineDurationHours)),
      escapeCSVValue(String(task.actualDurationHours)),
      escapeCSVValue(String(task.actualWorkHours)),
      escapeCSVValue(String(task.remainingWorkHours)),
      escapeCSVValue(task.resumeDate),
      escapeCSVValue(task.stopDate),
      escapeCSVValue(task.resourceIds.join(",")),
      escapeCSVValue(String(hasDependencies)),
      escapeCSVValue(String(dependencyCount)),
      escapeCSVValue(String(isUnassigned)),
      escapeCSVValue(String(isLeaf)),
      escapeCSVValue(String(isMilestone)),
      escapeCSVValue(String(task.isSummary)),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function exportDiagnosticsToCSV(diagnostics: Diagnostics): string {
  const header = "id,severity,category,message,taskId,taskName";
  const rows = diagnostics.items.map((item) =>
    [
      escapeCSVValue(item.id),
      escapeCSVValue(item.severity),
      escapeCSVValue(item.category),
      escapeCSVValue(item.message),
      escapeCSVValue(item.taskId ?? ""),
      escapeCSVValue(item.taskName ?? ""),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function exportInsightsToCSV(insights: ProjectInsights): string {
  const header = "section,key,value";
  const rows: string[] = [
    ["summary", "status", insights.summary.status].join(","),
    ["summary", "message", escapeCSVValue(insights.summary.message)].join(","),
  ];

  for (const [key, value] of Object.entries(insights.metrics)) {
    if (typeof value === "object" && value !== null) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        rows.push(
          [
            escapeCSVValue(`metrics.${key}`),
            escapeCSVValue(nestedKey),
            escapeCSVValue(String(nestedValue)),
          ].join(","),
        );
      }
      continue;
    }

    rows.push([escapeCSVValue("metrics"), escapeCSVValue(key), escapeCSVValue(String(value))].join(","));
  }

  insights.highlights.forEach((highlight, index) => {
    rows.push([escapeCSVValue("highlights"), escapeCSVValue(String(index)), escapeCSVValue(highlight)].join(","));
  });

  insights.warnings.forEach((warning, index) => {
    rows.push([escapeCSVValue("warnings"), escapeCSVValue(String(index)), escapeCSVValue(warning)].join(","));
  });

  return [header, ...rows].join("\n");
}

export function exportSCurveToCSV(sCurve: SCurveResult): string {
  const header = "date,planned,plannedAccumulated,replanned,replannedAccumulated,real,realAccumulated";
  const rows = sCurve.points.map((point) =>
    [
      escapeCSVValue(point.date),
      escapeCSVValue(String(point.planned)),
      escapeCSVValue(String(point.plannedAccumulated)),
      escapeCSVValue(String(point.replanned)),
      escapeCSVValue(String(point.replannedAccumulated)),
      escapeCSVValue(String(point.real)),
      escapeCSVValue(String(point.realAccumulated)),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function exportAnalyticalCSV({
  project,
  diagnostics,
  insights,
  weightModel,
  generatedAt,
  analysisReliability,
  scheduleStatus,
  disciplineProgress,
  sCurve,
}: ConsolidatedCSVInput): string {
  const reportStatus = scheduleStatus?.status ?? insights.summary.status;
  const reliability = analysisReliability?.overallReliability ?? "";
  const statusDate = generatedAt;
  const taskWeightsById = new Map(weightModel.taskWeights.map((weight) => [weight.taskId, weight]));
  const operationalTaskIds = new Set(buildOperationalTaskViews(weightModel, project, generatedAt, project.tasks.length).map((task) => task.taskId));
  const now = parseDate(generatedAt) ?? Date.now();

  const rows: string[] = project.tasks.map((task) => {
    const taskWeight = taskWeightsById.get(task.id);
    const baselineStart = parseDate(task.baselineStartDate);
    const baselineEnd = parseDate(task.baselineEndDate);
    const plannedPercent =
      baselineStart !== null && baselineEnd !== null && baselineEnd >= baselineStart
        ? calculateExpectedPercent(now, baselineStart, baselineEnd)
        : "";
    const actualPercent = taskWeight?.progressPercentUsed ?? task.percentComplete;
    const gapPercent =
      typeof plannedPercent === "number" ? round2(actualPercent - plannedPercent) : "";
    const impactPercent =
      taskWeight ? round2((taskWeight.remainingNormalizedValue / weightModel.normalizedProjectValue) * 100) : "";

    return buildConsolidatedRow({
      recordType: "task",
      projectName: project.name,
      generatedAt,
      statusDate,
      reportStatus,
      analysisReliability: reliability,
      outlineNumber: task.outlineNumber,
      taskName: task.name,
      plannedPercent,
      actualPercent,
      gapPercent,
      impactPercent,
      taskStatus: `${resolveTaskStatus(actualPercent, task.actualEndDate, task.isSummary)}${operationalTaskIds.has(task.id) ? "|current_operational_view" : ""}`,
      discipline: taskWeight?.disciplineName ?? "",
      start: task.startDate,
      finish: task.endDate,
    });
  });

  if (disciplineProgress) {
    disciplineProgress.disciplines.forEach((discipline) => {
      rows.push(
        buildConsolidatedRow({
          recordType: "discipline",
          projectName: project.name,
          generatedAt,
          statusDate,
          reportStatus,
          analysisReliability: reliability,
          discipline: discipline.disciplineName,
          plannedPercent: "",
          actualPercent: discipline.progressWeightedPercent,
          gapPercent: "",
          impactPercent: round2((discipline.remainingNormalizedValue / weightModel.normalizedProjectValue) * 100),
          insightContext: `${discipline.inProgressTasks} em andamento, ${discipline.completedTasks} concluídas, ${discipline.notStartedTasks} não iniciadas`,
        }),
      );
    });
  }

  if (sCurve) {
    sCurve.points.forEach((point) => {
      rows.push(
        buildConsolidatedRow({
          recordType: "curve_s_point",
          projectName: project.name,
          generatedAt,
          statusDate,
          reportStatus,
          analysisReliability: reliability,
          curveDate: point.date,
          plannedCurve: toCurvePercent(point.plannedAccumulated, sCurve.percentBaseValue),
          replannedCurve: toCurvePercent(point.replannedAccumulated, sCurve.percentBaseValue),
          realCurve: toCurvePercent(point.realAccumulated, sCurve.percentBaseValue),
        }),
      );
    });
  }

  diagnostics.items.forEach((diagnostic) => {
    rows.push(
      buildConsolidatedRow({
        recordType: "diagnostic",
        projectName: project.name,
        generatedAt,
        statusDate,
        reportStatus,
        analysisReliability: reliability,
        outlineNumber: diagnostic.taskId ?? "",
        taskName: diagnostic.taskName ?? "",
        diagnosticCode: diagnostic.id,
        diagnosticMessage: diagnostic.message,
        diagnosticSeverity: diagnostic.severity,
        insightContext: diagnostic.category,
      }),
    );
  });

  rows.push(
    buildConsolidatedRow({
      recordType: "insight",
      projectName: project.name,
      generatedAt,
      statusDate,
      reportStatus,
      analysisReliability: reliability,
      insightCode: "summary.status",
      insightTitle: "Status da leitura",
      insightValue: insights.summary.status,
      insightContext: insights.summary.message,
    }),
  );

  insights.highlights.forEach((highlight, index) => {
    rows.push(
      buildConsolidatedRow({
        recordType: "insight",
        projectName: project.name,
        generatedAt,
        statusDate,
        reportStatus,
        analysisReliability: reliability,
        insightCode: `highlight.${index}`,
        insightTitle: "Highlight",
        insightValue: highlight,
      }),
    );
  });

  insights.warnings.forEach((warning, index) => {
    rows.push(
      buildConsolidatedRow({
        recordType: "insight",
        projectName: project.name,
        generatedAt,
        statusDate,
        reportStatus,
        analysisReliability: reliability,
        insightCode: `warning.${index}`,
        insightTitle: "Warning",
        insightValue: warning,
      }),
    );
  });

  Object.entries(insights.metrics).forEach(([key, value]) => {
    if (typeof value === "object" && value !== null) {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        rows.push(
          buildConsolidatedRow({
            recordType: "insight",
            projectName: project.name,
            generatedAt,
            statusDate,
            reportStatus,
            analysisReliability: reliability,
            insightCode: `metric.${key}.${nestedKey}`,
            insightTitle: `Metrica ${key}`,
            insightValue: String(nestedValue),
            insightContext: nestedKey,
          }),
        );
      });
      return;
    }

    rows.push(
      buildConsolidatedRow({
        recordType: "insight",
        projectName: project.name,
        generatedAt,
        statusDate,
        reportStatus,
        analysisReliability: reliability,
        insightCode: `metric.${key}`,
        insightTitle: "Metrica",
        insightValue: String(value),
        insightContext: key,
      }),
    );
  });

  return [CONSOLIDATED_COLUMNS.join(","), ...rows].join("\n");
}
