import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { Project } from "../model/project";

export type MPPInputQualityLevel = "fatal" | "non-fatal" | "no-relevant-problem";
export type MPPInputReliabilityImpact = "MODERATE" | "LOW";
export type MPPInputQualityArea = "general" | "progress" | "schedule" | "data-quality";

export type MPPInputQualityIssue = {
  id: string;
  level: "fatal" | "non-fatal";
  area: MPPInputQualityArea;
  message: string;
  reliabilityImpact?: MPPInputReliabilityImpact;
};

export type MPPInputQualityAssessment = {
  level: MPPInputQualityLevel;
  issues: MPPInputQualityIssue[];
  summary: string;
};

function parseDate(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidCurrentDateRange(task: Project["tasks"][number]): boolean {
  const start = parseDate(task.startDate);
  const finish = parseDate(task.endDate);

  return start !== null && finish !== null && start <= finish;
}

function hasValidBaselineDateRange(task: Project["tasks"][number]): boolean {
  const start = parseDate(task.baselineStartDate);
  const finish = parseDate(task.baselineEndDate);

  return start !== null && finish !== null && start <= finish;
}

function hasProgressSignal(task: Project["tasks"][number]): boolean {
  return (
    task.percentComplete > 0 ||
    task.physicalPercentComplete > 0 ||
    Boolean(task.actualStartDate) ||
    Boolean(task.actualEndDate)
  );
}

function createFatalIssue(id: string, area: MPPInputQualityArea, message: string): MPPInputQualityIssue {
  return {
    id,
    level: "fatal",
    area,
    message,
  };
}

function createNonFatalIssue(
  id: string,
  area: MPPInputQualityArea,
  message: string,
  reliabilityImpact: MPPInputReliabilityImpact = "MODERATE",
): MPPInputQualityIssue {
  return {
    id,
    level: "non-fatal",
    area,
    message,
    reliabilityImpact,
  };
}

export function buildMPPInputQuality(
  project: Project,
  diagnostics: Diagnostics,
): MPPInputQualityAssessment {
  const operationalTasks = project.tasks.filter((task) => !task.isSummary);
  const tasksWithValidCurrentDates = operationalTasks.filter(hasValidCurrentDateRange);
  const tasksWithBaseline = operationalTasks.filter(hasValidBaselineDateRange);
  const tasksWithProgressSignals = operationalTasks.filter(hasProgressSignal);
  const namedResources = project.resources.filter((resource) => resource.name.trim().length > 0);
  const issues: MPPInputQualityIssue[] = [];

  if (project.tasks.length === 0) {
    return {
      level: "fatal",
      issues: [createFatalIssue("empty-project", "general", "O arquivo convertido nao contem tasks para analise.")],
      summary: "Nao existe base minima para produzir leitura operacional honesta.",
    };
  }

  if (operationalTasks.length === 0) {
    return {
      level: "fatal",
      issues: [createFatalIssue("no-operational-tasks", "general", "O cronograma nao contem tasks operacionais utilizaveis para analise.")],
      summary: "Nao existe base minima para produzir leitura operacional honesta.",
    };
  }

  if (tasksWithValidCurrentDates.length === 0) {
    return {
      level: "fatal",
      issues: [
        createFatalIssue(
          "no-valid-current-dates",
          "schedule",
          "Nenhuma task operacional possui datas atuais validas suficientes para leitura temporal.",
        ),
      ],
      summary: "A base temporal do cronograma e insuficiente para produzir leitura operacional honesta.",
    };
  }

  if (tasksWithValidCurrentDates.length / operationalTasks.length < 0.35) {
    issues.push(
      createNonFatalIssue(
        "partial-current-date-coverage",
        "schedule",
        `Apenas ${tasksWithValidCurrentDates.length} de ${operationalTasks.length} tasks operacionais possuem datas atuais validas.`,
        "LOW",
      ),
    );
  }

  if (tasksWithBaseline.length === 0) {
    issues.push(
      createNonFatalIssue(
        "baseline-missing",
        "schedule",
        "O cronograma esta sem baseline valida. A leitura de prazo ficara limitada ou inferida.",
        "MODERATE",
      ),
    );
  }

  if (tasksWithProgressSignals.length === 0) {
    issues.push(
      createNonFatalIssue(
        "weak-progress-signals",
        "progress",
        "O cronograma nao traz sinais reais suficientes de execucao, como percentuais ou datas reais.",
        "MODERATE",
      ),
    );
  }

  if (operationalTasks.length >= 20 && namedResources.length <= 1) {
    issues.push(
      createNonFatalIssue(
        "low-resource-structure",
        "data-quality",
        `A estrutura de resources esta muito reduzida para ${operationalTasks.length} tasks operacionais, o que limita parte da leitura.`,
        "LOW",
      ),
    );
  }

  if (diagnostics.errors.length > 0) {
    issues.push(
      createNonFatalIssue(
        "structural-errors-present",
        "data-quality",
        `${diagnostics.errors.length} diagnostics error permanecem ativos na base convertida.`,
        "LOW",
      ),
    );
  }

  if (issues.length === 0) {
    return {
      level: "no-relevant-problem",
      issues: [],
      summary: "A entrada MPP nao apresenta limitacoes relevantes nas regras atuais.",
    };
  }

  return {
    level: "non-fatal",
    issues,
    summary: "O arquivo .mpp e utilizavel, mas a base apresenta limitacoes que reduzem a confiabilidade de parte da leitura.",
  };
}
