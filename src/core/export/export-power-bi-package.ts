import type { ProjectComparison } from "../../app/history/snapshot-history";
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
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import { buildProjectScore } from "../score/build-project-score";
import { validateProject } from "../validation/validate-project";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

type ExportPowerBIPackageInput = {
  generatedAt: string;
  project: Project;
  insights: ProjectInsights;
  score: ProjectScore;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
  scheduleStatus?: ScheduleStatus;
  gapVsCompensation?: GapVsCompensation;
  comparison?: ProjectComparison;
};

export type PowerBIPackage = {
  projectId: string;
  snapshotId: string;
  manifest: string;
  files: Array<{
    fileName: "fact_tasks.csv" | "fact_disciplines.csv" | "fact_snapshots.csv" | "fact_compensation.csv" | "manifest.json";
    content: string;
  }>;
};

const CSV_DELIMITER = ";";

const FACT_TASKS_COLUMNS = [
  "project_id",
  "snapshot_id",
  "task_snapshot_id",
  "task_id",
  "discipline_id",
  "discipline_snapshot_id",
  "task_name",
  "discipline_type",
  "discipline_name",
  "outline_number",
  "is_summary",
  "is_milestone",
  "planned_start",
  "planned_finish",
  "actual_start",
  "actual_finish",
  "percent_complete",
  "physical_percent_complete",
  "progress_source",
  "progress_percent_used",
  "progress_gap_percent",
  "progress_band",
  "normalized_value",
  "earned_normalized_value",
  "remaining_normalized_value",
  "remaining_weight_percent",
  "impact_percent",
  "impact_band",
  "is_delayed",
  "has_progress",
  "has_baseline",
  "has_actual_dates",
  "delay_days",
  "priority_rank",
  "impact_rank",
  "parent_id",
] as const;

const FACT_DISCIPLINES_COLUMNS = [
  "project_id",
  "snapshot_id",
  "discipline_snapshot_id",
  "discipline_id",
  "discipline_type",
  "discipline_name",
  "discipline_outline_number",
  "score_value",
  "score_status",
  "discipline_progress_weighted_percent",
  "discipline_progress_band",
  "total_normalized_value",
  "earned_normalized_value",
  "remaining_normalized_value",
  "discipline_remaining_weight_percent",
  "discipline_impact_percent",
  "discipline_impact_band",
  "priority_rank",
  "impact_rank",
  "total_tasks",
  "warnings_count",
  "errors_count",
] as const;

const FACT_SNAPSHOTS_COLUMNS = [
  "project_id",
  "snapshot_id",
  "captured_at",
  "project_name",
  "overall_status",
  "score_value",
  "score_status",
  "schedule_status",
  "project_progress_weighted_percent",
  "total_tasks",
  "total_resources",
  "total_dependencies",
  "tasks_with_progress",
  "tasks_with_baseline",
  "tasks_with_real_dates",
  "project_top3_compensation_percent",
  "project_top5_compensation_percent",
  "project_gap_percent",
  "project_progress_gap_percent",
  "gap_status",
] as const;

const FACT_COMPENSATION_COLUMNS = [
  "project_id",
  "snapshot_id",
  "task_snapshot_id",
  "discipline_id",
  "discipline_snapshot_id",
  "priority_rank",
  "task_id",
  "task_name",
  "discipline_type",
  "discipline_name",
  "impact_percent",
  "impact_band",
  "remaining_normalized_value",
  "remaining_weight_percent",
  "progress_percent_used",
  "progress_band",
  "progress_gap_percent",
  "is_delayed",
  "has_progress",
  "has_baseline",
  "has_actual_dates",
  "delay_days",
  "impact_rank",
] as const;

function formatCsvScalar(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function escapeCsvValue(value: string | number | boolean | null | undefined): string {
  return `"${formatCsvScalar(value).replace(/"/g, '""')}"`;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function buildCsvRow(columns: readonly string[], row: Record<string, string | number | boolean | null | undefined>): string {
  return columns.map((column) => escapeCsvValue(row[column])).join(CSV_DELIMITER);
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

  const resolvedProjectName = resolveProjectName(project);
  if (resolvedProjectName.trim()) {
    return normalizeIdentifier(resolvedProjectName);
  }

  return "project-unknown";
}

function buildSnapshotId(generatedAt: string): string {
  return `snapshot-${generatedAt.replace(/[^0-9TZ]/g, "").toLowerCase()}`;
}

function buildDisciplineId(
  projectId: string,
  disciplineOutlineNumber: string | undefined,
  disciplineName: string,
): string {
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

function calculateTaskImpactPercent(remainingNormalizedValue: number, normalizedProjectValue: number): number | null {
  if (normalizedProjectValue <= 0) {
    return null;
  }

  return round2((remainingNormalizedValue / normalizedProjectValue) * 100);
}

function countTasksWithProgress(weightModel: ProjectWeightModel): number {
  const coverage = weightModel.progressSourceCoverage;
  return (
    coverage.tasksUsingPercentComplete +
    coverage.tasksUsingPhysicalPercentComplete +
    coverage.tasksConsideredCompletedByActualEndDate
  );
}

function parseDate(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function toBand(value: number | null | undefined): "LOW" | "MEDIUM" | "HIGH" | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  if (value < 33.34) {
    return "LOW";
  }

  if (value < 66.67) {
    return "MEDIUM";
  }

  return "HIGH";
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

type ExportDiscipline = {
  disciplineId: string;
  disciplineSnapshotId: string;
  disciplineType: string;
  disciplineName: string;
  disciplineOutlineNumber: string;
  taskIds: string[];
  totalTasks: number;
  scoreValue: number | null;
  scoreStatus: string | null;
  warningsCount: number;
  errorsCount: number;
};

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
  const fallbackDisciplinesByName = new Map(disciplines.map((discipline) => [discipline.name, discipline]));
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

function calculateDelayDays(
  task: Project["tasks"][number],
  snapshotReferenceIso: string,
): number | null {
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

  return round2((comparisonMs - referenceFinishMs) / (1000 * 60 * 60 * 24));
}

function isDelayed(
  task: Project["tasks"][number],
  snapshotReferenceIso: string,
): boolean {
  const delayDays = calculateDelayDays(task, snapshotReferenceIso);
  return Boolean(delayDays && delayDays > 0);
}

function assertUnique(values: Array<string | null | undefined>, label: string): void {
  const filtered = values.filter((value): value is string => Boolean(value));
  const unique = new Set(filtered);

  if (filtered.length !== unique.size) {
    throw new Error(`Pacote Power BI invalido: chave duplicada detectada em ${label}.`);
  }
}

function assertNoBlank(values: Array<string | null | undefined>, label: string): void {
  if (values.some((value) => !value || !value.trim())) {
    throw new Error(`Pacote Power BI invalido: chave obrigatoria ausente em ${label}.`);
  }
}

function assertPercentRange(values: Array<number | null | undefined>, label: string): void {
  const invalid = values.find((value) => value !== null && value !== undefined && (value < -100 || value > 100));
  if (invalid !== undefined) {
    throw new Error(`Pacote Power BI invalido: ${label} fora da escala percentual 0-100.`);
  }
}

function assertDisciplineConsistency(
  values: Array<{ disciplineId: string; disciplineName: string }>,
): void {
  const namesById = new Map<string, string>();

  for (const item of values) {
    const known = namesById.get(item.disciplineId);
    if (known && known !== item.disciplineName) {
      throw new Error("Pacote Power BI invalido: discipline_id associado a nomes diferentes.");
    }
    namesById.set(item.disciplineId, item.disciplineName);
  }
}

export function buildPowerBIPackage(input: ExportPowerBIPackageInput): PowerBIPackage {
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
    gapVsCompensation,
  } = input;

  const resolvedProjectName = resolveProjectName(project);
  const projectId = buildStableProjectId(project);
  const snapshotId = buildSnapshotId(generatedAt);
  const snapshotReferenceIso = resolveSnapshotReferenceIso(project, generatedAt);
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const taskWeightsById = new Map(weightModel.taskWeights.map((weight) => [weight.taskId, weight]));
  const { exportDisciplines, exportDisciplineByTaskId } = buildExportDisciplines(
    project,
    disciplines,
    taskWeightsById,
    projectId,
    snapshotId,
  );
  const exportDisciplinesById = new Map(exportDisciplines.map((discipline) => [discipline.disciplineId, discipline]));
  const compensationPriorityByTaskId = new Map(
    compensationAnalysis.topTasks.map((task, index) => [task.taskId, index + 1]),
  );
  const impactRanks = [...weightModel.taskWeights]
    .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
    .map((taskWeight, index) => [taskWeight.taskId, index + 1] as const);
  const impactRankByTaskId = new Map(impactRanks);
  const exportDisciplineWeightRows = exportDisciplines.map((discipline) => {
    const taskWeights = discipline.taskIds
      .map((taskId) => taskWeightsById.get(taskId))
      .filter((taskWeight): taskWeight is NonNullable<typeof taskWeight> => Boolean(taskWeight));
    const totalNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.normalizedValue, 0));
    const earnedNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.earnedNormalizedValue, 0));
    const remainingNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.remainingNormalizedValue, 0));
    const progressWeightedPercent = round2(
      totalNormalizedValue === 0 ? 0 : (earnedNormalizedValue / totalNormalizedValue) * 100,
    );
    const impactPercent = calculateTaskImpactPercent(remainingNormalizedValue, weightModel.normalizedProjectValue);
    const remainingWeightPercent = calculateRemainingWeightPercent(totalNormalizedValue, remainingNormalizedValue);

    return {
      disciplineId: discipline.disciplineId,
      totalNormalizedValue,
      earnedNormalizedValue,
      remainingNormalizedValue,
      progressWeightedPercent,
      impactPercent,
      remainingWeightPercent,
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

  const factTasksRows = project.tasks.map((task) => {
    const taskWeight = taskWeightsById.get(task.id);
    const exportDiscipline = exportDisciplineByTaskId.get(task.id);
    const hasProgress = (taskWeight?.progressPercentUsed ?? 0) > 0;
    const hasTaskBaseline = hasBaseline(task);
    const hasTaskActualDates = hasActualDates(task);
    const progressGapPercent = taskWeight ? round2(taskWeight.progressPercentUsed - task.percentComplete) : null;
    const remainingWeightPercent = taskWeight
      ? calculateRemainingWeightPercent(taskWeight.normalizedValue, taskWeight.remainingNormalizedValue)
      : null;
    const impactPercent = taskWeight
      ? calculateTaskImpactPercent(taskWeight.remainingNormalizedValue, weightModel.normalizedProjectValue)
      : null;
    const delayDays = taskWeight ? calculateDelayDays(task, snapshotReferenceIso) : null;

    return buildCsvRow(FACT_TASKS_COLUMNS, {
      project_id: projectId,
      snapshot_id: snapshotId,
      task_snapshot_id: buildTaskSnapshotId(snapshotId, task.id),
      task_id: task.id,
      discipline_id: exportDiscipline?.disciplineId ?? null,
      discipline_snapshot_id: exportDiscipline?.disciplineSnapshotId ?? null,
      task_name: task.name,
      discipline_type: exportDiscipline?.disciplineType ?? "OUTRO",
      discipline_name: exportDiscipline?.disciplineName ?? "",
      outline_number: task.outlineNumber,
      is_summary: task.isSummary,
      is_milestone: task.duration === 0,
      planned_start: task.startDate,
      planned_finish: task.endDate,
      actual_start: task.actualStartDate,
      actual_finish: task.actualEndDate,
      percent_complete: task.percentComplete,
      physical_percent_complete: task.physicalPercentComplete,
      progress_source: taskWeight?.progressSource ?? "",
      progress_percent_used: taskWeight?.progressPercentUsed ?? null,
      progress_gap_percent: progressGapPercent,
      progress_band: toBand(taskWeight?.progressPercentUsed ?? null),
      normalized_value: taskWeight?.normalizedValue ?? null,
      earned_normalized_value: taskWeight?.earnedNormalizedValue ?? null,
      remaining_normalized_value: taskWeight?.remainingNormalizedValue ?? null,
      remaining_weight_percent: remainingWeightPercent,
      impact_percent: impactPercent,
      impact_band: toBand(impactPercent),
      is_delayed: taskWeight ? isDelayed(task, snapshotReferenceIso) : false,
      has_progress: hasProgress,
      has_baseline: hasTaskBaseline,
      has_actual_dates: hasTaskActualDates,
      delay_days: delayDays,
      priority_rank: compensationPriorityByTaskId.get(task.id) ?? null,
      impact_rank: impactRankByTaskId.get(task.id) ?? null,
      parent_id: task.parentId ?? "",
    });
  });

  const factDisciplinesRows = exportDisciplines.map((discipline) => {
    const disciplineWeight = exportDisciplineWeightById.get(discipline.disciplineId);

    return buildCsvRow(FACT_DISCIPLINES_COLUMNS, {
      project_id: projectId,
      snapshot_id: snapshotId,
      discipline_snapshot_id: discipline.disciplineSnapshotId,
      discipline_id: discipline.disciplineId,
      discipline_type: discipline.disciplineType,
      discipline_name: discipline.disciplineName,
      discipline_outline_number: discipline.disciplineOutlineNumber,
      score_value: discipline.scoreValue,
      score_status: discipline.scoreStatus,
      discipline_progress_weighted_percent: disciplineWeight?.progressWeightedPercent ?? null,
      discipline_progress_band: toBand(disciplineWeight?.progressWeightedPercent ?? null),
      total_normalized_value: disciplineWeight?.totalNormalizedValue ?? null,
      earned_normalized_value: disciplineWeight?.earnedNormalizedValue ?? null,
      remaining_normalized_value: disciplineWeight?.remainingNormalizedValue ?? null,
      discipline_remaining_weight_percent: disciplineWeight?.remainingWeightPercent ?? null,
      discipline_impact_percent: disciplineWeight?.impactPercent ?? null,
      discipline_impact_band: toBand(disciplineWeight?.impactPercent ?? null),
      priority_rank: disciplinePriorityRankById.get(discipline.disciplineId) ?? null,
      impact_rank: disciplineImpactRankById.get(discipline.disciplineId) ?? null,
      total_tasks: discipline.totalTasks,
      warnings_count: discipline.warningsCount,
      errors_count: discipline.errorsCount,
    });
  });

  const factSnapshotsRows = [
    buildCsvRow(FACT_SNAPSHOTS_COLUMNS, {
      project_id: projectId,
      snapshot_id: snapshotId,
      captured_at: generatedAt,
      project_name: resolvedProjectName,
      overall_status: insights.summary.status,
      score_value: score.value,
      score_status: score.status,
      schedule_status: scheduleStatus?.status ?? null,
      project_progress_weighted_percent: weightModel.progressWeightedPercent,
      total_tasks: insights.metrics.totalTasks,
      total_resources: insights.metrics.totalResources,
      total_dependencies: insights.metrics.totalDependencies,
      tasks_with_progress: countTasksWithProgress(weightModel),
      tasks_with_baseline: insights.metrics.tasksWithBaseline,
      tasks_with_real_dates: insights.metrics.tasksWithActualDates,
      project_top3_compensation_percent: compensationAnalysis.potential.top3ImpactPercent,
      project_top5_compensation_percent: compensationAnalysis.potential.top5ImpactPercent,
      project_gap_percent: gapVsCompensation?.gapPercent ?? null,
      project_progress_gap_percent: scheduleStatus?.gap ?? null,
      gap_status: gapVsCompensation?.status ?? null,
    }),
  ];

  const factCompensationRows = compensationAnalysis.topTasks.map((task, index) => {
    const exportDiscipline = exportDisciplineByTaskId.get(task.taskId);
    const projectTask = tasksById.get(task.taskId);
    const taskWeight = taskWeightsById.get(task.taskId);
    const remainingWeightPercent = taskWeight
      ? calculateRemainingWeightPercent(taskWeight.normalizedValue, taskWeight.remainingNormalizedValue)
      : null;
    const delayDays = projectTask ? calculateDelayDays(projectTask, snapshotReferenceIso) : null;

    return buildCsvRow(FACT_COMPENSATION_COLUMNS, {
      project_id: projectId,
      snapshot_id: snapshotId,
      task_snapshot_id: buildTaskSnapshotId(snapshotId, task.taskId),
      discipline_id: exportDiscipline?.disciplineId ?? null,
      discipline_snapshot_id: exportDiscipline?.disciplineSnapshotId ?? null,
      priority_rank: index + 1,
      task_id: task.taskId,
      task_name: task.name,
      discipline_type: exportDiscipline?.disciplineType ?? "OUTRO",
      discipline_name: exportDiscipline?.disciplineName ?? "",
      impact_percent: task.impactPercent,
      impact_band: toBand(task.impactPercent),
      remaining_normalized_value: task.remainingNormalizedValue,
      remaining_weight_percent: remainingWeightPercent,
      progress_percent_used: task.progressPercent,
      progress_band: toBand(task.progressPercent),
      progress_gap_percent: projectTask ? round2(task.progressPercent - projectTask.percentComplete) : null,
      is_delayed: projectTask ? isDelayed(projectTask, snapshotReferenceIso) : false,
      has_progress: task.progressPercent > 0,
      has_baseline: projectTask ? hasBaseline(projectTask) : false,
      has_actual_dates: projectTask ? hasActualDates(projectTask) : false,
      delay_days: delayDays,
      impact_rank: impactRankByTaskId.get(task.taskId) ?? null,
    });
  });

  assertUnique([snapshotId], "fact_snapshots.snapshot_id");
  assertUnique(
    project.tasks.map((task) => buildTaskSnapshotId(snapshotId, task.id)),
    "fact_tasks.task_snapshot_id",
  );
  assertUnique(
    exportDisciplines.map((discipline) => discipline.disciplineSnapshotId),
    "fact_disciplines.discipline_snapshot_id",
  );
  assertNoBlank(
    exportDisciplines.map((discipline) => discipline.disciplineId),
    "fact_disciplines.discipline_id",
  );
  assertNoBlank(
    compensationAnalysis.topTasks.map((task) => buildTaskSnapshotId(snapshotId, task.taskId)),
    "fact_compensation.task_snapshot_id",
  );
  assertPercentRange(
    [
      ...project.tasks.flatMap((task) => [task.percentComplete, task.physicalPercentComplete]),
      ...weightModel.taskWeights.flatMap((weight) => [weight.progressPercentUsed]),
      ...weightModel.disciplineWeights.flatMap((discipline) => [discipline.progressWeightedPercent]),
      ...compensationAnalysis.topTasks.flatMap((task) => [task.impactPercent, task.progressPercent]),
      compensationAnalysis.potential.top3ImpactPercent,
      compensationAnalysis.potential.top5ImpactPercent,
      scheduleStatus?.progressReal,
      scheduleStatus?.progressExpected,
      scheduleStatus?.gap,
      gapVsCompensation?.gapPercent,
      ...compensationByDiscipline.flatMap((discipline) => [discipline.impactPercent, discipline.top3ImpactPercent]),
    ],
    "percentuais exportados",
  );
  assertDisciplineConsistency(
    exportDisciplines.map((discipline) => ({
      disciplineId: discipline.disciplineId,
      disciplineName: discipline.disciplineName,
    })),
  );

  const manifestObject = {
    exported_at: generatedAt,
    project_id: projectId,
    project_name: resolvedProjectName,
    snapshot_id: snapshotId,
    percent_scale: "0-100",
    csv_delimiter: ";",
    decimal_separator: ",",
    grains: {
      fact_tasks: "one row per task per snapshot",
      fact_disciplines: "one row per discipline per snapshot",
      fact_snapshots: "one row per snapshot",
      fact_compensation: "one row per ranked compensation task per snapshot",
    },
    relationship_keys: {
      task_snapshot_id: "fact_tasks.task_snapshot_id <-> fact_compensation.task_snapshot_id",
      snapshot_id: "fact_tasks.snapshot_id <-> fact_snapshots.snapshot_id",
      discipline_snapshot_id: "fact_tasks.discipline_snapshot_id <-> fact_disciplines.discipline_snapshot_id",
    },
    files_generated: [
      "fact_tasks.csv",
      "fact_disciplines.csv",
      "fact_snapshots.csv",
      "fact_compensation.csv",
      "manifest.json",
    ],
    version: "1.1",
  };

  const files: PowerBIPackage["files"] = [
    {
      fileName: "fact_tasks.csv",
      content: [FACT_TASKS_COLUMNS.join(CSV_DELIMITER), ...factTasksRows].join("\n"),
    },
    {
      fileName: "fact_disciplines.csv",
      content: [FACT_DISCIPLINES_COLUMNS.join(CSV_DELIMITER), ...factDisciplinesRows].join("\n"),
    },
    {
      fileName: "fact_snapshots.csv",
      content: [FACT_SNAPSHOTS_COLUMNS.join(CSV_DELIMITER), ...factSnapshotsRows].join("\n"),
    },
    {
      fileName: "fact_compensation.csv",
      content: [FACT_COMPENSATION_COLUMNS.join(CSV_DELIMITER), ...factCompensationRows].join("\n"),
    },
    {
      fileName: "manifest.json",
      content: JSON.stringify(manifestObject, null, 2),
    },
  ];

  return {
    projectId,
    snapshotId,
    manifest: JSON.stringify(manifestObject, null, 2),
    files,
  };
}
