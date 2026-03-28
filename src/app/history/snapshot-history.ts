import type { ProcessInput, ProcessResult } from "../use-cases/process-mpp";

export type ProjectIdentity = {
  key: string;
  name: string;
  anchorDate: string;
};

export type ProjectSnapshot = {
  capturedAt: string;
  sourceFileName: string;
  projectIdentity: ProjectIdentity;
  projectSummary: {
    id: string;
    name: string;
    finishDate: string;
  };
  taskSummary: {
    totalTasks: number;
    completedTasks: number;
    tasksWithProgress: number;
    tasksWithResources: number;
    tasksWithValidDates: number;
    tasksWithBaseline: number;
    averagePercentComplete?: number;
  };
  diagnosticsSummary: {
    error: number;
    warning: number;
    info: number;
  };
  insightsSummary: {
    status: ProcessResult["insights"]["summary"]["status"];
    warningCount: number;
    highlightCount: number;
    schedulePerformanceStatus?: NonNullable<ProcessResult["insights"]["schedulePerformance"]>["status"];
  };
  taskProgressData: Array<{
    id: string;
    name: string;
    percentComplete: number;
    physicalPercentComplete: number;
    hasActualDates: boolean;
    hasBaseline: boolean;
    isCompleted: boolean;
    endDate: string;
    actualEndDate: string;
    baselineEndDate: string;
  }>;
};

export type ProjectComparison = {
  previousSnapshotAt: string;
  currentSnapshotAt: string;
  projectMatched: boolean;
  metricsDelta: {
    percentCompleteDelta?: number;
    completedTasksDelta: number;
    tasksWithProgressDelta: number;
    warningDelta: number;
    errorDelta: number;
    infoDelta: number;
    finishDateDeltaDays?: number;
    resourceCoverageDelta?: number;
    validDatesCoverageDelta?: number;
    baselineCoverageDelta?: number;
  };
  highlights: string[];
  warnings: string[];
};

function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getFileName(filePath?: string): string {
  if (!filePath) {
    return "unknown.xml";
  }

  const parts = filePath.split(/[/\\]+/);

  return parts[parts.length - 1] || "unknown.xml";
}

function getEarliestAnchorDate(result: ProcessResult): string {
  const candidateDates = result.model.tasks
    .flatMap((task) => [task.startDate, task.baselineStartDate, task.actualStartDate])
    .filter(Boolean)
    .filter((value) => Number.isFinite(Date.parse(value)));

  if (candidateDates.length === 0) {
    return "";
  }

  return [...candidateDates].sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}

function getProjectFinishDate(result: ProcessResult): string {
  const candidateDates = result.model.tasks
    .map((task) => task.endDate)
    .filter(Boolean)
    .filter((value) => Number.isFinite(Date.parse(value)));

  if (candidateDates.length === 0) {
    return "";
  }

  return [...candidateDates].sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function getAveragePercentComplete(result: ProcessResult): number | undefined {
  const values = result.model.tasks
    .map((task) => task.percentComplete)
    .filter((value) => value > 0);

  if (values.length === 0) {
    return undefined;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function getCoverage(count: number, total: number): number | undefined {
  if (total === 0) {
    return undefined;
  }

  return Number((count / total).toFixed(4));
}

function getDelta(current?: number, previous?: number): number | undefined {
  if (current === undefined || previous === undefined) {
    return undefined;
  }

  return Number((current - previous).toFixed(2));
}

function getFinishDateDeltaDays(currentFinishDate: string, previousFinishDate: string): number | undefined {
  if (!currentFinishDate || !previousFinishDate) {
    return undefined;
  }

  const currentValue = Date.parse(currentFinishDate);
  const previousValue = Date.parse(previousFinishDate);

  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
    return undefined;
  }

  return Number(((currentValue - previousValue) / (1000 * 60 * 60 * 24)).toFixed(2));
}

export function buildProjectIdentity(result: ProcessResult): ProjectIdentity {
  const name = result.model.name || "unknown-project";
  const anchorDate = getEarliestAnchorDate(result);

  return {
    key: `${normalizeProjectName(name)}::${anchorDate}`,
    name,
    anchorDate,
  };
}

export function buildProjectSnapshot(
  result: ProcessResult,
  input: ProcessInput,
  capturedAt = new Date().toISOString(),
): ProjectSnapshot {
  const totalTasks = result.model.tasks.length;
  const tasksWithProgress = result.model.tasks.filter(
    (task) =>
      task.percentComplete > 0 ||
      task.physicalPercentComplete > 0 ||
      task.actualWorkHours > 0 ||
      task.remainingWorkHours > 0 ||
      task.actualDurationHours > 0 ||
      Boolean(task.actualStartDate || task.actualEndDate),
  ).length;
  const completedTasks = result.model.tasks.filter(
    (task) => task.percentComplete >= 100 || Boolean(task.actualEndDate),
  ).length;
  const tasksWithResources = result.insights.metrics.tasksWithResources;
  const tasksWithValidDates = result.insights.metrics.tasksWithValidDates;
  const tasksWithBaseline = result.insights.metrics.tasksWithBaseline;

  return {
    capturedAt,
    sourceFileName: getFileName(input.filePath),
    projectIdentity: buildProjectIdentity(result),
    projectSummary: {
      id: result.model.id,
      name: result.model.name,
      finishDate: getProjectFinishDate(result),
    },
    taskSummary: {
      totalTasks,
      completedTasks,
      tasksWithProgress,
      tasksWithResources,
      tasksWithValidDates,
      tasksWithBaseline,
      averagePercentComplete: getAveragePercentComplete(result),
    },
    diagnosticsSummary: {
      error: result.diagnostics.errors.length,
      warning: result.diagnostics.warnings.length,
      info: result.diagnostics.info.length,
    },
    insightsSummary: {
      status: result.insights.summary.status,
      warningCount: result.insights.warnings.length,
      highlightCount: result.insights.highlights.length,
      schedulePerformanceStatus: result.insights.schedulePerformance?.status,
    },
    taskProgressData: result.model.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      percentComplete: task.percentComplete,
      physicalPercentComplete: task.physicalPercentComplete,
      hasActualDates: Boolean(task.actualStartDate || task.actualEndDate),
      hasBaseline: Boolean(task.baselineStartDate || task.baselineEndDate || task.baselineDurationHours > 0),
      isCompleted: task.percentComplete >= 100 || Boolean(task.actualEndDate),
      endDate: task.endDate,
      actualEndDate: task.actualEndDate,
      baselineEndDate: task.baselineEndDate,
    })),
  };
}

export function findLatestCompatibleSnapshot(
  currentSnapshot: ProjectSnapshot,
  snapshots: ProjectSnapshot[],
): ProjectSnapshot | undefined {
  return snapshots
    .filter((snapshot) => snapshot.projectIdentity.key === currentSnapshot.projectIdentity.key)
    .filter((snapshot) => snapshot.capturedAt < currentSnapshot.capturedAt)
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0];
}

export function compareProjectSnapshots(
  previousSnapshot: ProjectSnapshot,
  currentSnapshot: ProjectSnapshot,
): ProjectComparison {
  const previousTotalTasks = previousSnapshot.taskSummary.totalTasks;
  const currentTotalTasks = currentSnapshot.taskSummary.totalTasks;
  const resourceCoverageDelta = getDelta(
    getCoverage(currentSnapshot.taskSummary.tasksWithResources, currentTotalTasks),
    getCoverage(previousSnapshot.taskSummary.tasksWithResources, previousTotalTasks),
  );
  const validDatesCoverageDelta = getDelta(
    getCoverage(currentSnapshot.taskSummary.tasksWithValidDates, currentTotalTasks),
    getCoverage(previousSnapshot.taskSummary.tasksWithValidDates, previousTotalTasks),
  );
  const baselineCoverageDelta = getDelta(
    getCoverage(currentSnapshot.taskSummary.tasksWithBaseline, currentTotalTasks),
    getCoverage(previousSnapshot.taskSummary.tasksWithBaseline, previousTotalTasks),
  );
  const percentCompleteDelta = getDelta(
    currentSnapshot.taskSummary.averagePercentComplete,
    previousSnapshot.taskSummary.averagePercentComplete,
  );
  const completedTasksDelta = currentSnapshot.taskSummary.completedTasks - previousSnapshot.taskSummary.completedTasks;
  const tasksWithProgressDelta =
    currentSnapshot.taskSummary.tasksWithProgress - previousSnapshot.taskSummary.tasksWithProgress;
  const errorDelta = currentSnapshot.diagnosticsSummary.error - previousSnapshot.diagnosticsSummary.error;
  const warningDelta = currentSnapshot.diagnosticsSummary.warning - previousSnapshot.diagnosticsSummary.warning;
  const infoDelta = currentSnapshot.diagnosticsSummary.info - previousSnapshot.diagnosticsSummary.info;
  const finishDateDeltaDays = getFinishDateDeltaDays(
    currentSnapshot.projectSummary.finishDate,
    previousSnapshot.projectSummary.finishDate,
  );

  const highlights: string[] = [];
  const warnings: string[] = [];

  if (percentCompleteDelta !== undefined && percentCompleteDelta > 0) {
    highlights.push(`O percentual concluido evoluiu ${percentCompleteDelta} pontos desde a ultima leitura.`);
  }

  if (completedTasksDelta > 0) {
    highlights.push(`O numero de tasks concluidas aumentou em ${completedTasksDelta}.`);
  }

  if (tasksWithProgressDelta > 0) {
    highlights.push(`Mais ${tasksWithProgressDelta} tasks passaram a registrar progresso.`);
  }

  if (warningDelta < 0) {
    highlights.push(`O numero de warnings reduziu em ${Math.abs(warningDelta)}.`);
  }

  if (errorDelta < 0) {
    highlights.push(`O numero de errors reduziu em ${Math.abs(errorDelta)}.`);
  }

  if (percentCompleteDelta !== undefined && percentCompleteDelta < 0) {
    warnings.push(`O percentual concluido regrediu ${Math.abs(percentCompleteDelta)} pontos desde a ultima leitura.`);
  }

  if (warningDelta > 0) {
    warnings.push(`O numero de warnings aumentou em ${warningDelta}.`);
  }

  if (errorDelta > 0) {
    warnings.push(`O numero de errors aumentou em ${errorDelta}.`);
  }

  if (finishDateDeltaDays !== undefined && finishDateDeltaDays > 0) {
    warnings.push(`A data final prevista avancou ${finishDateDeltaDays} dias.`);
  }

  if (resourceCoverageDelta !== undefined && resourceCoverageDelta < 0) {
    warnings.push("A cobertura de recursos diminuiu desde a ultima leitura.");
  }

  return {
    previousSnapshotAt: previousSnapshot.capturedAt,
    currentSnapshotAt: currentSnapshot.capturedAt,
    projectMatched: previousSnapshot.projectIdentity.key === currentSnapshot.projectIdentity.key,
    metricsDelta: {
      percentCompleteDelta,
      completedTasksDelta,
      tasksWithProgressDelta,
      warningDelta,
      errorDelta,
      infoDelta,
      finishDateDeltaDays,
      resourceCoverageDelta,
      validDatesCoverageDelta,
      baselineCoverageDelta,
    },
    highlights,
    warnings,
  };
}
