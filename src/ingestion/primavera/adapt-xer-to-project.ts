import type { Dependency } from "../../core/model/dependency";
import type { Project } from "../../core/model/project";
import type { Task } from "../../core/model/task";
import type {
  XerProjectRaw,
  XerProjectRecord,
  XerRelationshipRaw,
  XerTaskRaw,
  XerWbsRaw,
} from "./xer-model-types";
import {
  appendXerAdaptationLog,
  type XerAdaptationLogEntry,
  type XerAdaptationLogWriter,
} from "./xer-adaptation-log";

export type XerAdaptationDiagnosticSeverity = "error" | "warning" | "info";

export type XerAdaptationDiagnosticCode =
  | "PROJECT_NOT_FOUND"
  | "MULTIPLE_PROJECTS"
  | "WBS_ROOT_MISSING"
  | "WBS_DUPLICATE_ID"
  | "WBS_MULTIPLE_ROOTS"
  | "WBS_ORPHAN"
  | "TASK_WITHOUT_WBS"
  | "TASK_DUPLICATE_ID"
  | "TASK_SKIPPED_MISSING_ID"
  | "TASK_INVALID_DATE_RANGE"
  | "RELATIONSHIP_SKIPPED_MISSING_TASK"
  | "RELATIONSHIP_DUPLICATE"
  | "RELATIONSHIP_UNSUPPORTED_TYPE"
  | "RELATIONSHIP_SELF_REFERENCE"
  | "EMPTY_PROJECT_STRUCTURE"
  | "PROJECT_FILTER_MISMATCH";

export type XerAdaptationDiagnostic = {
  severity: XerAdaptationDiagnosticSeverity;
  code: XerAdaptationDiagnosticCode;
  message: string;
  entityType?: string;
  entityId?: string;
};

export type XerAdaptationMetadata = {
  sourceFormat: "xer";
  selectedProjectId: string;
  taskCountRaw: number;
  taskCountAdapted: number;
  wbsCountRaw: number;
  wbsCountAdapted: number;
  relationshipCountRaw: number;
  relationshipCountAdapted: number;
  resourceCountRaw: number;
  taskResourceCountRaw: number;
  diagnosticCountsBySeverity: Record<XerAdaptationDiagnosticSeverity, number>;
  diagnosticCountsByCode: Partial<Record<XerAdaptationDiagnosticCode, number>>;
};

export type XerProjectAdaptationResult = {
  project: Project;
  diagnostics: XerAdaptationDiagnostic[];
  metadata: XerAdaptationMetadata;
};

export type AdaptXerToProjectOptions = {
  logEvent?: XerAdaptationLogWriter;
};

export class XerProjectAdapterError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "MULTIPLE_PROJECTS"
      | "WBS_ROOT_MISSING"
      | "EMPTY_PROJECT_STRUCTURE",
    message: string,
  ) {
    super(message);
    this.name = "XerProjectAdapterError";
  }
}

type WbsNode = {
  id: string;
  taskId: string;
  parentId?: string;
  name: string;
  shortName: string;
  sequence: number | null;
  outlineLevel: number;
  outlineNumber: string;
  raw: XerWbsRaw;
};

type FilteredRows<T> = {
  rows: T[];
  mismatchedCount: number;
};

const WBS_TASK_ID_PREFIX = "xer-wbs:";
const SUPPORTED_RELATIONSHIP_TYPES = new Set(["PR_FS", "PR_SS", "PR_FF", "PR_SF"]);

function createDiagnostic(
  severity: XerAdaptationDiagnosticSeverity,
  code: XerAdaptationDiagnosticCode,
  message: string,
  entityType?: string,
  entityId?: string,
): XerAdaptationDiagnostic {
  return {
    severity,
    code,
    message,
    entityType,
    entityId,
  };
}

function trimValue(value?: string): string {
  return value?.trim() ?? "";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.map(trimValue).find((value) => value.length > 0) ?? "";
}

function maybeParseNumber(value?: string): number {
  const trimmed = trimValue(value);
  if (!trimmed) {
    return 0;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maybeParseSequence(value?: string): number | null {
  const trimmed = trimValue(value);
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeParseDate(value?: string): string {
  const trimmed = trimValue(value);
  return trimmed || "";
}

function isValidDateValue(value?: string): value is string {
  const trimmed = trimValue(value);
  if (!trimmed) {
    return false;
  }

  return Number.isFinite(Date.parse(trimmed));
}

function resolveProjectReferenceDate(project: XerProjectRecord): string {
  const candidates = [
    project.sum_data_date,
    project.next_data_date,
    project.last_tasksum_date,
    project.last_recalc_date,
  ];

  return candidates.find(isValidDateValue) ?? "";
}

function hasInvalidDateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) {
    return false;
  }

  const start = Date.parse(startDate);
  const end = Date.parse(endDate);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  return start > end;
}

function compareNatural(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareWbsRows(left: XerWbsRaw, right: XerWbsRaw): number {
  const leftSeq = maybeParseSequence(left.seq_num);
  const rightSeq = maybeParseSequence(right.seq_num);

  if (leftSeq !== null && rightSeq !== null && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  if (leftSeq !== null && rightSeq === null) {
    return -1;
  }

  if (leftSeq === null && rightSeq !== null) {
    return 1;
  }

  return (
    compareNatural(firstNonEmpty(left.wbs_short_name), firstNonEmpty(right.wbs_short_name)) ||
    compareNatural(firstNonEmpty(left.wbs_name), firstNonEmpty(right.wbs_name)) ||
    compareNatural(firstNonEmpty(left.wbs_id), firstNonEmpty(right.wbs_id))
  );
}

function compareTasks(left: XerTaskRaw, right: XerTaskRaw): number {
  return (
    compareNatural(firstNonEmpty(left.task_code), firstNonEmpty(right.task_code)) ||
    compareNatural(firstNonEmpty(left.task_name), firstNonEmpty(right.task_name)) ||
    compareNatural(firstNonEmpty(left.wbs_id), firstNonEmpty(right.wbs_id)) ||
    compareNatural(firstNonEmpty(left.task_id), firstNonEmpty(right.task_id))
  );
}

function countBySeverity(
  diagnostics: XerAdaptationDiagnostic[],
): Record<XerAdaptationDiagnosticSeverity, number> {
  return diagnostics.reduce<Record<XerAdaptationDiagnosticSeverity, number>>(
    (counts, diagnostic) => {
      counts[diagnostic.severity] += 1;
      return counts;
    },
    {
      error: 0,
      warning: 0,
      info: 0,
    },
  );
}

function countByCode(
  diagnostics: XerAdaptationDiagnostic[],
): Partial<Record<XerAdaptationDiagnosticCode, number>> {
  return diagnostics.reduce<Partial<Record<XerAdaptationDiagnosticCode, number>>>(
    (counts, diagnostic) => {
      counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

function selectSingleProject(projects: XerProjectRecord[]): XerProjectRecord {
  const validProjects = projects.filter((project) => trimValue(project.proj_id).length > 0);

  if (validProjects.length === 0) {
    throw new XerProjectAdapterError(
      "PROJECT_NOT_FOUND",
      "Cannot adapt XER to Project: exactly one PROJECT record with proj_id is required.",
    );
  }

  if (validProjects.length > 1) {
    throw new XerProjectAdapterError(
      "MULTIPLE_PROJECTS",
      "Cannot adapt XER to Project: multiple PROJECT records were found.",
    );
  }

  return validProjects[0];
}

function filterRowsByProject<T extends Record<string, string>>(
  rows: T[],
  selectedProjectId: string,
): FilteredRows<T> {
  let mismatchedCount = 0;
  const filteredRows: T[] = [];

  for (const row of rows) {
    const rowProjectId = trimValue(row.proj_id);
    if (!rowProjectId || rowProjectId === selectedProjectId) {
      filteredRows.push(row);
      continue;
    }

    mismatchedCount += 1;
  }

  return {
    rows: filteredRows,
    mismatchedCount,
  };
}

function pushProjectFilterMismatch(
  diagnostics: XerAdaptationDiagnostic[],
  entityType: string,
  selectedProjectId: string,
  mismatchedCount: number,
): void {
  if (mismatchedCount === 0) {
    return;
  }

  diagnostics.push(
    createDiagnostic(
      "info",
      "PROJECT_FILTER_MISMATCH",
      `${mismatchedCount} ${entityType} record(s) were ignored because proj_id did not match selected project ${selectedProjectId}.`,
      entityType,
      selectedProjectId,
    ),
  );
}

function collectProjectWbs(
  xer: XerProjectRaw,
  selectedProjectId: string,
  diagnostics: XerAdaptationDiagnostic[],
): XerWbsRaw[] {
  const filtered = filterRowsByProject(xer.wbs, selectedProjectId);
  pushProjectFilterMismatch(diagnostics, "PROJWBS", selectedProjectId, filtered.mismatchedCount);
  return filtered.rows;
}

function collectProjectTasks(
  xer: XerProjectRaw,
  selectedProjectId: string,
  diagnostics: XerAdaptationDiagnostic[],
): XerTaskRaw[] {
  const filtered = filterRowsByProject(xer.tasks, selectedProjectId);
  pushProjectFilterMismatch(diagnostics, "TASK", selectedProjectId, filtered.mismatchedCount);
  return filtered.rows;
}

function collectProjectRelationships(
  xer: XerProjectRaw,
  selectedProjectId: string,
  diagnostics: XerAdaptationDiagnostic[],
): XerRelationshipRaw[] {
  const filtered = filterRowsByProject(xer.relationships, selectedProjectId);
  pushProjectFilterMismatch(diagnostics, "TASKPRED", selectedProjectId, filtered.mismatchedCount);
  return filtered.rows;
}

function collectProjectTaskResources(
  xer: XerProjectRaw,
  selectedProjectId: string,
  diagnostics: XerAdaptationDiagnostic[],
) {
  const filtered = filterRowsByProject(xer.taskResources, selectedProjectId);
  pushProjectFilterMismatch(diagnostics, "TASKRSRC", selectedProjectId, filtered.mismatchedCount);
  return filtered.rows;
}

function collectProjectResources(
  xer: XerProjectRaw,
  selectedProjectId: string,
  diagnostics: XerAdaptationDiagnostic[],
) {
  const filtered = filterRowsByProject(xer.resources, selectedProjectId);
  pushProjectFilterMismatch(diagnostics, "RSRC", selectedProjectId, filtered.mismatchedCount);
  return filtered.rows;
}

function sanitizeWbsRows(
  wbsRows: XerWbsRaw[],
  diagnostics: XerAdaptationDiagnostic[],
): XerWbsRaw[] {
  const sanitizedRows: XerWbsRaw[] = [];
  const seenIds = new Set<string>();

  for (const row of [...wbsRows].sort(compareWbsRows)) {
    const wbsId = trimValue(row.wbs_id);
    if (!wbsId) {
      continue;
    }

    if (seenIds.has(wbsId)) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "WBS_DUPLICATE_ID",
          `Duplicate PROJWBS ${wbsId} was ignored after the first occurrence.`,
          "PROJWBS",
          wbsId,
        ),
      );
      continue;
    }

    seenIds.add(wbsId);
    sanitizedRows.push(row);
  }

  return sanitizedRows;
}

function buildWbsIndex(wbsRows: XerWbsRaw[]): Map<string, XerWbsRaw> {
  return new Map(wbsRows.map((wbs) => [trimValue(wbs.wbs_id), wbs] as const));
}

function buildWbsTree(
  wbsRows: XerWbsRaw[],
  diagnostics: XerAdaptationDiagnostic[],
): WbsNode[] {
  const sanitizedRows = sanitizeWbsRows(wbsRows, diagnostics);
  const wbsById = buildWbsIndex(sanitizedRows);
  const declaredRootIds = new Set(
    sanitizedRows
      .filter((wbs) => trimValue(wbs.proj_node_flag).toUpperCase() === "Y")
      .map((wbs) => trimValue(wbs.wbs_id))
      .filter(Boolean),
  );

  if (declaredRootIds.size === 0) {
    diagnostics.push(
      createDiagnostic(
        "error",
        "WBS_ROOT_MISSING",
        "No PROJWBS root record with proj_node_flag=Y was found.",
        "PROJWBS",
      ),
    );
  }

  if (wbsById.size === 0) {
    throw new XerProjectAdapterError(
      "WBS_ROOT_MISSING",
      "Cannot adapt XER to Project: at least one PROJWBS record with wbs_id is required.",
    );
  }

  const childrenByParentId = new Map<string | undefined, XerWbsRaw[]>();
  const rootCandidates: XerWbsRaw[] = [];

  for (const wbs of sanitizedRows) {
    const wbsId = trimValue(wbs.wbs_id);
    const parentWbsId = trimValue(wbs.parent_wbs_id);
    const parentExists = parentWbsId.length > 0 && wbsById.has(parentWbsId);
    const isDeclaredRoot = declaredRootIds.has(wbsId);
    const isRootCandidate = isDeclaredRoot || !parentExists;

    if (parentWbsId.length > 0 && !parentExists && !isDeclaredRoot) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "WBS_ORPHAN",
          `PROJWBS ${wbsId} references missing parent_wbs_id ${parentWbsId}.`,
          "PROJWBS",
          wbsId,
        ),
      );
    }

    if (isRootCandidate) {
      rootCandidates.push(wbs);
      const rootChildren = childrenByParentId.get(undefined) ?? [];
      rootChildren.push(wbs);
      childrenByParentId.set(undefined, rootChildren);
      continue;
    }

    const children = childrenByParentId.get(parentWbsId) ?? [];
    children.push(wbs);
    childrenByParentId.set(parentWbsId, children);
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareWbsRows);
  }

  const normalizedRootCandidates = [...rootCandidates].sort(compareWbsRows);
  if (normalizedRootCandidates.length > 1) {
    diagnostics.push(
      createDiagnostic(
        "warning",
        "WBS_MULTIPLE_ROOTS",
        `Multiple WBS roots were detected (${normalizedRootCandidates
          .map((root) => trimValue(root.wbs_id))
          .join(", ")}). Top-level summaries were preserved deterministically.`,
        "PROJWBS",
      ),
    );
  }

  const nodes: WbsNode[] = [];
  const visited = new Set<string>();

  function visit(wbs: XerWbsRaw, parentNode?: WbsNode): void {
    const wbsId = trimValue(wbs.wbs_id);
    if (!wbsId || visited.has(wbsId)) {
      return;
    }

    visited.add(wbsId);
    const shortName = firstNonEmpty(wbs.wbs_short_name, wbsId);
    const node: WbsNode = {
      id: wbsId,
      taskId: `${WBS_TASK_ID_PREFIX}${wbsId}`,
      parentId: parentNode?.taskId,
      name: firstNonEmpty(wbs.wbs_name, wbs.wbs_short_name, wbsId),
      shortName,
      sequence: maybeParseSequence(wbs.seq_num),
      outlineLevel: parentNode ? parentNode.outlineLevel + 1 : 1,
      outlineNumber: parentNode ? `${parentNode.outlineNumber}.${shortName}` : shortName,
      raw: wbs,
    };

    nodes.push(node);

    for (const child of childrenByParentId.get(wbsId) ?? []) {
      visit(child, node);
    }
  }

  for (const root of normalizedRootCandidates) {
    visit(root);
  }

  return nodes;
}

function mapWbsNodeToTask(node: WbsNode): Task {
  return {
    id: node.taskId,
    name: node.name,
    startDate: "",
    endDate: "",
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
    outlineLevel: node.outlineLevel,
    outlineNumber: node.outlineNumber,
    isSummary: true,
    parentId: node.parentId,
    resourceIds: [],
  };
}

function adaptTasks(
  taskRows: XerTaskRaw[],
  wbsById: Map<string, WbsNode>,
  diagnostics: XerAdaptationDiagnostic[],
): Task[] {
  const adaptedTasks: Task[] = [];
  const seenTaskIds = new Set<string>();

  for (const task of [...taskRows].sort(compareTasks)) {
    const taskId = trimValue(task.task_id);
    if (!taskId) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "TASK_SKIPPED_MISSING_ID",
          "TASK record without task_id was skipped.",
          "TASK",
        ),
      );
      continue;
    }

    if (seenTaskIds.has(taskId)) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "TASK_DUPLICATE_ID",
          `Duplicate TASK ${taskId} was ignored after the first occurrence.`,
          "TASK",
          taskId,
        ),
      );
      continue;
    }

    seenTaskIds.add(taskId);

    const parentWbs = wbsById.get(trimValue(task.wbs_id));
    if (!parentWbs) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "TASK_WITHOUT_WBS",
          `TASK ${taskId} references missing or invalid wbs_id ${trimValue(task.wbs_id) || "(blank)"}.`,
          "TASK",
          taskId,
        ),
      );
      continue;
    }

    const startDate = maybeParseDate(
      firstNonEmpty(task.start_date, task.early_start_date, task.restart_date, task.target_start_date),
    );
    const endDate = maybeParseDate(
      firstNonEmpty(task.end_date, task.early_end_date, task.reend_date, task.target_end_date),
    );

    if (hasInvalidDateRange(startDate, endDate)) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "TASK_INVALID_DATE_RANGE",
          `TASK ${taskId} has start date after end date.`,
          "TASK",
          taskId,
        ),
      );
    }

    const localOutline = firstNonEmpty(task.task_code, taskId);

    adaptedTasks.push({
      id: taskId,
      name: firstNonEmpty(task.task_name, task.task_code, taskId),
      startDate,
      endDate,
      percentComplete: maybeParseNumber(task.phys_complete_pct),
      physicalPercentComplete: maybeParseNumber(task.phys_complete_pct),
      actualStartDate: maybeParseDate(task.act_start_date),
      actualEndDate: maybeParseDate(task.act_end_date),
      actualDurationHours: 0,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      baselineStartDate: "",
      baselineEndDate: "",
      baselineDurationHours: 0,
      resumeDate: maybeParseDate(task.restart_date),
      stopDate: "",
      duration: maybeParseNumber(task.target_drtn_hr_cnt),
      outlineLevel: parentWbs.outlineLevel + 1,
      outlineNumber: `${parentWbs.outlineNumber}.${localOutline}`,
      isSummary: false,
      parentId: parentWbs.taskId,
      resourceIds: [],
    });
  }

  return adaptedTasks;
}

function normalizeRelationshipType(type?: string): string | null {
  const normalized = trimValue(type);
  return SUPPORTED_RELATIONSHIP_TYPES.has(normalized) ? normalized : null;
}

function adaptRelationships(
  relationshipRows: XerRelationshipRaw[],
  adaptedTaskIds: Set<string>,
  diagnostics: XerAdaptationDiagnostic[],
): Dependency[] {
  const dependencies: Dependency[] = [];
  const seen = new Set<string>();

  for (const relationship of relationshipRows) {
    const taskId = trimValue(relationship.task_id);
    const predTaskId = trimValue(relationship.pred_task_id);
    const relationshipId = firstNonEmpty(relationship.task_pred_id, `${predTaskId}-${taskId}`);

    if (!taskId || !predTaskId || !adaptedTaskIds.has(taskId) || !adaptedTaskIds.has(predTaskId)) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "RELATIONSHIP_SKIPPED_MISSING_TASK",
          `TASKPRED ${relationshipId} references a missing predecessor or successor task.`,
          "TASKPRED",
          relationshipId,
        ),
      );
      continue;
    }

    if (taskId === predTaskId) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "RELATIONSHIP_SELF_REFERENCE",
          `TASKPRED ${relationshipId} references the same task as predecessor and successor.`,
          "TASKPRED",
          relationshipId,
        ),
      );
      continue;
    }

    const relationshipType = normalizeRelationshipType(relationship.pred_type);
    if (!relationshipType) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "RELATIONSHIP_UNSUPPORTED_TYPE",
          `TASKPRED ${relationshipId} has unsupported relationship type ${trimValue(relationship.pred_type) || "(blank)"}.`,
          "TASKPRED",
          relationshipId,
        ),
      );
      continue;
    }

    const dedupeKey = `${predTaskId}->${taskId}:${relationshipType}:${trimValue(relationship.lag_hr_cnt)}`;
    if (seen.has(dedupeKey)) {
      diagnostics.push(
        createDiagnostic(
          "info",
          "RELATIONSHIP_DUPLICATE",
          `Duplicate TASKPRED ${relationshipId} was ignored after an equivalent relationship was already adapted.`,
          "TASKPRED",
          relationshipId,
        ),
      );
      continue;
    }

    seen.add(dedupeKey);
    dependencies.push({
      id: relationshipId,
      fromTaskId: predTaskId,
      toTaskId: taskId,
      type: relationshipType,
    });
  }

  return dependencies.sort((left, right) => {
    return (
      compareNatural(left.fromTaskId, right.fromTaskId) ||
      compareNatural(left.toTaskId, right.toTaskId) ||
      compareNatural(left.type, right.type) ||
      compareNatural(left.id, right.id)
    );
  });
}

function buildAdaptationMetadata(input: {
  selectedProjectId: string;
  taskCountRaw: number;
  taskCountAdapted: number;
  wbsCountRaw: number;
  wbsCountAdapted: number;
  relationshipCountRaw: number;
  relationshipCountAdapted: number;
  resourceCountRaw: number;
  taskResourceCountRaw: number;
  diagnostics: XerAdaptationDiagnostic[];
}): XerAdaptationMetadata {
  return {
    sourceFormat: "xer",
    selectedProjectId: input.selectedProjectId,
    taskCountRaw: input.taskCountRaw,
    taskCountAdapted: input.taskCountAdapted,
    wbsCountRaw: input.wbsCountRaw,
    wbsCountAdapted: input.wbsCountAdapted,
    relationshipCountRaw: input.relationshipCountRaw,
    relationshipCountAdapted: input.relationshipCountAdapted,
    resourceCountRaw: input.resourceCountRaw,
    taskResourceCountRaw: input.taskResourceCountRaw,
    diagnosticCountsBySeverity: countBySeverity(input.diagnostics),
    diagnosticCountsByCode: countByCode(input.diagnostics),
  };
}

function createLogEntry(input: {
  event: string;
  severity: XerAdaptationDiagnosticSeverity;
  message: string;
  selectedProjectId?: string;
  diagnosticCode?: XerAdaptationDiagnosticCode;
  entityType?: string;
  entityId?: string;
  context?: Record<string, unknown>;
}): XerAdaptationLogEntry {
  return {
    timestamp: new Date().toISOString(),
    source: "primavera-xer",
    event: input.event,
    severity: input.severity,
    message: input.message,
    selectedProjectId: input.selectedProjectId,
    diagnosticCode: input.diagnosticCode,
    entityType: input.entityType,
    entityId: input.entityId,
    context: input.context,
  };
}

function safeLog(logEvent: XerAdaptationLogWriter, entry: XerAdaptationLogEntry): void {
  try {
    const result = logEvent(entry);
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch((error) => {
        console.warn("[adaptXerToProject] failed to write XER adaptation log entry", {
          entry,
          error,
        });
      });
    }
  } catch (error) {
    console.warn("[adaptXerToProject] failed to write XER adaptation log entry", {
      entry,
      error,
    });
  }
}

function logDiagnostics(
  diagnostics: XerAdaptationDiagnostic[],
  selectedProjectId: string,
  logEvent: XerAdaptationLogWriter,
): void {
  for (const diagnostic of diagnostics) {
    safeLog(
      logEvent,
      createLogEntry({
        event: "adaptation_diagnostic",
        severity: diagnostic.severity,
        message: diagnostic.message,
        selectedProjectId,
        diagnosticCode: diagnostic.code,
        entityType: diagnostic.entityType,
        entityId: diagnostic.entityId,
      }),
    );
  }
}

export function adaptXerToProject(
  xerModel: XerProjectRaw,
  options?: AdaptXerToProjectOptions,
): XerProjectAdaptationResult {
  const logEvent = options?.logEvent ?? appendXerAdaptationLog;
  safeLog(
    logEvent,
    createLogEntry({
      event: "adaptation_started",
      severity: "info",
      message: "Starting isolated XER to Project adaptation.",
      context: {
        sourceTables: xerModel.sourceTables,
        projectRecords: xerModel.projects.length,
        wbsRecords: xerModel.wbs.length,
        taskRecords: xerModel.tasks.length,
        relationshipRecords: xerModel.relationships.length,
      },
    }),
  );

  try {
    const diagnostics: XerAdaptationDiagnostic[] = [];
    const selectedProject = selectSingleProject(xerModel.projects);
    const selectedProjectId = trimValue(selectedProject.proj_id);
    const projectReferenceDate = resolveProjectReferenceDate(selectedProject);
    safeLog(
      logEvent,
      createLogEntry({
        event: "project_selected",
        severity: "info",
        message: `Selected PROJECT ${selectedProjectId} for isolated XER adaptation.`,
        selectedProjectId,
        context: {
          projectShortName: firstNonEmpty(selectedProject.proj_short_name),
          projectName: firstNonEmpty(selectedProject.proj_name),
          referenceDate: projectReferenceDate || null,
        },
      }),
    );
    const projectWbsRows = collectProjectWbs(xerModel, selectedProjectId, diagnostics);
    const projectTaskRows = collectProjectTasks(xerModel, selectedProjectId, diagnostics);
    const relationshipRows = collectProjectRelationships(xerModel, selectedProjectId, diagnostics);
    const taskResourceRows = collectProjectTaskResources(xerModel, selectedProjectId, diagnostics);
    const resourceRows = collectProjectResources(xerModel, selectedProjectId, diagnostics);
    safeLog(
      logEvent,
      createLogEntry({
        event: "raw_counts_collected",
        severity: "info",
        message: `Collected raw XER rows for project ${selectedProjectId}.`,
        selectedProjectId,
        context: {
          wbsCountRaw: projectWbsRows.length,
          taskCountRaw: projectTaskRows.length,
          relationshipCountRaw: relationshipRows.length,
          resourceCountRaw: resourceRows.length,
          taskResourceCountRaw: taskResourceRows.length,
        },
      }),
    );

    if (projectWbsRows.length === 0) {
      throw new XerProjectAdapterError(
        "EMPTY_PROJECT_STRUCTURE",
        `Cannot adapt XER to Project: no PROJWBS records found for project ${selectedProjectId}.`,
      );
    }

    const wbsNodes = buildWbsTree(projectWbsRows, diagnostics);
    if (wbsNodes.length === 0) {
      throw new XerProjectAdapterError(
        "EMPTY_PROJECT_STRUCTURE",
        `Cannot adapt XER to Project: no usable WBS nodes were found for project ${selectedProjectId}.`,
      );
    }

    const wbsById = new Map(wbsNodes.map((node) => [node.id, node] as const));
    const taskNodes = adaptTasks(projectTaskRows, wbsById, diagnostics);
    const adaptedOperationalTaskIds = new Set(taskNodes.map((task) => task.id));
    const dependencies = adaptRelationships(relationshipRows, adaptedOperationalTaskIds, diagnostics);
    const wbsTasks = wbsNodes.map(mapWbsNodeToTask);
    const tasks = [...wbsTasks, ...taskNodes];

    if (taskNodes.length === 0) {
      diagnostics.push(
        createDiagnostic(
          "info",
          "EMPTY_PROJECT_STRUCTURE",
          `Project ${selectedProjectId} adapted only structural WBS nodes and no operational TASK rows.`,
          "PROJECT",
          selectedProjectId,
        ),
      );
    }

    logDiagnostics(diagnostics, selectedProjectId, logEvent);
    const metadata = buildAdaptationMetadata({
      selectedProjectId,
      taskCountRaw: projectTaskRows.length,
      taskCountAdapted: taskNodes.length,
      wbsCountRaw: projectWbsRows.length,
      wbsCountAdapted: wbsNodes.length,
      relationshipCountRaw: relationshipRows.length,
      relationshipCountAdapted: dependencies.length,
      resourceCountRaw: resourceRows.length,
      taskResourceCountRaw: taskResourceRows.length,
      diagnostics,
    });
    safeLog(
      logEvent,
      createLogEntry({
        event: "adaptation_completed",
        severity: diagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "error"
          : diagnostics.length > 0
            ? "warning"
            : "info",
        message: `Completed isolated XER adaptation for project ${selectedProjectId}.`,
        selectedProjectId,
        context: {
          taskCountRaw: metadata.taskCountRaw,
          taskCountAdapted: metadata.taskCountAdapted,
          wbsCountRaw: metadata.wbsCountRaw,
          wbsCountAdapted: metadata.wbsCountAdapted,
          relationshipCountRaw: metadata.relationshipCountRaw,
          relationshipCountAdapted: metadata.relationshipCountAdapted,
          diagnosticCountsBySeverity: metadata.diagnosticCountsBySeverity,
          diagnosticCountsByCode: metadata.diagnosticCountsByCode,
        },
      }),
    );

    return {
      project: {
        id: selectedProjectId,
        name: firstNonEmpty(selectedProject.proj_name, selectedProject.proj_short_name, selectedProjectId),
        statusDate: projectReferenceDate,
        currentDate: projectReferenceDate,
        tasks,
        resources: [],
        dependencies,
      },
      diagnostics,
      metadata,
    };
  } catch (error) {
    if (error instanceof XerProjectAdapterError) {
      safeLog(
        logEvent,
        createLogEntry({
          event: "adaptation_failed",
          severity: "error",
          message: error.message,
          diagnosticCode: error.code,
        }),
      );
    } else {
      safeLog(
        logEvent,
        createLogEntry({
          event: "adaptation_unexpected_failure",
          severity: "error",
          message: error instanceof Error ? error.message : "Unexpected XER adaptation failure.",
          context: error instanceof Error ? { stack: error.stack } : undefined,
        }),
      );
    }

    throw error;
  }
}
