import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { DiagnosticCategory, DiagnosticSeverity } from "../diagnostics/types";
import type { Project } from "../model/project";

type InsightStatus = "consistente" | "atencao" | "critico";

type SchedulePerformanceStatus = "OK" | "ATENCAO" | "CRITICO";

type SchedulePerformance = {
  status: SchedulePerformanceStatus;
  tasksDelayed: number;
  totalTasks: number;
  averageDelay: number;
  maxDelay: number;
  message: string;
};

export type ProjectInsights = {
  summary: {
    status: InsightStatus;
    message: string;
  };
  metrics: {
    totalTasks: number;
    totalMilestones: number;
    totalDependencies: number;
    totalResources: number;
    tasksWithValidDates: number;
    tasksWithoutDates: number;
    tasksWithResources: number;
    tasksWithoutResources: number;
    tasksWithPercentComplete: number;
    tasksWithActualDates: number;
    tasksWithBaseline: number;
    diagnosticsBySeverity: Record<DiagnosticSeverity, number>;
    diagnosticsByCategory: Record<DiagnosticCategory, number>;
  };
  schedulePerformance?: SchedulePerformance;
  highlights: string[];
  warnings: string[];
};

const LOW_RESOURCE_COVERAGE_THRESHOLD = 0.3;
const SCHEDULE_PERFORMANCE_ATTENTION_THRESHOLD = 0.2;

function hasValidDateRange(startDate: string, endDate: string): boolean {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  return start <= end;
}

function hasRealResource(task: Project["tasks"][number]): boolean {
  return task.resourceIds.some((resourceId) => resourceId !== "-1");
}

function hasActualDates(task: Project["tasks"][number]): boolean {
  return Boolean(task.actualStartDate || task.actualEndDate);
}

function hasBaseline(task: Project["tasks"][number]): boolean {
  return Boolean(task.baselineStartDate || task.baselineEndDate || task.baselineDurationHours > 0);
}

function parseDateValue(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Date.parse(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getDelayInDays(startDate: string, endDate: string): number | null {
  const startValue = parseDateValue(startDate);
  const endValue = parseDateValue(endDate);

  if (startValue === null || endValue === null) {
    return null;
  }

  return Math.max(0, (endValue - startValue) / (1000 * 60 * 60 * 24));
}

function createDiagnosticsBySeverity(diagnostics: Diagnostics): Record<DiagnosticSeverity, number> {
  return {
    error: diagnostics.errors.length,
    warning: diagnostics.warnings.length,
    info: diagnostics.info.length,
  };
}

function createDiagnosticsByCategory(diagnostics: Diagnostics): Record<DiagnosticCategory, number> {
  const counts: Record<DiagnosticCategory, number> = {
    structure: 0,
    schedule: 0,
    dependency: 0,
    "data-quality": 0,
  };

  for (const item of diagnostics.items) {
    counts[item.category] += 1;
  }

  return counts;
}

function buildSummary(
  totalTasks: number,
  tasksWithoutDates: number,
  tasksWithoutResources: number,
  diagnosticsBySeverity: Record<DiagnosticSeverity, number>,
): ProjectInsights["summary"] {
  if (diagnosticsBySeverity.error > 0) {
    return {
      status: "critico",
      message: "O projeto possui inconsistencias criticas que comprometem a confiabilidade da analise.",
    };
  }

  if (
    diagnosticsBySeverity.warning > 0 ||
    tasksWithoutDates > 0 ||
    (totalTasks > 0 && tasksWithoutResources / totalTasks > LOW_RESOURCE_COVERAGE_THRESHOLD)
  ) {
    return {
      status: "atencao",
      message: "O projeto requer atencao antes de uso analitico mais confiavel.",
    };
  }

  return {
    status: "consistente",
    message: "O projeto apresenta base consistente para leitura analitica.",
  };
}

function buildHighlights(
  totalTasks: number,
  totalDependencies: number,
  tasksWithValidDates: number,
  tasksWithResources: number,
  tasksWithPercentComplete: number,
  tasksWithActualDates: number,
  tasksWithBaseline: number,
  diagnosticsBySeverity: Record<DiagnosticSeverity, number>,
): string[] {
  const highlights: string[] = [];

  if (totalTasks > 0 && tasksWithValidDates === totalTasks) {
    highlights.push("Todas as tasks possuem datas validas para analise de cronograma.");
  }

  if (totalTasks > 0 && tasksWithResources === totalTasks) {
    highlights.push("Todas as tasks possuem recursos atribuidos.");
  }

  if (totalDependencies > 0) {
    highlights.push("O projeto possui rede de dependencias explicita para analise de sequenciamento.");
  }

  if (tasksWithPercentComplete > 0) {
    highlights.push("O projeto possui dados reais de percentual concluido para acompanhamento de progresso.");
  }

  if (tasksWithActualDates > 0) {
    highlights.push("O projeto possui datas reais de execucao registradas no cronograma.");
  }

  if (tasksWithBaseline > 0) {
    highlights.push("O projeto possui baseline registrada para comparacoes futuras.");
  }

  if (diagnosticsBySeverity.error === 0 && diagnosticsBySeverity.warning === 0 && totalTasks > 0) {
    highlights.push("O projeto nao apresentou diagnosticos criticos ou de atencao nas regras atuais.");
  }

  return highlights;
}

function buildWarnings(
  totalTasks: number,
  tasksWithoutDates: number,
  tasksWithoutResources: number,
  diagnosticsBySeverity: Record<DiagnosticSeverity, number>,
  diagnosticsByCategory: Record<DiagnosticCategory, number>,
): string[] {
  const warnings: string[] = [];

  if (diagnosticsBySeverity.error > 0) {
    warnings.push("O projeto apresenta problemas criticos que devem ser corrigidos antes da conversao final.");
  }

  if (totalTasks > 0 && tasksWithoutResources / totalTasks > LOW_RESOURCE_COVERAGE_THRESHOLD) {
    warnings.push("O projeto apresenta baixa cobertura de recursos nas tasks.");
  }

  if (tasksWithoutDates > 0) {
    warnings.push("Parte das tasks esta sem datas validas para analise de cronograma.");
  }

  if (diagnosticsByCategory.schedule > 0) {
    warnings.push("O cronograma apresenta inconsistencias de datas, duracoes ou marcos.");
  }

  if (diagnosticsByCategory["data-quality"] > 0) {
    warnings.push("O projeto apresenta problemas agregados de qualidade de dados.");
  }

  if (diagnosticsByCategory.structure > 0) {
    warnings.push("A estrutura do projeto apresenta sinais de incompletude ou organizacao inconsistente.");
  }

  if (diagnosticsByCategory.dependency > 0) {
    warnings.push("A rede de dependencias possui inconsistencias que afetam a leitura do sequenciamento.");
  }

  return warnings;
}

function buildSchedulePerformance(project: Project): SchedulePerformance | undefined {
  const delays = project.tasks
    .map((task) => {
      if (task.actualEndDate) {
        return getDelayInDays(task.endDate, task.actualEndDate);
      }

      if (task.baselineEndDate) {
        return getDelayInDays(task.baselineEndDate, task.endDate);
      }

      return null;
    })
    .filter((delay): delay is number => delay !== null);

  if (delays.length === 0) {
    return undefined;
  }

  const tasksDelayed = delays.filter((delay) => delay > 0).length;
  const averageDelay = Number((delays.reduce((sum, delay) => sum + delay, 0) / delays.length).toFixed(2));
  const maxDelay = Number(Math.max(...delays).toFixed(2));
  const delayedRatio = tasksDelayed / delays.length;

  if (tasksDelayed === 0) {
    return {
      status: "OK",
      tasksDelayed,
      totalTasks: delays.length,
      averageDelay,
      maxDelay,
      message: "Nao foram identificados atrasos nas tasks com dados reais de prazo.",
    };
  }

  if (delayedRatio <= SCHEDULE_PERFORMANCE_ATTENTION_THRESHOLD) {
    return {
      status: "ATENCAO",
      tasksDelayed,
      totalTasks: delays.length,
      averageDelay,
      maxDelay,
      message: "Ha atrasos pontuais nas tasks com dados reais de prazo.",
    };
  }

  return {
    status: "CRITICO",
    tasksDelayed,
    totalTasks: delays.length,
    averageDelay,
    maxDelay,
    message: "Ha incidencia relevante de atraso nas tasks com dados reais de prazo.",
  };
}

export function buildProjectInsights(project: Project, diagnostics: Diagnostics): ProjectInsights {
  const totalTasks = project.tasks.length;
  const totalMilestones = project.tasks.filter((task) => task.duration === 0).length;
  const totalDependencies = project.dependencies.length;
  const totalResources = project.resources.length;
  const tasksWithValidDates = project.tasks.filter(
    (task) => Boolean(task.startDate && task.endDate) && hasValidDateRange(task.startDate, task.endDate),
  ).length;
  const tasksWithoutDates = totalTasks - tasksWithValidDates;
  const tasksWithResources = project.tasks.filter((task) => hasRealResource(task)).length;
  const tasksWithoutResources = totalTasks - tasksWithResources;
  const tasksWithPercentComplete = project.tasks.filter((task) => task.percentComplete > 0).length;
  const tasksWithActualDates = project.tasks.filter((task) => hasActualDates(task)).length;
  const tasksWithBaseline = project.tasks.filter((task) => hasBaseline(task)).length;
  const diagnosticsBySeverity = createDiagnosticsBySeverity(diagnostics);
  const diagnosticsByCategory = createDiagnosticsByCategory(diagnostics);
  const schedulePerformance = buildSchedulePerformance(project);

  return {
    summary: buildSummary(totalTasks, tasksWithoutDates, tasksWithoutResources, diagnosticsBySeverity),
    metrics: {
      totalTasks,
      totalMilestones,
      totalDependencies,
      totalResources,
      tasksWithValidDates,
      tasksWithoutDates,
      tasksWithResources,
      tasksWithoutResources,
      tasksWithPercentComplete,
      tasksWithActualDates,
      tasksWithBaseline,
      diagnosticsBySeverity,
      diagnosticsByCategory,
    },
    schedulePerformance,
    highlights: buildHighlights(
      totalTasks,
      totalDependencies,
      tasksWithValidDates,
      tasksWithResources,
      tasksWithPercentComplete,
      tasksWithActualDates,
      tasksWithBaseline,
      diagnosticsBySeverity,
    ),
    warnings: buildWarnings(
      totalTasks,
      tasksWithoutDates,
      tasksWithoutResources,
      diagnosticsBySeverity,
      diagnosticsByCategory,
    ),
  };
}
