import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import { belongsToDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectWeightModel, TaskWeight } from "../weight/build-project-weight-model";

const MAX_PROGRESS_TASKS = 3;

export type DisciplineProgressTaskStatus = "nao-iniciado" | "em-andamento" | "concluido";

export type DisciplineProgressTask = {
  taskId: string;
  outlineNumber: string;
  taskIdentifier: string;
  name: string;
  disciplineName: string;
  progressPercent: number;
  impactPercent: number;
  earnedNormalizedValue: number;
  remainingNormalizedValue: number;
  status: DisciplineProgressTaskStatus;
};

export type DisciplineProgressSummary = {
  disciplineName: string;
  outlineNumber: string;
  averagePercentComplete: number;
  progressWeightedPercent: number;
  earnedNormalizedValue: number;
  remainingNormalizedValue: number;
  totalOperationalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  notStartedTasks: number;
  topTasksByProgressPercent: DisciplineProgressTask[];
  topTasksByEarnedValue: DisciplineProgressTask[];
  topTasksWithoutProgress: DisciplineProgressTask[];
};

export type DisciplineProgressAnalysis = {
  disciplines: DisciplineProgressSummary[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function resolveTaskStatus(progressPercent: number): DisciplineProgressTaskStatus {
  if (progressPercent >= 100) {
    return "concluido";
  }

  if (progressPercent > 0) {
    return "em-andamento";
  }

  return "nao-iniciado";
}

function resolveTaskIdentifier(taskWeight: TaskWeight): string {
  if (taskWeight.outlineNumber.trim().length > 0) {
    return taskWeight.outlineNumber;
  }

  if (taskWeight.taskId.trim().length > 0) {
    return taskWeight.taskId;
  }

  return "task-sem-identificador";
}

function mapTask(taskWeight: TaskWeight, disciplineName: string, normalizedProjectValue: number): DisciplineProgressTask {
  return {
    taskId: taskWeight.taskId,
    outlineNumber: taskWeight.outlineNumber,
    taskIdentifier: resolveTaskIdentifier(taskWeight),
    name: taskWeight.taskName,
    disciplineName,
    progressPercent: taskWeight.progressPercentUsed,
    impactPercent: round2((taskWeight.remainingNormalizedValue / normalizedProjectValue) * 100),
    earnedNormalizedValue: taskWeight.earnedNormalizedValue,
    remainingNormalizedValue: taskWeight.remainingNormalizedValue,
    status: resolveTaskStatus(taskWeight.progressPercentUsed),
  };
}

export function buildDisciplineProgress(
  disciplines: ProjectDiscipline[],
  weightModel: ProjectWeightModel,
): DisciplineProgressAnalysis {
  const summaries = disciplines.map((discipline) => {
    const disciplineWeight = weightModel.disciplineWeights.find(
      (weight) => weight.outlineNumber === discipline.outlineNumber,
    );
    const tasks = weightModel.taskWeights
      .filter((taskWeight) => belongsToDiscipline(taskWeight.outlineNumber, discipline.outlineNumber))
      .map((taskWeight) => mapTask(taskWeight, discipline.name, weightModel.normalizedProjectValue));

    const totalOperationalTasks = tasks.length;
    const averagePercentComplete = round2(
      totalOperationalTasks === 0
        ? 0
        : tasks.reduce((sum, task) => sum + task.progressPercent, 0) / totalOperationalTasks,
    );

    return {
      disciplineName: discipline.name,
      outlineNumber: discipline.outlineNumber,
      averagePercentComplete,
      progressWeightedPercent: disciplineWeight?.progressWeightedPercent ?? 0,
      earnedNormalizedValue: disciplineWeight?.earnedNormalizedValue ?? 0,
      remainingNormalizedValue: disciplineWeight?.remainingNormalizedValue ?? 0,
      totalOperationalTasks,
      completedTasks: tasks.filter((task) => task.status === "concluido").length,
      inProgressTasks: tasks.filter((task) => task.status === "em-andamento").length,
      notStartedTasks: tasks.filter((task) => task.status === "nao-iniciado").length,
      topTasksByProgressPercent: [...tasks]
        .filter((task) => task.progressPercent > 0)
        .sort((left, right) => {
          if (right.progressPercent !== left.progressPercent) {
            return right.progressPercent - left.progressPercent;
          }

          return right.earnedNormalizedValue - left.earnedNormalizedValue;
        })
        .slice(0, MAX_PROGRESS_TASKS),
      topTasksByEarnedValue: [...tasks]
        .filter((task) => task.earnedNormalizedValue > 0)
        .sort((left, right) => {
          if (right.earnedNormalizedValue !== left.earnedNormalizedValue) {
            return right.earnedNormalizedValue - left.earnedNormalizedValue;
          }

          return right.progressPercent - left.progressPercent;
        })
        .slice(0, MAX_PROGRESS_TASKS),
      topTasksWithoutProgress: [...tasks]
        .filter((task) => task.progressPercent === 0 && task.remainingNormalizedValue > 0)
        .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
        .slice(0, MAX_PROGRESS_TASKS),
    };
  });

  return {
    disciplines: summaries.sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue),
  };
}
