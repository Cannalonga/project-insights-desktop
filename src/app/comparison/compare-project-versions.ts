import type { Task } from "../../core/model/task";
import type { ProcessResult } from "../use-cases/process-mpp";

export type TaskMatchMethod = "task_id" | "outline_number" | "name_structure";

export type ComparedTaskDelta = {
  taskId: string;
  taskIdentifier: string;
  taskName: string;
  matchMethod: TaskMatchMethod;
  baseProgressPercent: number;
  currentProgressPercent: number;
  deltaProgressPercent: number;
};

export type VersionComparisonSummary = {
  baseFileName: string;
  currentFileName: string;
  projectProgress: {
    basePercent: number;
    currentPercent: number;
    deltaPercent: number;
  };
  matching: {
    matchedCount: number;
    newTasksCount: number;
    removedTasksCount: number;
    byTaskId: number;
    byOutlineNumber: number;
    byNameStructure: number;
  };
  mostAdvancedTasks: ComparedTaskDelta[];
  stagnantTasks: ComparedTaskDelta[];
  regressionTasks: ComparedTaskDelta[];
  newTasks: ComparedTaskDelta[];
  removedTasks: ComparedTaskDelta[];
  executiveSummary: string;
  recoveryReading: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function getParentOutline(outlineNumber: string): string {
  const parts = outlineNumber.split(".").filter(Boolean);
  if (parts.length <= 1) {
    return "root";
  }

  return parts.slice(0, -1).join(".");
}

function buildNameStructureKey(task: Task): string {
  return `${getParentOutline(task.outlineNumber || "")}|${normalizeName(task.name)}`;
}

function resolveTaskIdentifier(task: Task): string {
  const prefix = task.outlineNumber?.trim() ? task.outlineNumber.trim() : `[ID:${task.id}]`;
  return `${prefix} - ${task.name}`;
}

function getFileName(filePath: string | undefined): string {
  if (!filePath) {
    return "arquivo-desconhecido";
  }

  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || "arquivo-desconhecido";
}

function isComparableTask(task: Task): boolean {
  return !task.isSummary && Boolean(task.name?.trim());
}

function buildCandidateMap(tasks: Task[], builder: (task: Task) => string | null): Map<string, Task[]> {
  const map = new Map<string, Task[]>();

  for (const task of tasks) {
    const key = builder(task);
    if (!key) {
      continue;
    }

    const bucket = map.get(key) ?? [];
    bucket.push(task);
    map.set(key, bucket);
  }

  return map;
}

function uniqueMatch(
  task: Task,
  sourceMap: Map<string, Task[]>,
  builder: (task: Task) => string | null,
): Task | undefined {
  const key = builder(task);
  if (!key) {
    return undefined;
  }

  const matches = sourceMap.get(key) ?? [];
  if (matches.length !== 1) {
    return undefined;
  }

  return matches[0];
}

function buildComparedTaskDelta(task: Task, matchMethod: TaskMatchMethod, baseProgressPercent: number): ComparedTaskDelta {
  return {
    taskId: task.id,
    taskIdentifier: resolveTaskIdentifier(task),
    taskName: task.name,
    matchMethod,
    baseProgressPercent,
    currentProgressPercent: task.percentComplete,
    deltaProgressPercent: round2(task.percentComplete - baseProgressPercent),
  };
}

function sortByPositiveDelta(items: ComparedTaskDelta[]): ComparedTaskDelta[] {
  return items.slice().sort((left, right) => {
    if (right.deltaProgressPercent !== left.deltaProgressPercent) {
      return right.deltaProgressPercent - left.deltaProgressPercent;
    }

    return left.taskIdentifier.localeCompare(right.taskIdentifier, "pt-BR");
  });
}

function sortByIdentifier(items: ComparedTaskDelta[]): ComparedTaskDelta[] {
  return items.slice().sort((left, right) => left.taskIdentifier.localeCompare(right.taskIdentifier, "pt-BR"));
}

function buildExecutiveSummary(deltaPercent: number): string {
  if (deltaPercent >= 15) {
    return "Houve avanço forte entre as duas versões, com evolução clara do projeto no período comparado.";
  }

  if (deltaPercent >= 5) {
    return "Houve avanço moderado entre as duas versões, mas a recuperação ainda depende de continuidade operacional.";
  }

  if (deltaPercent > 0) {
    return "Houve avanço discreto entre as duas versões. O projeto evoluiu, mas ainda sem aceleração suficiente para mudar o quadro geral sozinho.";
  }

  if (deltaPercent === 0) {
    return "Não houve evolução relevante entre as duas versões comparadas. O projeto permanece praticamente estagnado no período.";
  }

  return "A versão atual regrediu em relação à base comparada, sinalizando perda de controle da execução.";
}

function buildRecoveryReading(deltaPercent: number, top3Percent: number): string {
  if (deltaPercent < 0) {
    return "Há regressão entre as versões. A recuperação dependerá de ação imediata nas frentes de maior impacto.";
  }

  if (top3Percent >= Math.max(deltaPercent, 0)) {
    return "Existe capacidade de recuperação nas principais frentes, desde que a execução seja imediata.";
  }

  return "A capacidade de recuperação existe, mas permanece limitada diante do ritmo observado entre as duas versões.";
}

export function compareProjectVersions(
  baseResult: ProcessResult,
  currentResult: ProcessResult,
  baseFilePath?: string,
  currentFilePath?: string,
): VersionComparisonSummary {
  const baseTasks = baseResult.model.tasks.filter(isComparableTask);
  const currentTasks = currentResult.model.tasks.filter(isComparableTask);
  const baseById = buildCandidateMap(baseTasks, (task) => (task.id ? task.id : null));
  const baseByOutline = buildCandidateMap(baseTasks, (task) => (task.outlineNumber ? task.outlineNumber : null));
  const baseByNameStructure = buildCandidateMap(baseTasks, (task) => buildNameStructureKey(task));

  const matched = new Map<string, ComparedTaskDelta>();
  const matchedBaseIds = new Set<string>();
  let byTaskId = 0;
  let byOutlineNumber = 0;
  let byNameStructure = 0;

  for (const task of currentTasks) {
    let baseTask = uniqueMatch(task, baseById, (candidate) => (candidate.id ? candidate.id : null));
    let method: TaskMatchMethod | null = null;

    if (baseTask) {
      method = "task_id";
      byTaskId += 1;
    } else {
      baseTask = uniqueMatch(task, baseByOutline, (candidate) => (candidate.outlineNumber ? candidate.outlineNumber : null));
      if (baseTask) {
        method = "outline_number";
        byOutlineNumber += 1;
      } else {
        baseTask = uniqueMatch(task, baseByNameStructure, (candidate) => buildNameStructureKey(candidate));
        if (baseTask) {
          method = "name_structure";
          byNameStructure += 1;
        }
      }
    }

    if (!baseTask || !method) {
      continue;
    }

    matched.set(task.id, buildComparedTaskDelta(task, method, baseTask.percentComplete));
    matchedBaseIds.add(baseTask.id);
  }

  const matchedTasks = [...matched.values()];
  const newTasks = currentTasks
    .filter((task) => !matched.has(task.id))
    .map((task) => buildComparedTaskDelta(task, "name_structure", 0));
  const removedTasks = baseTasks
    .filter((task) => !matchedBaseIds.has(task.id))
    .map((task) => ({
      taskId: task.id,
      taskIdentifier: resolveTaskIdentifier(task),
      taskName: task.name,
      matchMethod: "name_structure" as const,
      baseProgressPercent: task.percentComplete,
      currentProgressPercent: 0,
      deltaProgressPercent: round2(-task.percentComplete),
    }));

  const mostAdvancedTasks = sortByPositiveDelta(matchedTasks.filter((task) => task.deltaProgressPercent > 0)).slice(0, 10);
  const stagnantTasks = sortByIdentifier(matchedTasks.filter((task) => task.deltaProgressPercent === 0)).slice(0, 10);
  const regressionTasks = sortByIdentifier(matchedTasks.filter((task) => task.deltaProgressPercent < 0)).slice(0, 10);
  const projectProgress = {
    basePercent: round2(baseResult.weightModel.progressWeightedPercent),
    currentPercent: round2(currentResult.weightModel.progressWeightedPercent),
    deltaPercent: round2(currentResult.weightModel.progressWeightedPercent - baseResult.weightModel.progressWeightedPercent),
  };

  return {
    baseFileName: getFileName(baseFilePath),
    currentFileName: getFileName(currentFilePath),
    projectProgress,
    matching: {
      matchedCount: matchedTasks.length,
      newTasksCount: newTasks.length,
      removedTasksCount: removedTasks.length,
      byTaskId,
      byOutlineNumber,
      byNameStructure,
    },
    mostAdvancedTasks,
    stagnantTasks,
    regressionTasks,
    newTasks: sortByIdentifier(newTasks).slice(0, 10),
    removedTasks: sortByIdentifier(removedTasks).slice(0, 10),
    executiveSummary: buildExecutiveSummary(projectProgress.deltaPercent),
    recoveryReading: buildRecoveryReading(projectProgress.deltaPercent, currentResult.compensationAnalysis.potential.top3ImpactPercent),
  };
}
