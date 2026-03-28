import type { Project } from "../model/project";
import type { Task } from "../model/task";
import type { ProjectWeightModel, TaskWeight } from "../weight/build-project-weight-model";

const RECENT_LOOKBACK_DAYS = 14;
const UPCOMING_LOOKAHEAD_DAYS = 14;
const NEAR_STATUS_WINDOW_DAYS = 14;
const DEFAULT_MAX_OPERATIONAL_TASKS = 5;
const MIN_VISIBLE_IMPACT_PERCENT = 0.1;

export type OperationalTaskView = {
  taskId: string;
  taskIdentifier: string;
  name: string;
  expectedPercent: number | null;
  realPercent: number;
  gapPercent: number | null;
  impactPercent: number;
  disciplineName?: string;
  statusLabel: string;
  statusTone: "critical" | "warning" | "ok";
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

function calculateExpectedPercent(now: number, start: number, end: number): number {
  if (now <= start) {
    return 0;
  }

  if (now >= end || end === start) {
    return 100;
  }

  return round2(((now - start) / (end - start)) * 100);
}

function buildTaskStatus(
  expectedPercent: number | null,
  realPercent: number,
  gapPercent: number | null,
): Pick<OperationalTaskView, "statusLabel" | "statusTone"> {
  if (expectedPercent !== null && realPercent === 0 && expectedPercent > 0) {
    return {
      statusLabel: "Nao iniciada",
      statusTone: "critical",
    };
  }

  if (gapPercent !== null && gapPercent <= -10) {
    return {
      statusLabel: "Em atraso",
      statusTone: "critical",
    };
  }

  if (gapPercent !== null && gapPercent >= 10) {
    return {
      statusLabel: "Adiantada",
      statusTone: "ok",
    };
  }

  return {
    statusLabel: "Em linha",
    statusTone: gapPercent !== null && gapPercent < 0 ? "warning" : "ok",
  };
}

function isCompleted(task: Task, weight: TaskWeight): boolean {
  return weight.progressPercentUsed >= 100 || Boolean(task.actualEndDate);
}

function isOverdue(task: Task, weight: TaskWeight, now: number): boolean {
  const end = parseDate(task.endDate);
  return end !== null && end < now && !isCompleted(task, weight);
}

function isInExecution(task: Task, weight: TaskWeight, now: number): boolean {
  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate);

  if (start === null || end === null || isCompleted(task, weight)) {
    return false;
  }

  return start <= now && end >= now;
}

function hasRecentOperationalActivity(task: Task, weight: TaskWeight, recentThreshold: number, now: number): boolean {
  const actualStart = parseDate(task.actualStartDate);
  const actualEnd = parseDate(task.actualEndDate);

  if (actualEnd !== null && actualEnd >= recentThreshold && actualEnd <= now) {
    return true;
  }

  if (actualStart !== null && actualStart >= recentThreshold && actualStart <= now) {
    return true;
  }

  if (weight.progressPercentUsed > 0 && weight.progressPercentUsed < 100) {
    const start = parseDate(task.startDate);
    const end = parseDate(task.endDate);

    if (start !== null && end !== null && end >= recentThreshold && start <= now) {
      return true;
    }
  }

  return false;
}

function startsSoon(task: Task, now: number, upcomingThreshold: number): boolean {
  const start = parseDate(task.startDate);
  return start !== null && start > now && start <= upcomingThreshold;
}

function isNearStatusDate(task: Task, now: number): boolean {
  const threshold = NEAR_STATUS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate);

  return (
    (start !== null && Math.abs(start - now) <= threshold) ||
    (end !== null && Math.abs(end - now) <= threshold)
  );
}

function getFrontKey(task: Task): string {
  const [firstSegment] = task.outlineNumber.split(".");
  return firstSegment || task.outlineNumber || task.id;
}

function buildFrontOrder(project: Project): Map<string, number> {
  const order = new Map<string, number>();

  for (const task of project.tasks) {
    const key = getFrontKey(task);
    if (!order.has(key)) {
      order.set(key, order.size);
    }
  }

  return order;
}

function isOperationallyRelevant(task: Task, weight: TaskWeight, now: number): boolean {
  const recentThreshold = now - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const upcomingThreshold = now + UPCOMING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

  return (
    isOverdue(task, weight, now) ||
    isInExecution(task, weight, now) ||
    hasRecentOperationalActivity(task, weight, recentThreshold, now) ||
    startsSoon(task, now, upcomingThreshold) ||
    isNearStatusDate(task, now)
  );
}

export function calculateTopImpactPercent(taskViews: OperationalTaskView[], limit = 3): number {
  return round2(
    taskViews
      .slice(0, limit)
      .reduce((sum, task) => sum + task.impactPercent, 0),
  );
}

export function buildOperationalTaskViews(
  weightModel: ProjectWeightModel,
  project: Project,
  generatedAt?: string,
  maxTasks = DEFAULT_MAX_OPERATIONAL_TASKS,
): OperationalTaskView[] {
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const now = parseDate(generatedAt ?? "") ?? Date.now();
  const frontOrder = buildFrontOrder(project);
  const recentThreshold = now - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const upcomingThreshold = now + UPCOMING_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

  const candidates = weightModel.taskWeights.flatMap((weight) => {
    const task = tasksById.get(weight.taskId);
    if (!task || !isOperationallyRelevant(task, weight, now)) {
      return [];
    }

    return [
      {
        weight,
        task,
        frontKey: getFrontKey(task),
        overdue: isOverdue(task, weight, now),
        inExecution: isInExecution(task, weight, now),
        recentActivity: hasRecentOperationalActivity(task, weight, recentThreshold, now),
        startsSoon: startsSoon(task, now, upcomingThreshold),
      },
    ];
  });

  const strongFrontIndexes = candidates
    .filter((candidate) => candidate.overdue || candidate.inExecution || candidate.recentActivity)
    .map((candidate) => frontOrder.get(candidate.frontKey))
    .filter((index): index is number => index !== undefined);

  const minStrongFront = strongFrontIndexes.length > 0 ? Math.min(...strongFrontIndexes) : null;
  const maxStrongFront = strongFrontIndexes.length > 0 ? Math.max(...strongFrontIndexes) : null;

  const filteredCandidates = candidates.filter((candidate) => {
    if (candidate.overdue || candidate.inExecution || candidate.recentActivity) {
      return true;
    }

    if (minStrongFront === null || maxStrongFront === null) {
      return true;
    }

    const candidateFrontIndex = frontOrder.get(candidate.frontKey);
    if (candidateFrontIndex === undefined) {
      return true;
    }

    return candidateFrontIndex >= minStrongFront && candidateFrontIndex <= maxStrongFront + 1;
  });

  const taskViews: OperationalTaskView[] = [];

  for (const candidate of filteredCandidates) {
    const { weight, task } = candidate;

    const baselineStart = parseDate(task.baselineStartDate);
    const baselineEnd = parseDate(task.baselineEndDate);
    const expectedPercent =
      baselineStart !== null && baselineEnd !== null && baselineEnd >= baselineStart
        ? calculateExpectedPercent(now, baselineStart, baselineEnd)
        : null;
    const realPercent = weight.progressPercentUsed;
    const gapPercent = expectedPercent === null ? null : round2(realPercent - expectedPercent);
    const taskStatus = buildTaskStatus(expectedPercent, realPercent, gapPercent);

    taskViews.push({
      taskId: weight.taskId,
      taskIdentifier: task.outlineNumber?.trim() || weight.outlineNumber?.trim() || weight.taskId,
      name: weight.taskName,
      expectedPercent,
      realPercent,
      gapPercent,
      impactPercent: round2((weight.remainingNormalizedValue / weightModel.normalizedProjectValue) * 100),
      disciplineName: weight.disciplineName,
      statusLabel: taskStatus.statusLabel,
      statusTone: taskStatus.statusTone,
    });
  }

  return taskViews
    .filter((task) => task.impactPercent >= MIN_VISIBLE_IMPACT_PERCENT)
    .sort((left, right) => {
      if (left.gapPercent === null && right.gapPercent === null) {
        return right.impactPercent - left.impactPercent;
      }

      if (left.gapPercent === null) {
        return 1;
      }

      if (right.gapPercent === null) {
        return -1;
      }

      if (left.gapPercent !== right.gapPercent) {
        return left.gapPercent - right.gapPercent;
      }

      return right.impactPercent - left.impactPercent;
    })
    .slice(0, maxTasks);
}
