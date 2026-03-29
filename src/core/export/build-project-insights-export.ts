import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type {
  OperationalCompensationAnalysis,
  OperationalCompensationDiscipline,
} from "../compensation/build-operational-compensation";
import {
  belongsToDiscipline,
  buildScopedProjectByOutlineNumber,
  type ProjectDiscipline,
} from "../disciplines/build-project-disciplines";
import { buildDiagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectInsights } from "../insights/build-project-insights";
import { buildProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { AnalysisReliability } from "../reliability/build-analysis-reliability";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import { buildProjectScore, type ProjectScore } from "../score/build-project-score";
import { validateProject } from "../validation/validate-project";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

const SCHEMA_VERSION = "2.0.0";
const PACKAGE_TYPE = "project_insights_export";
const GENERATOR_NAME = "Project Insights / CannaConverter 2.0";
const GENERATOR_VERSION = "0.1.0";
const CURRENT_WINDOW_DAYS = 14;
const NEXT_WINDOW_DAYS = 28;
const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

export type BuildProjectInsightsExportInput = {
  generatedAt: string;
  project: Project;
  insights: ProjectInsights;
  score: ProjectScore;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
  disciplineProgress?: DisciplineProgressAnalysis;
  sCurve?: SCurveResult;
  scheduleStatus?: ScheduleStatus;
  analysisReliability?: AnalysisReliability;
  gapVsCompensation?: GapVsCompensation;
};

type ExportDiscipline = {
  disciplineId: string;
  disciplineSnapshotId: string;
  disciplineType: string;
  disciplineName: string;
  displayName: string;
  disciplineOutlineNumber: string;
  taskIds: string[];
  totalTasks: number;
  scoreValue: number | null;
  scoreStatus: string | null;
  warningsCount: number;
  errorsCount: number;
};

type DisciplineWeightRow = {
  disciplineId: string;
  totalNormalizedValue: number;
  earnedNormalizedValue: number;
  remainingNormalizedValue: number;
  progressWeightedPercent: number;
  plannedProgressPercent: number | null;
  progressGapPercent: number | null;
  impactPercent: number | null;
  remainingWeightPercent: number | null;
  maxDelayDays: number | null;
};

export type ProjectInsightsExport = {
  schema_version: string;
  package_type: string;
  generated_at: string;
  generator_name: string;
  generator_version: string;
  project: {
    project_id: string;
    project_name: string;
    snapshot_id: string;
    status_date: string;
  };
  conventions: {
    percent_scale: "0_100";
    decimal_format: "dot";
    date_format: "iso8601";
    timezone: "SOURCE_OR_UTC";
    current_window_days: number;
    next_window_days: number;
    delay_reference: "BASELINE_FINISH_THEN_PLANNED_FINISH";
    discipline_delay_aggregation: "MAX_TASK_DELAY_DAYS";
  };
  snapshot: {
    captured_at: string;
    project_status_code: string;
    schedule_status_code: string;
    data_confidence_code: string;
    project_health_band: string;
    status_reason_codes: string[];
    progress_gap_percent: number | null;
    project_progress_weighted_percent: number;
    project_progress_planned_percent: number | null;
    project_score: number;
    score_status_code: string;
    critical_errors_count: number;
    warnings_count: number;
    total_tasks: number;
    total_resources: number;
    total_dependencies: number;
    tasks_with_progress: number;
    tasks_with_baseline: number;
    tasks_with_actual_dates: number;
    top3_compensation_percent: number;
    top5_compensation_percent: number;
    gap_vs_compensation_percent: number | null;
    gap_vs_compensation_status_code: string | null;
    schedule_reference_code: "BASELINE" | "INFERRED" | "NOT_AVAILABLE";
  };
  disciplines: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  compensation: Array<Record<string, unknown>>;
};

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

function normalizeIdentifier(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function resolveProjectName(project: Project): string {
  if (project.name?.trim()) {
    return project.name.trim();
  }

  const levelOneSummary = project.tasks.find((task) => task.isSummary && task.outlineLevel === 1 && task.name?.trim());
  if (levelOneSummary?.name?.trim()) {
    return levelOneSummary.name.trim();
  }

  const firstNamedTask = project.tasks.find((task) => task.name?.trim());
  if (firstNamedTask?.name?.trim()) {
    return firstNamedTask.name.trim();
  }

  return "Projeto sem nome";
}

function buildStableProjectId(project: Project): string {
  if (project.id?.trim()) {
    return normalizeIdentifier(project.id.trim());
  }

  return normalizeIdentifier(resolveProjectName(project));
}

function buildSnapshotId(generatedAt: string): string {
  return `snapshot-${generatedAt.replace(/[^0-9TZ]/g, "").toLowerCase()}`;
}

function buildDisciplineId(projectId: string, disciplineOutlineNumber: string | undefined, disciplineName: string): string {
  const stablePart = disciplineOutlineNumber?.trim()
    ? normalizeIdentifier(disciplineOutlineNumber)
    : normalizeIdentifier(disciplineName);

  return `discipline-${projectId}-${stablePart}`;
}

function buildDisciplineIdFromTaskId(projectId: string, taskId: string): string {
  return `discipline-${projectId}-${normalizeIdentifier(taskId)}`;
}

function buildDisciplineSnapshotId(snapshotId: string, disciplineId: string): string {
  return `${snapshotId}::${disciplineId}`;
}

function buildTaskSnapshotId(snapshotId: string, taskId: string): string {
  return `${snapshotId}::${taskId}`;
}

function resolveSnapshotReferenceIso(project: Project, generatedAt: string): string {
  if (parseDate(project.statusDate ?? "") !== null) {
    return project.statusDate!;
  }

  if (parseDate(project.currentDate ?? "") !== null) {
    return project.currentDate!;
  }

  return generatedAt;
}

function hasBaseline(task: Project["tasks"][number]): boolean {
  return Boolean(task.baselineStartDate || task.baselineEndDate);
}

function hasActualDates(task: Project["tasks"][number]): boolean {
  return Boolean(task.actualStartDate || task.actualEndDate);
}

function calculateRemainingWeightPercent(normalizedValue: number, remainingNormalizedValue: number): number | null {
  if (normalizedValue <= 0) {
    return null;
  }

  return round2((remainingNormalizedValue / normalizedValue) * 100);
}

function calculateTaskImpactPercent(remainingNormalizedValue: number, normalizedProjectValue: number): number | null {
  if (normalizedProjectValue <= 0) {
    return null;
  }

  return round2((remainingNormalizedValue / normalizedProjectValue) * 100);
}

function normalizeDisciplineText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeDisciplineNameForExport(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function detectOperationalDisciplineType(value: string): string | null {
  const normalized = normalizeDisciplineText(value);

  if (normalized.includes("civil")) {
    return "CIVIL";
  }

  if (normalized.includes("mec")) {
    return "MECANICA";
  }

  if (normalized.includes("ele")) {
    return "ELETRICA";
  }

  if (normalized.includes("comiss")) {
    return "COMISSIONAMENTO";
  }

  if (normalized.includes("instrument")) {
    return "INSTRUMENTACAO";
  }

  if (normalized.includes("automa")) {
    return "AUTOMACAO";
  }

  if (normalized.includes("tubul")) {
    return "TUBULACAO";
  }

  return null;
}

function resolveTaskDiscipline(
  task: Project["tasks"][number],
  disciplines: ProjectDiscipline[],
  taskWeightDisciplineName?: string,
): ProjectDiscipline | undefined {
  if (taskWeightDisciplineName) {
    const disciplineByName = disciplines.find((discipline) => discipline.name === taskWeightDisciplineName);
    if (disciplineByName) {
      return disciplineByName;
    }
  }

  return disciplines.find((discipline) => belongsToDiscipline(task.outlineNumber, discipline.outlineNumber));
}

function buildAncestorChain(
  task: Project["tasks"][number],
  tasksById: Map<string, Project["tasks"][number]>,
): Project["tasks"][number][] {
  const ancestors: Project["tasks"][number][] = [];
  const visited = new Set<string>();
  let currentParentId = task.parentId;

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = tasksById.get(currentParentId);
    if (!parent) {
      break;
    }

    ancestors.push(parent);
    currentParentId = parent.parentId;
  }

  return ancestors;
}

function buildExportDisciplines(
  project: Project,
  disciplines: ProjectDiscipline[],
  taskWeightsById: Map<string, ProjectWeightModel["taskWeights"][number]>,
  projectId: string,
  snapshotId: string,
): {
  exportDisciplines: ExportDiscipline[];
  exportDisciplineByTaskId: Map<string, ExportDiscipline>;
} {
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const exportDisciplineByKey = new Map<string, ExportDiscipline>();
  const exportDisciplineByTaskId = new Map<string, ExportDiscipline>();

  for (const task of project.tasks) {
    if (task.isSummary) {
      continue;
    }

    const ancestors = buildAncestorChain(task, tasksById);
    const nearestOperationalSummary = ancestors.find(
      (ancestor) => ancestor.isSummary && Boolean(detectOperationalDisciplineType(ancestor.name)),
    );

    if (nearestOperationalSummary) {
      const disciplineType = detectOperationalDisciplineType(nearestOperationalSummary.name) ?? "OUTRO";
      const disciplineId = buildDisciplineIdFromTaskId(projectId, nearestOperationalSummary.id);
      const key = `summary:${nearestOperationalSummary.id}`;
      const existing = exportDisciplineByKey.get(key) ?? {
        disciplineId,
        disciplineSnapshotId: buildDisciplineSnapshotId(snapshotId, disciplineId),
        disciplineType,
        disciplineName: normalizeDisciplineNameForExport(nearestOperationalSummary.name),
        displayName: nearestOperationalSummary.name,
        disciplineOutlineNumber: nearestOperationalSummary.outlineNumber,
        taskIds: [],
        totalTasks: 0,
        scoreValue: null,
        scoreStatus: null,
        warningsCount: 0,
        errorsCount: 0,
      };

      existing.taskIds.push(task.id);
      existing.totalTasks += 1;
      exportDisciplineByKey.set(key, existing);
      exportDisciplineByTaskId.set(task.id, existing);
      continue;
    }

    const taskWeight = taskWeightsById.get(task.id);
    const fallback = resolveTaskDiscipline(task, disciplines, taskWeight?.disciplineName);
    if (!fallback) {
      continue;
    }

    const disciplineId = buildDisciplineId(projectId, fallback.outlineNumber, fallback.name);
    const key = `fallback:${fallback.name}`;
    const existing = exportDisciplineByKey.get(key) ?? {
      disciplineId,
      disciplineSnapshotId: buildDisciplineSnapshotId(snapshotId, disciplineId),
      disciplineType: fallback.disciplineType ?? "OUTRO",
      disciplineName: normalizeDisciplineNameForExport(fallback.name),
      displayName: fallback.name,
      disciplineOutlineNumber: fallback.outlineNumber,
      taskIds: [],
      totalTasks: 0,
      scoreValue: fallback.score.value,
      scoreStatus: fallback.score.status,
      warningsCount: fallback.diagnostics.warnings.length,
      errorsCount: fallback.diagnostics.errors.length,
    };

    existing.taskIds.push(task.id);
    existing.totalTasks += 1;
    exportDisciplineByKey.set(key, existing);
    exportDisciplineByTaskId.set(task.id, existing);
  }

  for (const exportDiscipline of exportDisciplineByKey.values()) {
    const scopedProject = buildScopedProjectByOutlineNumber(project, exportDiscipline.disciplineOutlineNumber);
    const validation = validateProject(scopedProject);
    const diagnostics = buildDiagnostics(validation);
    const scopedInsights = buildProjectInsights(scopedProject, diagnostics);
    const scopedScore = buildProjectScore(diagnostics, scopedInsights);

    exportDiscipline.scoreValue = scopedScore.value;
    exportDiscipline.scoreStatus = scopedScore.status;
    exportDiscipline.warningsCount = diagnostics.warnings.length;
    exportDiscipline.errorsCount = diagnostics.errors.length;
  }

  return {
    exportDisciplines: [...exportDisciplineByKey.values()].sort((left, right) =>
      left.disciplineOutlineNumber.localeCompare(right.disciplineOutlineNumber, undefined, { numeric: true }),
    ),
    exportDisciplineByTaskId,
  };
}

function resolveDelayReferenceFinish(task: Project["tasks"][number]): string {
  if (parseDate(task.baselineEndDate) !== null) {
    return task.baselineEndDate;
  }

  return task.endDate;
}

function calculateDelayDays(task: Project["tasks"][number], snapshotReferenceIso: string): number | null {
  if (task.isSummary) {
    return null;
  }

  const referenceFinishMs = parseDate(resolveDelayReferenceFinish(task));
  if (referenceFinishMs === null) {
    return null;
  }

  const actualFinishMs = parseDate(task.actualEndDate);
  const snapshotReferenceMs = parseDate(snapshotReferenceIso);
  const comparisonMs = actualFinishMs ?? snapshotReferenceMs;

  if (comparisonMs === null || comparisonMs <= referenceFinishMs) {
    return 0;
  }

  return round2((comparisonMs - referenceFinishMs) / MILLISECONDS_PER_DAY);
}

function isDelayed(task: Project["tasks"][number], snapshotReferenceIso: string): boolean {
  const delayDays = calculateDelayDays(task, snapshotReferenceIso);
  return Boolean(delayDays && delayDays > 0);
}

function countTasksWithProgress(weightModel: ProjectWeightModel): number {
  const coverage = weightModel.progressSourceCoverage;
  return (
    coverage.tasksUsingPercentComplete +
    coverage.tasksUsingPhysicalPercentComplete +
    coverage.tasksConsideredCompletedByActualEndDate
  );
}

function mapProjectStatusCode(status: ProjectInsights["summary"]["status"]): string {
  switch (status) {
    case "critico":
      return "PROJECT_CRITICAL";
    case "atencao":
      return "PROJECT_ATTENTION";
    default:
      return "PROJECT_STABLE";
  }
}

function mapScheduleStatusCode(status: ScheduleStatus["status"] | undefined): string {
  switch (status) {
    case "ATRASADO":
      return "DELAYED";
    case "ATENCAO":
      return "ATTENTION";
    case "OK":
      return "ON_TRACK";
    default:
      return "NOT_AVAILABLE";
  }
}

function mapScoreStatusCode(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "excelente":
      return "EXCELLENT";
    case "bom":
      return "GOOD";
    case "atencao":
      return "ATTENTION";
    case "critico":
      return "CRITICAL";
    default:
      return "NOT_AVAILABLE";
  }
}

function mapReliabilityCode(level: AnalysisReliability["overallReliability"] | undefined): string {
  switch (level) {
    case "HIGH":
    case "MODERATE":
    case "LOW":
    case "CRITICAL":
      return level;
    default:
      return "NOT_AVAILABLE";
  }
}

function toTechnicalCode(value: string | undefined | null): string {
  if (!value?.trim()) {
    return "NOT_AVAILABLE";
  }

  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function resolveTaskType(task: Project["tasks"][number]): "TASK" | "SUMMARY" | "MILESTONE" {
  if (task.isSummary) {
    return "SUMMARY";
  }

  if (task.duration === 0) {
    return "MILESTONE";
  }

  return "TASK";
}

function resolveProgressSourceCode(progressSource: string | undefined): string {
  if (!progressSource) {
    return "NO_PROGRESS_SIGNAL";
  }

  const normalized = toTechnicalCode(progressSource);
  if (normalized === "PERCENT_COMPLETE") {
    return "PERCENT_COMPLETE";
  }

  if (normalized === "PHYSICAL_PERCENT_COMPLETE") {
    return "PHYSICAL_PERCENT_COMPLETE";
  }

  if (normalized === "ACTUAL_END_DATE") {
    return "ACTUAL_END_DATE_COMPLETION";
  }

  return normalized;
}

function calculateExpectedProgressPercent(snapshotReferenceMs: number | null, startIso: string, finishIso: string): number | null {
  const startMs = parseDate(startIso);
  const finishMs = parseDate(finishIso);

  if (snapshotReferenceMs === null || startMs === null || finishMs === null || finishMs < startMs) {
    return null;
  }

  if (snapshotReferenceMs <= startMs) {
    return 0;
  }

  if (snapshotReferenceMs >= finishMs || finishMs === startMs) {
    return 100;
  }

  return round2(((snapshotReferenceMs - startMs) / (finishMs - startMs)) * 100);
}

function resolvePlannedWindowStart(task: Project["tasks"][number]): string {
  if (parseDate(task.baselineStartDate) !== null) {
    return task.baselineStartDate;
  }

  return task.startDate;
}

function resolvePlannedWindowFinish(task: Project["tasks"][number]): string {
  if (parseDate(task.baselineEndDate) !== null) {
    return task.baselineEndDate;
  }

  return task.endDate;
}

function calculateTaskPlannedProgressPercent(task: Project["tasks"][number], snapshotReferenceMs: number | null): number | null {
  return calculateExpectedProgressPercent(
    snapshotReferenceMs,
    resolvePlannedWindowStart(task),
    resolvePlannedWindowFinish(task),
  );
}

function calculateWindowFlags(task: Project["tasks"][number], snapshotReferenceMs: number | null): {
  isInCurrentWindow: boolean;
  isInNextWindow: boolean;
} {
  const plannedStartMs = parseDate(resolvePlannedWindowStart(task));
  const plannedFinishMs = parseDate(resolvePlannedWindowFinish(task));

  if (snapshotReferenceMs === null || (plannedStartMs === null && plannedFinishMs === null)) {
    return {
      isInCurrentWindow: false,
      isInNextWindow: false,
    };
  }

  const currentWindowEnd = snapshotReferenceMs + CURRENT_WINDOW_DAYS * MILLISECONDS_PER_DAY;
  const nextWindowEnd = snapshotReferenceMs + NEXT_WINDOW_DAYS * MILLISECONDS_PER_DAY;
  const referenceMs = plannedStartMs ?? plannedFinishMs!;
  const isActiveNow =
    plannedStartMs !== null &&
    plannedFinishMs !== null &&
    plannedStartMs <= snapshotReferenceMs &&
    plannedFinishMs >= snapshotReferenceMs;
  const isInCurrentWindow = isActiveNow || (referenceMs >= snapshotReferenceMs && referenceMs <= currentWindowEnd);
  const isInNextWindow = !isInCurrentWindow && referenceMs > currentWindowEnd && referenceMs <= nextWindowEnd;

  return {
    isInCurrentWindow,
    isInNextWindow,
  };
}

function deriveProjectHealthBand(
  projectStatusCode: string,
  scheduleStatusCode: string,
  dataConfidenceCode: string,
): string {
  if (
    projectStatusCode === "PROJECT_CRITICAL" ||
    scheduleStatusCode === "DELAYED" ||
    dataConfidenceCode === "CRITICAL"
  ) {
    return "CRITICAL";
  }

  if (
    projectStatusCode === "PROJECT_ATTENTION" ||
    scheduleStatusCode === "ATTENTION" ||
    dataConfidenceCode === "LOW" ||
    dataConfidenceCode === "MODERATE"
  ) {
    return "ATTENTION";
  }

  return "GOOD";
}

function buildSnapshotReasonCodes(input: {
  scheduleStatusCode: string;
  dataConfidenceCode: string;
  progressGapPercent: number | null;
  warningsCount: number;
  criticalErrorsCount: number;
  top3CompensationPercent: number;
}): string[] {
  const codes = new Set<string>();

  if (input.scheduleStatusCode === "DELAYED") {
    codes.add("PROJECT_DELAYED");
  }

  if (input.dataConfidenceCode === "LOW" || input.dataConfidenceCode === "CRITICAL") {
    codes.add("LOW_DATA_CONFIDENCE");
  }

  if (input.progressGapPercent !== null && input.progressGapPercent <= -10) {
    codes.add("HIGH_PROGRESS_GAP");
  }

  if (input.top3CompensationPercent >= 30) {
    codes.add("TOP_COMPENSATION_CONCENTRATION");
  }

  if (input.criticalErrorsCount > 0) {
    codes.add("CRITICAL_DIAGNOSTICS_PRESENT");
  }

  if (input.warningsCount > 0) {
    codes.add("WARNINGS_PRESENT");
  }

  return [...codes];
}

function calculateDisciplinePlannedProgressPercent(
  disciplineTaskIds: string[],
  taskWeightsById: Map<string, ProjectWeightModel["taskWeights"][number]>,
  tasksById: Map<string, Project["tasks"][number]>,
  snapshotReferenceMs: number | null,
): number | null {
  const weightedTasks = disciplineTaskIds
    .map((taskId) => {
      const taskWeight = taskWeightsById.get(taskId);
      const task = tasksById.get(taskId);
      if (!taskWeight || !task) {
        return null;
      }

      const plannedProgressPercent = calculateTaskPlannedProgressPercent(task, snapshotReferenceMs);
      if (plannedProgressPercent === null) {
        return null;
      }

      return {
        normalizedValue: taskWeight.normalizedValue,
        plannedProgressPercent,
      };
    })
    .filter((item): item is { normalizedValue: number; plannedProgressPercent: number } => Boolean(item));

  const totalNormalizedValue = weightedTasks.reduce((sum, item) => sum + item.normalizedValue, 0);
  if (totalNormalizedValue <= 0) {
    return null;
  }

  const plannedEarnedValue = weightedTasks.reduce(
    (sum, item) => sum + item.normalizedValue * (item.plannedProgressPercent / 100),
    0,
  );

  return round2((plannedEarnedValue / totalNormalizedValue) * 100);
}

function calculateDisciplineDelayDays(
  disciplineTaskIds: string[],
  tasksById: Map<string, Project["tasks"][number]>,
  snapshotReferenceIso: string,
): number | null {
  const delays = disciplineTaskIds
    .map((taskId) => tasksById.get(taskId))
    .filter((task): task is Project["tasks"][number] => Boolean(task))
    .map((task) => calculateDelayDays(task, snapshotReferenceIso))
    .filter((delay): delay is number => delay !== null);

  if (delays.length === 0) {
    return null;
  }

  return Math.max(...delays);
}

function buildDisciplineAttentionReasonCodes(input: {
  progressGapPercent: number | null;
  remainingWeightPercent: number | null;
  impactPercent: number | null;
  delayDays: number | null;
  meetingRank: number | null;
  warningsCount: number;
  errorsCount: number;
}): string[] {
  const codes = new Set<string>();

  if (input.delayDays !== null && input.delayDays > 0) {
    codes.add("DISCIPLINE_DELAYED");
  }

  if (input.progressGapPercent !== null && input.progressGapPercent <= -10) {
    codes.add("DISCIPLINE_PROGRESS_SLIPPAGE");
  }

  if (input.remainingWeightPercent !== null && input.remainingWeightPercent >= 50) {
    codes.add("DISCIPLINE_HIGH_REMAINING_WEIGHT");
  }

  if (input.impactPercent !== null && input.impactPercent >= 20) {
    codes.add("DISCIPLINE_HIGH_IMPACT");
  }

  if (input.meetingRank !== null && input.meetingRank <= 3) {
    codes.add("DISCIPLINE_MEETING_PRIORITY");
  }

  if (input.errorsCount > 0) {
    codes.add("DISCIPLINE_ERRORS_PRESENT");
  }

  if (input.warningsCount > 0) {
    codes.add("DISCIPLINE_WARNINGS_PRESENT");
  }

  return [...codes];
}

function buildTaskAttentionReasonCodes(input: {
  taskType: "TASK" | "SUMMARY" | "MILESTONE";
  isDelayed: boolean;
  impactPercent: number | null;
  remainingWeightPercent: number | null;
  progressGapPercent: number | null;
  meetingRank: number | null;
  isInCurrentWindow: boolean;
  isInNextWindow: boolean;
  hasBaseline: boolean;
  progressSourceCode: string;
}): string[] {
  if (input.taskType === "SUMMARY") {
    return [];
  }

  const codes = new Set<string>();

  if (input.isDelayed) {
    codes.add("TASK_DELAYED");
  }

  if (input.isDelayed && input.impactPercent !== null && input.impactPercent >= 5) {
    codes.add("DELAY_HIGH_WEIGHT");
  }

  if (input.progressGapPercent !== null && input.progressGapPercent <= -10) {
    codes.add("HIGH_IMPACT_LOW_PROGRESS");
  }

  if (input.isInCurrentWindow && input.progressGapPercent !== null && input.progressGapPercent < 0) {
    codes.add("CURRENT_WINDOW_SLIPPAGE");
  }

  if (input.isInNextWindow && input.progressGapPercent !== null && input.progressGapPercent < 0) {
    codes.add("NEXT_WINDOW_RISK");
  }

  if (input.remainingWeightPercent !== null && input.remainingWeightPercent >= 50) {
    codes.add("HIGH_REMAINING_WEIGHT");
  }

  if (input.meetingRank !== null && input.meetingRank <= 5) {
    codes.add("MEETING_PRIORITY_TASK");
  }

  if (!input.hasBaseline) {
    codes.add("NO_BASELINE_REFERENCE");
  }

  if (input.progressSourceCode === "NO_PROGRESS_SIGNAL") {
    codes.add("NO_RECENT_PROGRESS");
  }

  return [...codes];
}

function buildCompensationReasonCodes(taskReasonCodes: string[], priorityRank: number): string[] {
  const codes = new Set(taskReasonCodes);
  codes.add("COMPENSATION_PRIORITY");

  if (priorityRank <= 3) {
    codes.add("TOP3_COMPENSATION");
  }

  if (priorityRank <= 5) {
    codes.add("TOP5_COMPENSATION");
  }

  return [...codes];
}

type AnalyticalExportContext = {
  generatedAt: string;
  project: Project;
  insights: ProjectInsights;
  score: ProjectScore;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
  scheduleStatus?: ScheduleStatus;
  analysisReliability?: AnalysisReliability;
  gapVsCompensation?: GapVsCompensation;
  resolvedProjectName: string;
  projectId: string;
  snapshotId: string;
  snapshotReferenceIso: string;
  snapshotReferenceMs: number | null;
  tasksById: Map<string, Project["tasks"][number]>;
  taskWeightsById: Map<string, ProjectWeightModel["taskWeights"][number]>;
  exportDisciplines: ExportDiscipline[];
  exportDisciplineByTaskId: Map<string, ExportDiscipline>;
  exportDisciplineWeightRows: DisciplineWeightRow[];
  exportDisciplineWeightById: Map<string, DisciplineWeightRow>;
  compensationPriorityByTaskId: Map<string, number>;
  impactRankByTaskId: Map<string, number>;
  disciplinePriorityRankById: Map<string, number>;
  disciplineImpactRankById: Map<string, number>;
};

function buildAnalyticalExportContext(input: BuildProjectInsightsExportInput): AnalyticalExportContext {
  const {
    generatedAt,
    project,
    insights,
    score,
    disciplines,
    weightModel,
    compensationAnalysis,
    compensationByDiscipline,
    scheduleStatus,
    analysisReliability,
    gapVsCompensation,
  } = input;

  const resolvedProjectName = resolveProjectName(project);
  const projectId = buildStableProjectId(project);
  const snapshotId = buildSnapshotId(generatedAt);
  const snapshotReferenceIso = resolveSnapshotReferenceIso(project, generatedAt);
  const snapshotReferenceMs = parseDate(snapshotReferenceIso);
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const taskWeightsById = new Map(weightModel.taskWeights.map((weight) => [weight.taskId, weight]));
  const { exportDisciplines, exportDisciplineByTaskId } = buildExportDisciplines(
    project,
    disciplines,
    taskWeightsById,
    projectId,
    snapshotId,
  );

  const compensationPriorityByTaskId = new Map(
    compensationAnalysis.topTasks.map((task, index) => [task.taskId, index + 1]),
  );
  const impactRankByTaskId = new Map(
    [...weightModel.taskWeights]
      .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
      .map((taskWeight, index) => [taskWeight.taskId, index + 1] as const),
  );

  const exportDisciplineWeightRows = exportDisciplines.map((discipline) => {
    const taskWeights = discipline.taskIds
      .map((taskId) => taskWeightsById.get(taskId))
      .filter((taskWeight): taskWeight is NonNullable<typeof taskWeight> => Boolean(taskWeight));
    const totalNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.normalizedValue, 0));
    const earnedNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.earnedNormalizedValue, 0));
    const remainingNormalizedValue = round2(
      taskWeights.reduce((sum, taskWeight) => sum + taskWeight.remainingNormalizedValue, 0),
    );
    const progressWeightedPercent = round2(
      totalNormalizedValue === 0 ? 0 : (earnedNormalizedValue / totalNormalizedValue) * 100,
    );
    const plannedProgressPercent = calculateDisciplinePlannedProgressPercent(
      discipline.taskIds,
      taskWeightsById,
      tasksById,
      snapshotReferenceMs,
    );
    const progressGapPercent =
      plannedProgressPercent === null ? null : round2(progressWeightedPercent - plannedProgressPercent);
    const impactPercent = calculateTaskImpactPercent(remainingNormalizedValue, weightModel.normalizedProjectValue);
    const remainingWeightPercent = calculateRemainingWeightPercent(totalNormalizedValue, remainingNormalizedValue);
    const maxDelayDays = calculateDisciplineDelayDays(discipline.taskIds, tasksById, snapshotReferenceIso);

    return {
      disciplineId: discipline.disciplineId,
      totalNormalizedValue,
      earnedNormalizedValue,
      remainingNormalizedValue,
      progressWeightedPercent,
      plannedProgressPercent,
      progressGapPercent,
      impactPercent,
      remainingWeightPercent,
      maxDelayDays,
    };
  });

  const exportDisciplineWeightById = new Map(
    exportDisciplineWeightRows.map((row) => [row.disciplineId, row]),
  );
  const disciplinePriorityRankById = new Map(
    [...exportDisciplineWeightRows]
      .sort((left, right) => (right.impactPercent ?? 0) - (left.impactPercent ?? 0))
      .map((discipline, index) => [discipline.disciplineId, index + 1] as const),
  );
  const disciplineImpactRankById = new Map(
    [...exportDisciplineWeightRows]
      .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
      .map((discipline, index) => [discipline.disciplineId, index + 1] as const),
  );

  return {
    generatedAt,
    project,
    insights,
    score,
    disciplines,
    weightModel,
    compensationAnalysis,
    compensationByDiscipline,
    scheduleStatus,
    analysisReliability,
    gapVsCompensation,
    resolvedProjectName,
    projectId,
    snapshotId,
    snapshotReferenceIso,
    snapshotReferenceMs,
    tasksById,
    taskWeightsById,
    exportDisciplines,
    exportDisciplineByTaskId,
    exportDisciplineWeightRows,
    exportDisciplineWeightById,
    compensationPriorityByTaskId,
    impactRankByTaskId,
    disciplinePriorityRankById,
    disciplineImpactRankById,
  };
}

export function buildProjectInsightsExport(input: BuildProjectInsightsExportInput): ProjectInsightsExport {
  const context = buildAnalyticalExportContext(input);
  const {
    generatedAt,
    project,
    insights,
    score,
    weightModel,
    compensationAnalysis,
    scheduleStatus,
    analysisReliability,
    gapVsCompensation,
    resolvedProjectName,
    projectId,
    snapshotId,
    snapshotReferenceIso,
    snapshotReferenceMs,
    tasksById,
    taskWeightsById,
    exportDisciplines,
    exportDisciplineByTaskId,
    exportDisciplineWeightById,
    compensationPriorityByTaskId,
    impactRankByTaskId,
    disciplinePriorityRankById,
    disciplineImpactRankById,
  } = context;

  const projectStatusCode = mapProjectStatusCode(insights.summary.status);
  const scheduleStatusCode = mapScheduleStatusCode(scheduleStatus?.status);
  const dataConfidenceCode = mapReliabilityCode(analysisReliability?.overallReliability);
  const projectHealthBand = deriveProjectHealthBand(projectStatusCode, scheduleStatusCode, dataConfidenceCode);
  const snapshotWarningsCount = insights.metrics.diagnosticsBySeverity.warning;
  const snapshotCriticalErrorsCount = insights.metrics.diagnosticsBySeverity.error;
  const snapshotReasonCodes = buildSnapshotReasonCodes({
    scheduleStatusCode,
    dataConfidenceCode,
    progressGapPercent: scheduleStatus?.gap ?? null,
    warningsCount: snapshotWarningsCount,
    criticalErrorsCount: snapshotCriticalErrorsCount,
    top3CompensationPercent: compensationAnalysis.potential.top3ImpactPercent,
  });

  const disciplines = exportDisciplines.map((discipline) => {
    const weightRow = exportDisciplineWeightById.get(discipline.disciplineId);
    const meetingRank = disciplinePriorityRankById.get(discipline.disciplineId) ?? null;
    const impactRank = disciplineImpactRankById.get(discipline.disciplineId) ?? null;
    const attentionReasonCodes = buildDisciplineAttentionReasonCodes({
      progressGapPercent: weightRow?.progressGapPercent ?? null,
      remainingWeightPercent: weightRow?.remainingWeightPercent ?? null,
      impactPercent: weightRow?.impactPercent ?? null,
      delayDays: weightRow?.maxDelayDays ?? null,
      meetingRank,
      warningsCount: discipline.warningsCount,
      errorsCount: discipline.errorsCount,
    });
    const scoreStatusCode = mapScoreStatusCode(discipline.scoreStatus);

    return {
      discipline_id: discipline.disciplineId,
      discipline_snapshot_id: discipline.disciplineSnapshotId,
      discipline_name: discipline.disciplineName,
      display_name: discipline.displayName,
      discipline_type: discipline.disciplineType,
      outline_number: discipline.disciplineOutlineNumber,
      total_tasks: discipline.totalTasks,
      score: discipline.scoreValue,
      score_status_code: scoreStatusCode,
      meeting_rank: meetingRank,
      impact_rank: impactRank,
      is_critical:
        scoreStatusCode === "CRITICAL" ||
        discipline.errorsCount > 0 ||
        (weightRow?.maxDelayDays ?? 0) > 0,
      is_attention_now: attentionReasonCodes.length > 0,
      attention_reason_codes: attentionReasonCodes,
      progress_weighted_percent: weightRow?.progressWeightedPercent ?? null,
      planned_progress_percent: weightRow?.plannedProgressPercent ?? null,
      progress_gap_percent: weightRow?.progressGapPercent ?? null,
      remaining_weight_percent: weightRow?.remainingWeightPercent ?? null,
      impact_percent: weightRow?.impactPercent ?? null,
      delay_days: weightRow?.maxDelayDays ?? null,
      warnings_count: discipline.warningsCount,
      errors_count: discipline.errorsCount,
    };
  });

  const tasks = project.tasks.map((task) => {
    const taskWeight = taskWeightsById.get(task.id);
    const exportDiscipline = exportDisciplineByTaskId.get(task.id);
    const taskType = resolveTaskType(task);
    const plannedProgressPercent = task.isSummary
      ? null
      : calculateTaskPlannedProgressPercent(task, snapshotReferenceMs);
    const progressPercent = taskWeight?.progressPercentUsed ?? null;
    const progressGapPercent =
      progressPercent === null || plannedProgressPercent === null
        ? null
        : round2(progressPercent - plannedProgressPercent);
    const remainingWeightPercent = taskWeight
      ? calculateRemainingWeightPercent(taskWeight.normalizedValue, taskWeight.remainingNormalizedValue)
      : null;
    const impactPercent = taskWeight
      ? calculateTaskImpactPercent(taskWeight.remainingNormalizedValue, weightModel.normalizedProjectValue)
      : null;
    const delayDays = taskWeight ? calculateDelayDays(task, snapshotReferenceIso) : null;
    const delayed = taskWeight ? isDelayed(task, snapshotReferenceIso) : false;
    const meetingRank = compensationPriorityByTaskId.get(task.id) ?? impactRankByTaskId.get(task.id) ?? null;
    const windowFlags = calculateWindowFlags(task, snapshotReferenceMs);
    const progressSourceCode = resolveProgressSourceCode(taskWeight?.progressSource);
    const attentionReasonCodes = buildTaskAttentionReasonCodes({
      taskType,
      isDelayed: delayed,
      impactPercent,
      remainingWeightPercent,
      progressGapPercent,
      meetingRank,
      isInCurrentWindow: windowFlags.isInCurrentWindow,
      isInNextWindow: windowFlags.isInNextWindow,
      hasBaseline: hasBaseline(task),
      progressSourceCode,
    });

    return {
      task_id: task.id,
      task_snapshot_id: buildTaskSnapshotId(snapshotId, task.id),
      task_name: task.name,
      display_name: task.name,
      outline_number: task.outlineNumber,
      task_type: taskType,
      is_operational_task: !task.isSummary,
      discipline_id: exportDiscipline?.disciplineId ?? null,
      discipline_snapshot_id: exportDiscipline?.disciplineSnapshotId ?? null,
      parent_task_id: task.parentId ?? null,
      planned_start: task.startDate,
      planned_finish: task.endDate,
      actual_start: task.actualStartDate,
      actual_finish: task.actualEndDate,
      baseline_start: task.baselineStartDate,
      baseline_finish: task.baselineEndDate,
      progress_percent: progressPercent,
      planned_progress_percent: plannedProgressPercent,
      progress_gap_percent: progressGapPercent,
      remaining_weight_percent: remainingWeightPercent,
      impact_percent: impactPercent,
      impact_rank: impactRankByTaskId.get(task.id) ?? null,
      meeting_rank: meetingRank,
      is_delayed: delayed,
      is_delayed_relevant: delayed && ((impactPercent ?? 0) >= 5 || (remainingWeightPercent ?? 0) >= 20),
      delay_days: delayDays,
      is_in_current_window: windowFlags.isInCurrentWindow,
      is_in_next_window: windowFlags.isInNextWindow,
      is_attention_now: attentionReasonCodes.length > 0,
      attention_reason_codes: attentionReasonCodes,
      progress_source_code: progressSourceCode,
      has_baseline: hasBaseline(task),
      has_actual_dates: hasActualDates(task),
    };
  });

  const taskReasonCodesByTaskId = new Map(tasks.map((task) => [task.task_id, task.attention_reason_codes]));

  const compensation = compensationAnalysis.topTasks.map((task, index) => {
    const projectTask = tasksById.get(task.taskId);
    const taskWeight = taskWeightsById.get(task.taskId);
    const plannedProgressPercent = projectTask
      ? calculateTaskPlannedProgressPercent(projectTask, snapshotReferenceMs)
      : null;
    const progressGapPercent =
      plannedProgressPercent === null ? null : round2(task.progressPercent - plannedProgressPercent);
    const remainingWeightPercent = taskWeight
      ? calculateRemainingWeightPercent(taskWeight.normalizedValue, taskWeight.remainingNormalizedValue)
      : null;
    const delayDays = projectTask ? calculateDelayDays(projectTask, snapshotReferenceIso) : null;
    const exportDiscipline = exportDisciplineByTaskId.get(task.taskId);

    return {
      task_id: task.taskId,
      task_snapshot_id: buildTaskSnapshotId(snapshotId, task.taskId),
      discipline_id: exportDiscipline?.disciplineId ?? null,
      discipline_snapshot_id: exportDiscipline?.disciplineSnapshotId ?? null,
      priority_rank: index + 1,
      impact_rank: impactRankByTaskId.get(task.taskId) ?? null,
      meeting_rank: index + 1,
      selection_reason_codes: buildCompensationReasonCodes(taskReasonCodesByTaskId.get(task.taskId) ?? [], index + 1),
      remaining_weight_percent: remainingWeightPercent,
      progress_gap_percent: progressGapPercent,
      delay_days: delayDays,
      impact_percent: task.impactPercent,
    };
  });

  return {
    schema_version: SCHEMA_VERSION,
    package_type: PACKAGE_TYPE,
    generated_at: generatedAt,
    generator_name: GENERATOR_NAME,
    generator_version: GENERATOR_VERSION,
    project: {
      project_id: projectId,
      project_name: resolvedProjectName,
      snapshot_id: snapshotId,
      status_date: snapshotReferenceIso,
    },
    conventions: {
      percent_scale: "0_100",
      decimal_format: "dot",
      date_format: "iso8601",
      timezone: "SOURCE_OR_UTC",
      current_window_days: CURRENT_WINDOW_DAYS,
      next_window_days: NEXT_WINDOW_DAYS,
      delay_reference: "BASELINE_FINISH_THEN_PLANNED_FINISH",
      discipline_delay_aggregation: "MAX_TASK_DELAY_DAYS",
    },
    snapshot: {
      captured_at: generatedAt,
      project_status_code: projectStatusCode,
      schedule_status_code: scheduleStatusCode,
      data_confidence_code: dataConfidenceCode,
      project_health_band: projectHealthBand,
      status_reason_codes: snapshotReasonCodes,
      progress_gap_percent: scheduleStatus?.gap ?? null,
      project_progress_weighted_percent: weightModel.progressWeightedPercent,
      project_progress_planned_percent: scheduleStatus?.progressExpected ?? null,
      project_score: score.value,
      score_status_code: mapScoreStatusCode(score.status),
      critical_errors_count: snapshotCriticalErrorsCount,
      warnings_count: snapshotWarningsCount,
      total_tasks: insights.metrics.totalTasks,
      total_resources: insights.metrics.totalResources,
      total_dependencies: insights.metrics.totalDependencies,
      tasks_with_progress: countTasksWithProgress(weightModel),
      tasks_with_baseline: insights.metrics.tasksWithBaseline,
      tasks_with_actual_dates: insights.metrics.tasksWithActualDates,
      top3_compensation_percent: compensationAnalysis.potential.top3ImpactPercent,
      top5_compensation_percent: compensationAnalysis.potential.top5ImpactPercent,
      gap_vs_compensation_percent: gapVsCompensation?.gapPercent ?? null,
      gap_vs_compensation_status_code: gapVsCompensation?.status ?? null,
      schedule_reference_code: scheduleStatus
        ? scheduleStatus.basedOnBaseline
          ? "BASELINE"
          : "INFERRED"
        : "NOT_AVAILABLE",
    },
    disciplines,
    tasks,
    compensation,
  };
}

export function stringifyProjectInsightsExport(input: BuildProjectInsightsExportInput): string {
  return JSON.stringify(buildProjectInsightsExport(input), null, 2);
}
