import type { ProjectWeightModel } from "../weight/build-project-weight-model";

const MAX_COMPENSATION_TASKS = 5;

export type OperationalCompensationTask = {
  taskId: string;
  name: string;
  disciplineName?: string;
  remainingNormalizedValue: number;
  impactPercent: number;
  progressPercent: number;
};

export type OperationalCompensationAnalysis = {
  topTasks: OperationalCompensationTask[];
  potential: {
    top3ImpactPercent: number;
    top5ImpactPercent: number;
    message: string;
  };
};

export type OperationalCompensationDiscipline = {
  disciplineName: string;
  totalRemainingValue: number;
  impactPercent: number;
  top3Tasks: OperationalCompensationTask[];
  top3ImpactPercent: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function calculateCombinedImpactPercent(
  tasks: OperationalCompensationTask[],
  normalizedProjectValue: number,
  limit: number,
): number {
  const totalRemainingValue = tasks
    .slice(0, limit)
    .reduce((sum, task) => sum + task.remainingNormalizedValue, 0);

  return round2((totalRemainingValue / normalizedProjectValue) * 100);
}

export function buildOperationalCompensation(
  weightModel: ProjectWeightModel,
): OperationalCompensationAnalysis {
  const topTasks = weightModel.taskWeights
    .filter((taskWeight) => taskWeight.remainingNormalizedValue > 0)
    .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
    .slice(0, MAX_COMPENSATION_TASKS)
    .map((taskWeight) => ({
      taskId: taskWeight.taskId,
      name: taskWeight.taskName,
      disciplineName: taskWeight.disciplineName,
      remainingNormalizedValue: taskWeight.remainingNormalizedValue,
      impactPercent: round2((taskWeight.remainingNormalizedValue / weightModel.normalizedProjectValue) * 100),
      progressPercent: taskWeight.progressPercentUsed,
    }));

  return {
    topTasks,
    potential: {
      top3ImpactPercent: calculateCombinedImpactPercent(topTasks, weightModel.normalizedProjectValue, 3),
      top5ImpactPercent: calculateCombinedImpactPercent(topTasks, weightModel.normalizedProjectValue, 5),
      message: `Executar as principais tarefas pode gerar ate ${calculateCombinedImpactPercent(topTasks, weightModel.normalizedProjectValue, 3)}% de avanco potencial no projeto.`,
    },
  };
}

export function buildCompensationByDiscipline(
  weightModel: ProjectWeightModel,
): OperationalCompensationDiscipline[] {
  const tasksByDiscipline = new Map<string, OperationalCompensationTask[]>();

  for (const taskWeight of weightModel.taskWeights) {
    if (!taskWeight.disciplineName || taskWeight.remainingNormalizedValue <= 0) {
      continue;
    }

    const tasks = tasksByDiscipline.get(taskWeight.disciplineName) ?? [];
    tasks.push({
      taskId: taskWeight.taskId,
      name: taskWeight.taskName,
      disciplineName: taskWeight.disciplineName,
      remainingNormalizedValue: taskWeight.remainingNormalizedValue,
      impactPercent: round2((taskWeight.remainingNormalizedValue / weightModel.normalizedProjectValue) * 100),
      progressPercent: taskWeight.progressPercentUsed,
    });
    tasksByDiscipline.set(taskWeight.disciplineName, tasks);
  }

  return Array.from(tasksByDiscipline.entries())
    .map(([disciplineName, tasks]) => {
      const sortedTasks = [...tasks].sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue);
      const totalRemainingValue = round2(
        sortedTasks.reduce((sum, task) => sum + task.remainingNormalizedValue, 0),
      );

      return {
        disciplineName,
        totalRemainingValue,
        impactPercent: round2((totalRemainingValue / weightModel.normalizedProjectValue) * 100),
        top3Tasks: sortedTasks.slice(0, 3),
        top3ImpactPercent: calculateCombinedImpactPercent(sortedTasks, weightModel.normalizedProjectValue, 3),
      };
    })
    .sort((left, right) => right.impactPercent - left.impactPercent);
}
