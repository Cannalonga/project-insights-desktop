import type { ExecutiveAlert } from "../../core/alerts/build-executive-alerts";
import type {
  OperationalCompensationAnalysis,
  OperationalCompensationTask,
} from "../../core/compensation/build-operational-compensation";
import type { ProjectDiscipline } from "../../core/disciplines/build-project-disciplines";
import type { Task } from "../../core/model/task";
import type { Project } from "../../core/model/project";
import type { AnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import type { ScheduleStatus } from "../../core/schedule/build-schedule-status";
import type { ProjectWeightModel } from "../../core/weight/build-project-weight-model";
import {
  classifyOperationalCause,
  type OperationalCause,
} from "./classify-operational-cause";

export type DecisionActionImpactType = "progress" | "delay_reduction" | "unlock";
export type DecisionActionConfidence = "high" | "medium" | "low";

export type DecisionActionTask = {
  taskId: string;
  identifier: string;
  name: string;
  disciplineType: string;
  disciplineName?: string;
  progressPercent: number;
  impactPercent: number;
  remainingNormalizedValue: number;
  delayDays: number;
  plannedStart?: string;
  plannedFinish?: string;
  actualStart?: string;
  actualFinish?: string;
};

export type DecisionAction = {
  id: string;
  title: string;
  description: string;
  disciplineType: string;
  disciplineName?: string;
  impactPercent: number;
  impactType: DecisionActionImpactType;
  gainPercent: number;
  urgencyScore: number;
  effortScore: number;
  confidence: DecisionActionConfidence;
  cause: OperationalCause;
  reasons: string[];
  consequences: string[];
  relatedTasks: DecisionActionTask[];
  occurrenceCount: number;
  representativeProgressPercent: number;
  remainingNormalizedValue: number;
};

type BuildDecisionActionsInput = {
  project: Project;
  compensationAnalysis: OperationalCompensationAnalysis;
  disciplines?: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  analysisReliability?: AnalysisReliability | null;
  scheduleStatus?: ScheduleStatus | null;
  executiveAlerts?: ExecutiveAlert[];
};

type DecisionActionGroup = {
  key: string;
  baseName: string;
  tasks: DecisionActionTask[];
  disciplineType: string;
  disciplineName?: string;
  impactPercent: number;
  remainingNormalizedValue: number;
  representativeProgressPercent: number;
  delayedTaskCount: number;
  disciplineNames: string[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeTaskBaseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function toConfidence(level: AnalysisReliability["overallReliability"] | undefined): DecisionActionConfidence {
  if (level === "HIGH") {
    return "high";
  }

  if (level === "MODERATE") {
    return "medium";
  }

  return "low";
}

function resolveSnapshotReferenceDate(project: Project): Date | null {
  const candidate = project.statusDate || project.currentDate;
  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function differenceInDays(left: Date, right: Date): number {
  return Math.floor((left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveDelayDays(task: Task | undefined, snapshotDate: Date | null): number {
  if (!task?.endDate) {
    return 0;
  }

  const plannedFinish = new Date(task.endDate);
  if (Number.isNaN(plannedFinish.getTime())) {
    return 0;
  }

  const actualFinish = task.actualEndDate ? new Date(task.actualEndDate) : null;
  if (actualFinish && !Number.isNaN(actualFinish.getTime())) {
    return Math.max(0, differenceInDays(actualFinish, plannedFinish));
  }

  if (!snapshotDate) {
    return 0;
  }

  return Math.max(0, differenceInDays(snapshotDate, plannedFinish));
}

function buildDecisionTask(
  task: OperationalCompensationTask,
  sourceTask: Task | undefined,
  discipline: ProjectDiscipline | undefined,
  snapshotDate: Date | null,
): DecisionActionTask {
  return {
    taskId: task.taskId,
    identifier: sourceTask?.outlineNumber?.trim() || task.taskId,
    name: task.name,
    disciplineType: discipline?.disciplineType ?? "OUTRO",
    disciplineName: task.disciplineName,
    progressPercent: task.progressPercent,
    impactPercent: task.impactPercent,
    remainingNormalizedValue: task.remainingNormalizedValue,
    delayDays: resolveDelayDays(sourceTask, snapshotDate),
    plannedStart: sourceTask?.startDate || undefined,
    plannedFinish: sourceTask?.endDate || undefined,
    actualStart: sourceTask?.actualStartDate || undefined,
    actualFinish: sourceTask?.actualEndDate || undefined,
  };
}

function buildDecisionGroups(
  tasks: OperationalCompensationTask[],
  project: Project,
  disciplines: ProjectDiscipline[],
): DecisionActionGroup[] {
  const tasksById = new Map(project.tasks.map((task) => [task.id, task]));
  const disciplinesByName = new Map(disciplines.map((discipline) => [discipline.name, discipline]));
  const snapshotDate = resolveSnapshotReferenceDate(project);
  const grouped = new Map<string, DecisionActionGroup>();

  for (const task of tasks) {
    const key = normalizeTaskBaseName(task.name);
    const sourceTask = tasksById.get(task.taskId);
    const decisionTask = buildDecisionTask(task, sourceTask, disciplinesByName.get(task.disciplineName ?? ""), snapshotDate);
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        key,
        baseName: task.name.trim(),
        tasks: [decisionTask],
        disciplineType: decisionTask.disciplineType,
        disciplineName: decisionTask.disciplineName,
        impactPercent: task.impactPercent,
        remainingNormalizedValue: task.remainingNormalizedValue,
        representativeProgressPercent: decisionTask.progressPercent,
        delayedTaskCount: decisionTask.delayDays > 0 ? 1 : 0,
        disciplineNames: decisionTask.disciplineName ? [decisionTask.disciplineName] : [],
      });
      continue;
    }

    current.tasks.push(decisionTask);
    current.impactPercent = round2(current.impactPercent + task.impactPercent);
    current.remainingNormalizedValue = round2(current.remainingNormalizedValue + task.remainingNormalizedValue);
    current.delayedTaskCount += decisionTask.delayDays > 0 ? 1 : 0;

    if (decisionTask.disciplineName && !current.disciplineNames.includes(decisionTask.disciplineName)) {
      current.disciplineNames.push(decisionTask.disciplineName);
    }
  }

  for (const group of grouped.values()) {
    const disciplineTotals = new Map<string, number>();
    const weightedProgressBase = group.tasks.reduce((sum, task) => sum + task.remainingNormalizedValue, 0);
    const weightedProgressValue = group.tasks.reduce(
      (sum, task) => sum + task.progressPercent * task.remainingNormalizedValue,
      0,
    );

    group.representativeProgressPercent =
      weightedProgressBase > 0
        ? round2(weightedProgressValue / weightedProgressBase)
        : round2(group.tasks.reduce((sum, task) => sum + task.progressPercent, 0) / group.tasks.length);

    for (const task of group.tasks) {
      if (!task.disciplineName) {
        continue;
      }

      disciplineTotals.set(
        task.disciplineName,
        round2((disciplineTotals.get(task.disciplineName) ?? 0) + task.remainingNormalizedValue),
      );
    }

    const predominantDisciplineName = [...disciplineTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    if (predominantDisciplineName) {
      group.disciplineName = predominantDisciplineName;
      group.disciplineType = disciplinesByName.get(predominantDisciplineName)?.disciplineType ?? group.disciplineType;
    }
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.impactPercent !== left.impactPercent) {
      return right.impactPercent - left.impactPercent;
    }

    return right.remainingNormalizedValue - left.remainingNormalizedValue;
  });
}

function buildReasons(
  group: DecisionActionGroup,
  topDisciplineName: string | undefined,
  topImpactPercent: number,
): string[] {
  const reasons: string[] = [];

  if (group.impactPercent >= round2(topImpactPercent * 0.75)) {
    reasons.push("alto impacto no avanço do projeto");
  }

  if (topDisciplineName && group.disciplineName === topDisciplineName) {
    reasons.push("disciplina crítica no volume pendente atual");
  }

  if (group.delayedTaskCount > 0) {
    reasons.push("atraso real nas tasks relacionadas");
  }

  if (group.representativeProgressPercent < 100) {
    reasons.push("execução incompleta");
  }

  if (group.remainingNormalizedValue > 0) {
    reasons.push("valor relativo pendente concentrado");
  }

  if (group.tasks.length > 1) {
    reasons.push("múltiplas tarefas com o mesmo nome operacional");
  }

  return reasons.slice(0, 4);
}

function buildConsequences(group: DecisionActionGroup, executiveAlerts: ExecutiveAlert[]): string[] {
  const consequences: string[] = [];

  if (group.delayedTaskCount > 0) {
    consequences.push("Essa frente concentra atraso real no snapshot atual.");
  }

  if (group.representativeProgressPercent < 100) {
    consequences.push("Sem essa ação, o avanço desta frente tende a continuar bloqueado.");
  }

  if (group.tasks.length > 1) {
    consequences.push("O atraso combinado dessas tarefas mantém progresso represado.");
  }

  if (executiveAlerts.some((alert) => alert.severity === "critical")) {
    consequences.push("Essa ação ajuda a reduzir a pressão operacional mais visível desta leitura.");
  }

  return consequences.slice(0, 3);
}

function resolveImpactType(group: DecisionActionGroup): DecisionActionImpactType {
  if (group.delayedTaskCount > 0) {
    return "delay_reduction";
  }

  if (group.tasks.length > 1) {
    return "unlock";
  }

  return "progress";
}

function resolveUrgencyScore(group: DecisionActionGroup, scheduleStatus: ScheduleStatus | null | undefined): number {
  const schedulePressure =
    scheduleStatus?.status === "ATRASADO" ? 20 : scheduleStatus?.status === "ATENCAO" ? 10 : 0;
  const delayPressure = group.delayedTaskCount * 8;
  return round2(group.impactPercent * 4 + Math.min(group.remainingNormalizedValue / 10000, 25) + delayPressure + schedulePressure);
}

function resolveEffortScore(group: DecisionActionGroup): number {
  const disciplineSpread = Math.max(1, group.disciplineNames.length);
  if (group.tasks.length >= 4 || disciplineSpread > 1) {
    return 3;
  }

  if (group.tasks.length >= 2) {
    return 2;
  }

  return 1;
}

export function buildDecisionActions({
  project,
  compensationAnalysis,
  disciplines = [],
  weightModel,
  analysisReliability,
  scheduleStatus,
  executiveAlerts = [],
}: BuildDecisionActionsInput): DecisionAction[] {
  const topDisciplineName = weightModel.topDisciplinesByRemainingValue[0]?.name;
  const groups = buildDecisionGroups(compensationAnalysis.topTasks, project, disciplines);
  const topImpactPercent = groups[0]?.impactPercent ?? 0;

  return groups.map((group, index) => {
    const confidence = toConfidence(analysisReliability?.overallReliability);
    const cause = classifyOperationalCause({
      progressPercent: group.representativeProgressPercent,
      impactPercent: group.impactPercent,
      remainingNormalizedValue: group.remainingNormalizedValue,
      delayDays: Math.max(...group.tasks.map((task) => task.delayDays), 0),
      occurrenceCount: group.tasks.length,
      hasActualStart: group.tasks.some((task) => Boolean(task.actualStart)),
      hasActualFinish: group.tasks.every((task) => Boolean(task.actualFinish)),
      confidence,
      impactType: resolveImpactType(group),
      scheduleStatus: scheduleStatus?.status,
    });
    const reasons = [cause.explanation, ...buildReasons(group, topDisciplineName, topImpactPercent)];
    const consequences = buildConsequences(group, executiveAlerts);
    const disciplineLabel = group.disciplineType === "OUTRO" ? "frente operacional" : group.disciplineType.toLowerCase();
    const title = group.tasks.length > 1 ? `${group.baseName} (${group.tasks.length} tarefas)` : group.baseName;

    return {
      id: `${group.key}-${index + 1}`,
      title,
      description: `Atue na ${disciplineLabel} ${group.disciplineName ? `de ${group.disciplineName}` : "mais pressionada"} para recuperar avanço imediato.`,
      disciplineType: group.disciplineType,
      disciplineName: group.disciplineName,
      impactPercent: group.impactPercent,
      impactType: resolveImpactType(group),
      gainPercent: group.impactPercent,
      urgencyScore: resolveUrgencyScore(group, scheduleStatus),
      effortScore: resolveEffortScore(group),
      confidence,
      cause,
      reasons,
      consequences,
      relatedTasks: group.tasks,
      occurrenceCount: group.tasks.length,
      representativeProgressPercent: group.representativeProgressPercent,
      remainingNormalizedValue: group.remainingNormalizedValue,
    };
  }).sort((left, right) => {
    if (right.urgencyScore !== left.urgencyScore) {
      return right.urgencyScore - left.urgencyScore;
    }

    return right.impactPercent - left.impactPercent;
  });
}
