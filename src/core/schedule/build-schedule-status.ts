import type { Project } from "../model/project";
import type { ProjectWeightModel, TaskWeight } from "../weight/build-project-weight-model";

export type ScheduleStatusLevel = "OK" | "ATENCAO" | "ATRASADO";

export type ScheduleStatus = {
  status: ScheduleStatusLevel;
  progressReal: number;
  progressExpected: number;
  gap: number;
  explanation: string;
  totalWeightedTasks: number;
  consideredWeightedTasks: number;
  criteria: string;
  basedOnBaseline: boolean;
};

const OK_GAP_THRESHOLD = -5;
const ATTENTION_GAP_THRESHOLD = -12;

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

function hasValidBaseline(task: Project["tasks"][number]): boolean {
  const start = parseDate(task.baselineStartDate);
  const end = parseDate(task.baselineEndDate);

  return start !== null && end !== null && end >= start;
}

function getStatusFromGap(gap: number): ScheduleStatusLevel {
  if (gap >= OK_GAP_THRESHOLD) {
    return "OK";
  }

  if (gap >= ATTENTION_GAP_THRESHOLD) {
    return "ATENCAO";
  }

  return "ATRASADO";
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

function buildBaselineScheduleStatus(
  project: Project,
  weightModel: ProjectWeightModel,
  now: number,
): ScheduleStatus | undefined {
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const coveredWeights = weightModel.taskWeights.filter((taskWeight) => {
    const task = tasksById.get(taskWeight.taskId);
    return task ? hasValidBaseline(task) : false;
  });

  if (coveredWeights.length === 0) {
    return undefined;
  }

  const coveredNormalizedValue = coveredWeights.reduce((sum, taskWeight) => sum + taskWeight.normalizedValue, 0);
  if (coveredNormalizedValue <= 0) {
    return undefined;
  }

  const realEarned = coveredWeights.reduce((sum, taskWeight) => sum + taskWeight.earnedNormalizedValue, 0);
  const expectedEarned = coveredWeights.reduce((sum, taskWeight) => {
    const task = tasksById.get(taskWeight.taskId)!;
    const baselineStart = parseDate(task.baselineStartDate)!;
    const baselineEnd = parseDate(task.baselineEndDate)!;
    const expectedPercent = calculateExpectedPercent(now, baselineStart, baselineEnd);
    return sum + taskWeight.normalizedValue * (expectedPercent / 100);
  }, 0);

  const progressReal = round2((realEarned / coveredNormalizedValue) * 100);
  const progressExpected = round2((expectedEarned / coveredNormalizedValue) * 100);
  const gap = round2(progressReal - progressExpected);

  return {
    status: getStatusFromGap(gap),
    progressReal,
    progressExpected,
    gap,
    explanation: `Comparação por baseline válida em ${coveredWeights.length} tasks com peso válido de ${weightModel.taskWeights.length}.`,
    totalWeightedTasks: weightModel.taskWeights.length,
    consideredWeightedTasks: coveredWeights.length,
    criteria: "Tasks com baseline válida, comparadas pela data atual.",
    basedOnBaseline: true,
  };
}

function buildInferredScheduleStatus(weightModel: ProjectWeightModel): ScheduleStatus {
  const totalWeightedTasks = weightModel.taskWeights.length;
  const tasksWithAnyProgress = weightModel.taskWeights.filter((taskWeight) => taskWeight.progressPercentUsed > 0).length;
  const activationPercent = totalWeightedTasks === 0 ? 0 : (tasksWithAnyProgress / totalWeightedTasks) * 100;
  const pendingPercent = (weightModel.totalRemainingNormalizedValue / weightModel.normalizedProjectValue) * 100;
  const progressReal = round2(weightModel.progressWeightedPercent);
  const progressExpected = round2((progressReal + activationPercent + (100 - pendingPercent)) / 3);
  const gap = round2(progressReal - progressExpected);

  return {
    status: getStatusFromGap(gap),
    progressReal,
    progressExpected,
    gap,
    explanation: `Sem baseline válida, a expectativa foi inferida pela combinação entre avanço ponderado real, ${tasksWithAnyProgress} tasks com algum avanço de ${totalWeightedTasks} tasks com peso válido e volume pendente atual.`,
    totalWeightedTasks,
    consideredWeightedTasks: totalWeightedTasks,
    criteria: "Inferência por progresso real, distribuição de tasks e volume pendente.",
    basedOnBaseline: false,
  };
}

export function buildScheduleStatus(
  project: Project,
  weightModel: ProjectWeightModel,
  nowIso: string = new Date().toISOString(),
): ScheduleStatus {
  const now = parseDate(nowIso) ?? Date.now();
  const baselineStatus = buildBaselineScheduleStatus(project, weightModel, now);

  return baselineStatus ?? buildInferredScheduleStatus(weightModel);
}

