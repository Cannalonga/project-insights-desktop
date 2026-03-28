import type { Project } from "../model/project";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

export type SCurvePoint = {
  date: string;
  planned: number;
  plannedAccumulated: number;
  replanned: number;
  replannedAccumulated: number;
  real: number;
  realAccumulated: number;
};

export type SCurveResult = {
  scopeLabel: string;
  timelineGranularity: "weekly";
  percentBaseValue: number;
  points: SCurvePoint[];
  explanation: string;
};

type WeightedTaskSchedule = {
  normalizedValue: number;
  realNormalizedValue: number;
  baselineStartDate: string;
  baselineEndDate: string;
  startDate: string;
  endDate: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasValidRange(startDate: string, endDate: string): boolean {
  const start = parseDate(startDate);
  const finish = parseDate(endDate);

  return start !== null && finish !== null && start.getTime() <= finish.getTime();
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function endOfWeek(date: Date): Date {
  const normalized = startOfWeek(date);
  normalized.setDate(normalized.getDate() + 7);
  return normalized;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWeeklyTimeline(startDate: Date, endDate: Date): Date[] {
  const weeks: Date[] = [];
  let cursor = startOfWeek(startDate);
  const end = startOfWeek(endDate);

  while (cursor.getTime() <= end.getTime()) {
    weeks.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + WEEK_MS);
  }

  return weeks;
}

function allocateSinglePoint(
  buckets: Map<string, number>,
  bucketDate: Date,
  value: number,
): void {
  const key = formatDate(startOfWeek(bucketDate));
  buckets.set(key, round2((buckets.get(key) ?? 0) + value));
}

function distributeValueAcrossWeeks(
  buckets: Map<string, number>,
  startDate: Date,
  endDate: Date,
  value: number,
): void {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (endMs <= startMs) {
    allocateSinglePoint(buckets, startDate, value);
    return;
  }

  const durationMs = endMs - startMs;
  const touchedWeeks = buildWeeklyTimeline(startDate, endDate);
  let allocated = 0;

  touchedWeeks.forEach((weekStart, index) => {
    const weekStartMs = weekStart.getTime();
    const weekEndMs = endOfWeek(weekStart).getTime();
    const overlapMs = Math.max(0, Math.min(endMs, weekEndMs) - Math.max(startMs, weekStartMs));
    if (overlapMs <= 0) {
      return;
    }

    const rawShare = (overlapMs / durationMs) * value;
    const isLastOverlap = index === touchedWeeks.length - 1;
    const share = isLastOverlap ? round2(value - allocated) : round2(rawShare);
    allocated += share;
    buckets.set(formatDate(weekStart), round2((buckets.get(formatDate(weekStart)) ?? 0) + share));
  });

  if (allocated === 0) {
    allocateSinglePoint(buckets, startDate, value);
  }
}

function buildWeeklySeries(
  tasks: WeightedTaskSchedule[],
  mode: "planned" | "replanned" | "real",
): Map<string, number> {
  const buckets = new Map<string, number>();

  tasks.forEach((task) => {
    const startDate = parseDate(mode === "planned" ? task.baselineStartDate : task.startDate);
    const endDate = parseDate(mode === "planned" ? task.baselineEndDate : task.endDate);
    const value = mode === "real" ? task.realNormalizedValue : task.normalizedValue;

    if (!startDate || !endDate || value <= 0) {
      return;
    }

    distributeValueAcrossWeeks(buckets, startDate, endDate, value);
  });

  return buckets;
}

function createWeightedTaskSchedules(project: Project, weightModel: ProjectWeightModel): WeightedTaskSchedule[] {
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));

  return weightModel.taskWeights
    .map((taskWeight) => {
      const task = tasksById.get(taskWeight.taskId);
      if (!task) {
        return null;
      }

      return {
        normalizedValue: taskWeight.normalizedValue,
        realNormalizedValue: round2(taskWeight.normalizedValue * Math.max(0, Math.min(task.percentComplete, 100)) / 100),
        baselineStartDate: task.baselineStartDate,
        baselineEndDate: task.baselineEndDate,
        startDate: task.startDate,
        endDate: task.endDate,
      };
    })
    .filter((task): task is WeightedTaskSchedule => task !== null);
}

function buildExplanation(
  hasPlannedBase: boolean,
  hasReplannedBase: boolean,
  hasRealBase: boolean,
  scopeLabel: string,
): string {
  const parts = [`Curva S semanal baseada na distribuicao do peso das tasks ao longo das datas planejadas, replanejadas e do progresso executado no recorte ${scopeLabel}.`];

  if (!hasPlannedBase) {
    parts.push("A curva planejada ficou sem base suficiente de baseline valida.");
  }

  if (!hasReplannedBase) {
    parts.push("A curva replanejada ficou sem base suficiente de datas atuais validas.");
  }

  if (!hasRealBase) {
    parts.push("A curva real ficou sem base suficiente de datas atuais validas com progresso informado.");
  }

  return parts.join(" ");
}

export function buildSCurve(
  project: Project,
  weightModel: ProjectWeightModel,
  scopeLabel: string,
): SCurveResult {
  const weightedSchedules = createWeightedTaskSchedules(project, weightModel);
  const plannedTasks = weightedSchedules.filter((task) => hasValidRange(task.baselineStartDate, task.baselineEndDate));
  const replannedTasks = weightedSchedules.filter((task) => hasValidRange(task.startDate, task.endDate));
  const realTasks = weightedSchedules.filter(
    (task) => hasValidRange(task.startDate, task.endDate) && task.realNormalizedValue > 0,
  );

  const startCandidates = [
    ...plannedTasks.map((task) => parseDate(task.baselineStartDate)),
    ...replannedTasks.map((task) => parseDate(task.startDate)),
  ].filter((value): value is Date => value !== null);
  const endCandidates = [
    ...plannedTasks.map((task) => parseDate(task.baselineEndDate)),
    ...replannedTasks.map((task) => parseDate(task.endDate)),
  ].filter((value): value is Date => value !== null);

  if (startCandidates.length === 0 || endCandidates.length === 0) {
    return {
      scopeLabel,
      timelineGranularity: "weekly",
      percentBaseValue: 0,
      points: [],
      explanation: buildExplanation(plannedTasks.length > 0, replannedTasks.length > 0, realTasks.length > 0, scopeLabel),
    };
  }

  const timeline = buildWeeklyTimeline(
    startCandidates.reduce((earliest, current) => (current.getTime() < earliest.getTime() ? current : earliest)),
    endCandidates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest)),
  );
  const plannedSeries = buildWeeklySeries(plannedTasks, "planned");
  const replannedSeries = buildWeeklySeries(replannedTasks, "replanned");
  const realSeries = buildWeeklySeries(realTasks, "real");

  let plannedAccumulated = 0;
  let replannedAccumulated = 0;
  let realAccumulated = 0;

  return {
    scopeLabel,
    timelineGranularity: "weekly",
    percentBaseValue: round2(weightedSchedules.reduce((sum, task) => sum + task.normalizedValue, 0)),
    points: timeline.map((weekStart) => {
      const date = formatDate(weekStart);
      const planned = round2(plannedSeries.get(date) ?? 0);
      const replanned = round2(replannedSeries.get(date) ?? 0);
      const real = round2(realSeries.get(date) ?? 0);
      plannedAccumulated = round2(plannedAccumulated + planned);
      replannedAccumulated = round2(replannedAccumulated + replanned);
      realAccumulated = round2(realAccumulated + real);

      return {
        date,
        planned,
        plannedAccumulated,
        replanned,
        replannedAccumulated,
        real,
        realAccumulated,
      };
    }),
    explanation: buildExplanation(plannedTasks.length > 0, replannedTasks.length > 0, realTasks.length > 0, scopeLabel),
  };
}
