import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import { belongsToDiscipline } from "../disciplines/build-project-disciplines";
import type { Project } from "../model/project";

const NORMALIZED_PROJECT_VALUE = 1_000_000;

export type TaskWeight = {
  taskId: string;
  taskName: string;
  outlineNumber: string;
  disciplineName?: string;
  progressPercentUsed: number;
  progressSource: "percentComplete" | "physicalPercentComplete" | "actualEndDate" | "none";
  normalizedValue: number;
  normalizedWeightPercent: number;
  earnedNormalizedValue: number;
  remainingNormalizedValue: number;
};

export type DisciplineWeight = {
  name: string;
  outlineNumber: string;
  totalNormalizedValue: number;
  earnedNormalizedValue: number;
  remainingNormalizedValue: number;
  normalizedWeightPercent: number;
  progressWeightedPercent: number;
};

export type ProjectWeightModel = {
  normalizedProjectValue: number;
  totalEarnedNormalizedValue: number;
  totalRemainingNormalizedValue: number;
  progressWeightedPercent: number;
  progressSourceCoverage: {
    tasksUsingPercentComplete: number;
    tasksUsingPhysicalPercentComplete: number;
    tasksConsideredCompletedByActualEndDate: number;
    tasksWithoutProgressData: number;
  };
  taskWeights: TaskWeight[];
  disciplineWeights: DisciplineWeight[];
  topTasksByRemainingValue: TaskWeight[];
  topDisciplinesByRemainingValue: DisciplineWeight[];
  disclaimer: string;
};

type WeightedTaskSeed = {
  taskId: string;
  taskName: string;
  outlineNumber: string;
  duration: number;
  percentComplete: number;
  physicalPercentComplete: number;
  actualEndDate: string;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function isOperationalTask(task: Project["tasks"][number]): boolean {
  return !task.isSummary && task.duration > 0;
}

function findDisciplineName(
  outlineNumber: string,
  disciplines: ProjectDiscipline[],
): string | undefined {
  return disciplines.find((discipline) => belongsToDiscipline(outlineNumber, discipline.outlineNumber))?.name;
}

function resolveTaskProgress(seed: WeightedTaskSeed): Pick<TaskWeight, "progressPercentUsed" | "progressSource"> {
  if (seed.percentComplete > 0) {
    return {
      progressPercentUsed: clampPercent(seed.percentComplete),
      progressSource: "percentComplete",
    };
  }

  if (seed.physicalPercentComplete > 0) {
    return {
      progressPercentUsed: clampPercent(seed.physicalPercentComplete),
      progressSource: "physicalPercentComplete",
    };
  }

  if (seed.actualEndDate) {
    return {
      progressPercentUsed: 100,
      progressSource: "actualEndDate",
    };
  }

  return {
    progressPercentUsed: 0,
    progressSource: "none",
  };
}

function allocateNormalizedValues(seeds: WeightedTaskSeed[]): TaskWeight[] {
  if (seeds.length === 0) {
    return [];
  }

  const totalDuration = seeds.reduce((sum, seed) => sum + seed.duration, 0);

  if (totalDuration <= 0) {
      return seeds.map((seed) => ({
        taskId: seed.taskId,
        taskName: seed.taskName,
        outlineNumber: seed.outlineNumber,
        progressPercentUsed: 0,
        progressSource: "none",
        normalizedValue: 0,
        normalizedWeightPercent: 0,
        earnedNormalizedValue: 0,
        remainingNormalizedValue: 0,
      }));
  }

  let allocatedValue = 0;
  let allocatedPercent = 0;

  return seeds.map((seed, index) => {
    const isLast = index === seeds.length - 1;
    const progress = resolveTaskProgress(seed);
    const rawNormalizedValue = (seed.duration / totalDuration) * NORMALIZED_PROJECT_VALUE;
    const normalizedValue = isLast
      ? round2(NORMALIZED_PROJECT_VALUE - allocatedValue)
      : round2(rawNormalizedValue);
    const normalizedWeightPercent = isLast
      ? round2(100 - allocatedPercent)
      : round2((seed.duration / totalDuration) * 100);
    const earnedNormalizedValue = round2(normalizedValue * (progress.progressPercentUsed / 100));
    const remainingNormalizedValue = round2(normalizedValue - earnedNormalizedValue);

    allocatedValue += normalizedValue;
    allocatedPercent += normalizedWeightPercent;

    return {
      taskId: seed.taskId,
      taskName: seed.taskName,
      outlineNumber: seed.outlineNumber,
      progressPercentUsed: progress.progressPercentUsed,
      progressSource: progress.progressSource,
      normalizedValue,
      normalizedWeightPercent,
      earnedNormalizedValue,
      remainingNormalizedValue,
    };
  });
}

export function buildProjectWeightModel(
  project: Project,
  disciplines: ProjectDiscipline[],
): ProjectWeightModel {
  const weightedTasks = allocateNormalizedValues(
    project.tasks
      .filter(isOperationalTask)
      .map((task) => ({
        taskId: task.id,
        taskName: task.name,
        outlineNumber: task.outlineNumber,
        duration: task.duration,
        percentComplete: task.percentComplete,
        physicalPercentComplete: task.physicalPercentComplete,
        actualEndDate: task.actualEndDate,
      })),
  ).map((taskWeight) => ({
    ...taskWeight,
    disciplineName: findDisciplineName(taskWeight.outlineNumber, disciplines),
  }));

  const totalEarnedNormalizedValue = round2(
    weightedTasks.reduce((sum, taskWeight) => sum + taskWeight.earnedNormalizedValue, 0),
  );
  const totalRemainingNormalizedValue = round2(
    weightedTasks.reduce((sum, taskWeight) => sum + taskWeight.remainingNormalizedValue, 0),
  );
  const progressWeightedPercent = round2((totalEarnedNormalizedValue / NORMALIZED_PROJECT_VALUE) * 100);
  const progressSourceCoverage = {
    tasksUsingPercentComplete: weightedTasks.filter((taskWeight) => taskWeight.progressSource === "percentComplete").length,
    tasksUsingPhysicalPercentComplete: weightedTasks.filter(
      (taskWeight) => taskWeight.progressSource === "physicalPercentComplete",
    ).length,
    tasksConsideredCompletedByActualEndDate: weightedTasks.filter(
      (taskWeight) => taskWeight.progressSource === "actualEndDate",
    ).length,
    tasksWithoutProgressData: weightedTasks.filter((taskWeight) => taskWeight.progressSource === "none").length,
  };

  const disciplineWeights = disciplines.map((discipline) => {
    const taskWeights = weightedTasks.filter((taskWeight) =>
      belongsToDiscipline(taskWeight.outlineNumber, discipline.outlineNumber),
    );
    const totalNormalizedValue = round2(taskWeights.reduce((sum, taskWeight) => sum + taskWeight.normalizedValue, 0));
    const earnedNormalizedValue = round2(
      taskWeights.reduce((sum, taskWeight) => sum + taskWeight.earnedNormalizedValue, 0),
    );
    const remainingNormalizedValue = round2(
      taskWeights.reduce((sum, taskWeight) => sum + taskWeight.remainingNormalizedValue, 0),
    );
    const normalizedWeightPercent = round2((totalNormalizedValue / NORMALIZED_PROJECT_VALUE) * 100);
    const progressWeightedPercent = round2(
      totalNormalizedValue === 0 ? 0 : (earnedNormalizedValue / totalNormalizedValue) * 100,
    );

    return {
      name: discipline.name,
      outlineNumber: discipline.outlineNumber,
      totalNormalizedValue,
      earnedNormalizedValue,
      remainingNormalizedValue,
      normalizedWeightPercent,
      progressWeightedPercent,
    };
  });

  return {
    normalizedProjectValue: NORMALIZED_PROJECT_VALUE,
    totalEarnedNormalizedValue,
    totalRemainingNormalizedValue,
    progressWeightedPercent,
    progressSourceCoverage,
    taskWeights: weightedTasks,
    disciplineWeights,
    topTasksByRemainingValue: [...weightedTasks]
      .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
      .slice(0, 3),
    topDisciplinesByRemainingValue: [...disciplineWeights]
      .sort((left, right) => right.remainingNormalizedValue - left.remainingNormalizedValue)
      .slice(0, 3),
    disclaimer:
      "O valor 1.000.000 é uma escala normalizada de peso relativo do projeto. Não representa custo real e serve apenas para interpretar impacto, valor executado, valor pendente e avanço ponderado.",
  };
}

