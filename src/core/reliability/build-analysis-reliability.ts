import type { GapVsCompensation } from "../compensation/build-gap-vs-compensation";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import type { MPPInputQualityAssessment } from "../input-quality/build-mpp-input-quality";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

export type AnalysisReliabilityLevel = "HIGH" | "MODERATE" | "LOW" | "CRITICAL";

export type ReliabilityIssue = {
  id: string;
  level: AnalysisReliabilityLevel;
  title: string;
  message: string;
};

export type BlockedConclusion = {
  area: "progress" | "schedule" | "gap-vs-compensation" | "data-quality";
  reason: string;
};

export type AnalysisReliability = {
  overallReliability: AnalysisReliabilityLevel;
  progressReliability: AnalysisReliabilityLevel;
  scheduleReliability: AnalysisReliabilityLevel;
  dataQualityReliability: AnalysisReliabilityLevel;
  dominantIssues: ReliabilityIssue[];
  blockedConclusions: BlockedConclusion[];
  warnings: string[];
  explanation: string;
};

type AnalysisReliabilityInput = {
  diagnostics: Diagnostics;
  diagnosticsAggregation?: DiagnosticsAggregation;
  project: Project;
  insights: ProjectInsights;
  weightModel: ProjectWeightModel;
  disciplineProgress?: DisciplineProgressAnalysis;
  scheduleStatus?: ScheduleStatus;
  gapVsCompensation?: GapVsCompensation;
  inputQuality?: MPPInputQualityAssessment;
};

const levelRank: Record<AnalysisReliabilityLevel, number> = {
  HIGH: 0,
  MODERATE: 1,
  LOW: 2,
  CRITICAL: 3,
};

function downgrade(level: AnalysisReliabilityLevel): AnalysisReliabilityLevel {
  switch (level) {
    case "HIGH":
      return "MODERATE";
    case "MODERATE":
      return "LOW";
    case "LOW":
      return "CRITICAL";
    default:
      return "CRITICAL";
  }
}

function maxLevel(...levels: AnalysisReliabilityLevel[]): AnalysisReliabilityLevel {
  return levels.reduce((worst, current) =>
    levelRank[current] > levelRank[worst] ? current : worst,
  "HIGH");
}

function countIssuesByCategory(diagnostics: Diagnostics, category: "structure" | "schedule" | "data-quality"): number {
  return diagnostics.items.filter((issue) => issue.category === category).length;
}

function countErrorsByCategory(diagnostics: Diagnostics, category: "structure" | "schedule" | "data-quality"): number {
  return diagnostics.errors.filter((issue) => issue.category === category).length;
}

function buildDataQualityAssessment(
  diagnostics: Diagnostics,
  diagnosticsAggregation: DiagnosticsAggregation | undefined,
  insights: ProjectInsights,
): {
  level: AnalysisReliabilityLevel;
  issues: ReliabilityIssue[];
  warnings: string[];
} {
  const issues: ReliabilityIssue[] = [];
  const warnings: string[] = [];
  const totalTasks = Math.max(insights.metrics.totalTasks, 1);
  const tasksWithoutResourcesRatio = insights.metrics.tasksWithoutResources / totalTasks;
  const tasksWithoutDatesRatio = insights.metrics.tasksWithoutDates / totalTasks;
  const structuralOrDataQualityErrors =
    countErrorsByCategory(diagnostics, "structure") + countErrorsByCategory(diagnostics, "data-quality");
  const dominantGroup = diagnosticsAggregation?.topGroups[0];
  const massiveMissingResourceReferences =
    dominantGroup?.severity === "error" &&
    dominantGroup.category === "data-quality" &&
    dominantGroup.dominantPattern.startsWith("missing-resource:") &&
    dominantGroup.count >= Math.max(100, insights.metrics.totalTasks);

  if (massiveMissingResourceReferences) {
    issues.push({
      id: "massive-missing-resource-references",
      level: "CRITICAL",
      title: "Referencias massivas a resources inexistentes",
      message: `A estrutura de recursos apresenta ${dominantGroup.count} referencias a resources inexistentes, comprometendo parte relevante da leitura.`,
    });
    warnings.push("A qualidade de dados esta criticamente comprometida por referencias massivas a resources inexistentes.");
    return {
      level: "CRITICAL",
      issues,
      warnings,
    };
  }

  if (structuralOrDataQualityErrors > 0 || tasksWithoutResourcesRatio >= 0.5 || tasksWithoutDatesRatio >= 0.4) {
    if (tasksWithoutResourcesRatio >= 0.5) {
      issues.push({
        id: "low-resource-coverage",
        level: "LOW",
        title: "Baixa cobertura de recursos",
        message: `Apenas ${insights.metrics.tasksWithResources} de ${insights.metrics.totalTasks} tasks possuem resources validos.`,
      });
    }

    if (tasksWithoutDatesRatio >= 0.4) {
      issues.push({
        id: "low-date-coverage",
        level: "LOW",
        title: "Cobertura fraca de datas validas",
        message: `${insights.metrics.tasksWithoutDates} de ${insights.metrics.totalTasks} tasks estao sem datas suficientes para leitura segura.`,
      });
    }

    if (structuralOrDataQualityErrors > 0) {
      issues.push({
        id: "structural-errors",
        level: "LOW",
        title: "Erros estruturais relevantes",
        message: `${structuralOrDataQualityErrors} diagnostics error de estrutura ou qualidade de dados permanecem ativos.`,
      });
    }

    warnings.push("A qualidade de dados exige cautela antes de tratar conclusoes como fortes.");
    return {
      level: "LOW",
      issues,
      warnings,
    };
  }

  if (
    diagnostics.warnings.length > 0 ||
    tasksWithoutResourcesRatio >= 0.25 ||
    tasksWithoutDatesRatio >= 0.2 ||
    countIssuesByCategory(diagnostics, "data-quality") > 0
  ) {
    if (tasksWithoutResourcesRatio >= 0.25) {
      warnings.push("Ha cobertura parcial de resources, o que limita parte das leituras operacionais.");
    }

    if (tasksWithoutDatesRatio >= 0.2) {
      warnings.push("Parte relevante das tasks esta sem datas validas, reduzindo a qualidade do contexto.");
    }

    return {
      level: "MODERATE",
      issues: [
        {
          id: "moderate-data-quality-constraints",
          level: "MODERATE",
          title: "Restricoes moderadas de qualidade de dados",
          message: "Existem sinais de cobertura parcial de campos essenciais, sem comprometimento estrutural massivo.",
        },
      ],
      warnings,
    };
  }

  return {
    level: "HIGH",
    issues: [],
    warnings,
  };
}

function buildProgressAssessment(
  weightModel: ProjectWeightModel,
  disciplineProgress: DisciplineProgressAnalysis | undefined,
): {
  level: AnalysisReliabilityLevel;
  issues: ReliabilityIssue[];
  warnings: string[];
  blockedConclusions: BlockedConclusion[];
} {
  const issues: ReliabilityIssue[] = [];
  const warnings: string[] = [];
  const blockedConclusions: BlockedConclusion[] = [];
  const totalWeightedTasks = weightModel.taskWeights.length;

  if (totalWeightedTasks === 0) {
    return {
      level: "CRITICAL",
      issues: [
        {
          id: "no-weighted-tasks",
          level: "CRITICAL",
          title: "Sem base operacional ponderada",
          message: "Nao ha tasks operacionais com peso valido para sustentar a leitura de progresso.",
        },
      ],
      warnings: ["A leitura de progresso esta inconclusiva porque nao existe universo ponderado suficiente."],
      blockedConclusions: [
        {
          area: "progress",
          reason: "A leitura de progresso nao deve ser apresentada como forte porque nao ha tasks operacionais com peso valido.",
        },
      ],
    };
  }

  const tasksWithRealProgress =
    totalWeightedTasks - weightModel.progressSourceCoverage.tasksWithoutProgressData;
  const coverage = tasksWithRealProgress / totalWeightedTasks;
  const strongSignals =
    weightModel.progressSourceCoverage.tasksUsingPercentComplete +
    weightModel.progressSourceCoverage.tasksUsingPhysicalPercentComplete;
  const actualEndOnlySignals = weightModel.progressSourceCoverage.tasksConsideredCompletedByActualEndDate;

  let level: AnalysisReliabilityLevel;
  if (coverage >= 0.6) {
    level = "HIGH";
  } else if (coverage >= 0.3) {
    level = "MODERATE";
  } else if (coverage > 0) {
    level = "LOW";
  } else {
    level = "CRITICAL";
  }

  if (coverage > 0 && strongSignals === 0 && actualEndOnlySignals > 0) {
    level = downgrade(level);
    issues.push({
      id: "progress-mostly-from-actual-end",
      level,
      title: "Progresso sustentado por sinais fracos",
      message: "A leitura de progresso depende majoritariamente de conclusao inferida por actualEndDate, sem percentuais reais relevantes.",
    });
  }

  if (coverage < 0.3) {
    blockedConclusions.push({
      area: "progress",
      reason: `A leitura de progresso esta sustentada por apenas ${tasksWithRealProgress} de ${totalWeightedTasks} tasks com fonte real de progresso.`,
    });
    warnings.push("A cobertura real de progresso e pequena em relacao ao universo ponderado.");
  }

  if (disciplineProgress && disciplineProgress.disciplines.length === 0) {
    level = maxLevel(level, "LOW");
    warnings.push("Nao ha distribuicao operacional por disciplina suficiente para sustentar a leitura de progresso.");
  }

  return {
    level,
    issues,
    warnings,
    blockedConclusions,
  };
}

function buildScheduleAssessment(
  diagnostics: Diagnostics,
  insights: ProjectInsights,
  scheduleStatus: ScheduleStatus | undefined,
): {
  level: AnalysisReliabilityLevel;
  issues: ReliabilityIssue[];
  warnings: string[];
  blockedConclusions: BlockedConclusion[];
} {
  const issues: ReliabilityIssue[] = [];
  const warnings: string[] = [];
  const blockedConclusions: BlockedConclusion[] = [];
  const totalTasks = Math.max(insights.metrics.totalTasks, 1);
  const tasksWithoutDatesRatio = insights.metrics.tasksWithoutDates / totalTasks;
  const scheduleErrors = countErrorsByCategory(diagnostics, "schedule");
  const scheduleIssues = countIssuesByCategory(diagnostics, "schedule");

  if (!scheduleStatus) {
    return {
      level: "CRITICAL",
      issues: [
        {
          id: "missing-schedule-status",
          level: "CRITICAL",
          title: "Leitura de prazo indisponivel",
          message: "Nao ha universo operacional suficiente para construir uma leitura de prazo minimamente comparavel.",
        },
      ],
      warnings: ["O prazo esta inconclusivo porque o sistema nao conseguiu formar uma base de comparacao."],
      blockedConclusions: [
        {
          area: "schedule",
          reason: "Nao existe leitura de prazo valida para sustentar conclusao executiva.",
        },
      ],
    };
  }

  if (!scheduleStatus.basedOnBaseline) {
    blockedConclusions.push({
      area: "schedule",
      reason: "O status de prazo nao deve ser tratado como conclusao forte porque a expectativa foi inferida sem baseline valida.",
    });
    warnings.push("A leitura de prazo esta limitada por ausencia de baseline valida.");
  }

  if (scheduleIssues >= Math.max(50, insights.metrics.totalTasks / 3) || tasksWithoutDatesRatio >= 0.4) {
    issues.push({
      id: "critical-schedule-inconsistency",
      level: "CRITICAL",
      title: "Base de prazo criticamente comprometida",
      message: "Inconsistencias massivas de datas ou duracoes comprometem a leitura de prazo.",
    });
    return {
      level: "CRITICAL",
      issues,
      warnings,
      blockedConclusions,
    };
  }

  if (!scheduleStatus.basedOnBaseline) {
    return {
      level: scheduleErrors > 0 ? "CRITICAL" : "LOW",
      issues: [
        {
          id: "schedule-without-baseline",
          level: scheduleErrors > 0 ? "CRITICAL" : "LOW",
          title: "Prazo inferido sem baseline",
          message: "O sistema precisou inferir progresso esperado sem baseline valida, o que limita a confiabilidade do prazo.",
        },
      ],
      warnings,
      blockedConclusions,
    };
  }

  const baselineCoverage =
    scheduleStatus.totalWeightedTasks === 0
      ? 0
      : scheduleStatus.consideredWeightedTasks / scheduleStatus.totalWeightedTasks;

  if (baselineCoverage >= 0.6 && tasksWithoutDatesRatio < 0.2 && scheduleErrors === 0) {
    return {
      level: "HIGH",
      issues,
      warnings,
      blockedConclusions,
    };
  }

  if (baselineCoverage >= 0.3 && tasksWithoutDatesRatio < 0.35 && scheduleErrors === 0) {
    warnings.push("A leitura de prazo usa baseline valida, mas cobre apenas parte do universo ponderado.");
    return {
      level: "MODERATE",
      issues: [
        {
          id: "partial-baseline-coverage",
          level: "MODERATE",
          title: "Cobertura parcial de baseline",
          message: `A leitura de prazo cobre ${scheduleStatus.consideredWeightedTasks} de ${scheduleStatus.totalWeightedTasks} tasks ponderadas.`,
        },
      ],
      warnings,
      blockedConclusions,
    };
  }

  issues.push({
    id: "limited-schedule-universe",
    level: "LOW",
    title: "Universo de prazo limitado",
    message: "A cobertura de baseline ou de datas validas nao e suficiente para uma leitura forte de prazo.",
  });

  return {
    level: "LOW",
    issues,
    warnings,
    blockedConclusions,
  };
}

function buildGapBlockedConclusion(gapVsCompensation: GapVsCompensation | undefined): BlockedConclusion[] {
  if (!gapVsCompensation || gapVsCompensation.status === "unavailable") {
    return [
      {
        area: "gap-vs-compensation",
        reason: "A comparacao entre gap e compensacao esta inconclusiva porque ainda nao ha base historica suficiente.",
      },
    ];
  }

  return [];
}

function computeOverallReliability(
  progressReliability: AnalysisReliabilityLevel,
  scheduleReliability: AnalysisReliabilityLevel,
  dataQualityReliability: AnalysisReliabilityLevel,
): AnalysisReliabilityLevel {
  const levels = [progressReliability, scheduleReliability, dataQualityReliability];
  const criticalCount = levels.filter((level) => level === "CRITICAL").length;
  const lowOrWorseCount = levels.filter((level) => level === "LOW" || level === "CRITICAL").length;
  const moderateOrWorseCount = levels.filter((level) => level !== "HIGH").length;

  if (criticalCount >= 2 || (criticalCount >= 1 && lowOrWorseCount >= 2)) {
    return "CRITICAL";
  }

  if (criticalCount >= 1 || lowOrWorseCount >= 2) {
    return "LOW";
  }

  if (moderateOrWorseCount >= 2) {
    return "MODERATE";
  }

  return "HIGH";
}

function buildExplanation(
  progressReliability: AnalysisReliabilityLevel,
  scheduleReliability: AnalysisReliabilityLevel,
  dataQualityReliability: AnalysisReliabilityLevel,
): string {
  const progressText =
    progressReliability === "HIGH"
      ? "A leitura de progresso e utilizavel com boa sustentacao de sinais reais."
      : progressReliability === "MODERATE"
        ? "A leitura de progresso e utilizavel, mas depende de cobertura parcial do universo ponderado."
        : progressReliability === "LOW"
          ? "A leitura de progresso existe, mas esta sustentada por cobertura limitada ou sinais fracos."
          : "A leitura de progresso esta inconclusiva para uso executivo forte.";

  const scheduleText =
    scheduleReliability === "HIGH"
      ? "A leitura de prazo esta bem sustentada por baseline e datas validas."
      : scheduleReliability === "MODERATE"
        ? "A leitura de prazo e utilizavel, mas cobre apenas parte do universo relevante."
        : scheduleReliability === "LOW"
          ? "A leitura de prazo esta limitada e deve ser tratada com ressalva."
          : "A leitura de prazo esta comprometida ou inconclusiva.";

  const dataText =
    dataQualityReliability === "HIGH"
      ? "A qualidade de dados nao apresenta restricoes relevantes nas regras atuais."
      : dataQualityReliability === "MODERATE"
        ? "A qualidade de dados apresenta restricoes moderadas, sem bloqueio estrutural dominante."
        : dataQualityReliability === "LOW"
          ? "A qualidade de dados compromete parte da interpretacao e exige cautela."
          : "A qualidade de dados esta criticamente comprometida.";

  return `${progressText} ${scheduleText} ${dataText}`;
}

export function buildAnalysisReliability({
  diagnostics,
  diagnosticsAggregation,
  project,
  insights,
  weightModel,
  disciplineProgress,
  scheduleStatus,
  gapVsCompensation,
  inputQuality,
}: AnalysisReliabilityInput): AnalysisReliability {
  const dataQualityAssessment = buildDataQualityAssessment(diagnostics, diagnosticsAggregation, insights);
  const progressAssessment = buildProgressAssessment(weightModel, disciplineProgress);
  const scheduleAssessment = buildScheduleAssessment(diagnostics, insights, scheduleStatus);

  const progressReliability =
    dataQualityAssessment.level === "CRITICAL" && progressAssessment.level === "HIGH"
      ? "MODERATE"
      : progressAssessment.level;
  const scheduleReliability = maxLevel(scheduleAssessment.level, dataQualityAssessment.level === "CRITICAL" ? "LOW" : "HIGH");
  const dataQualityReliability = dataQualityAssessment.level;

  const dominantIssues = [
    ...dataQualityAssessment.issues,
    ...scheduleAssessment.issues,
    ...progressAssessment.issues,
  ]
    .sort((left, right) => levelRank[right.level] - levelRank[left.level])
    .slice(0, 5);

  const blockedConclusions = [
    ...scheduleAssessment.blockedConclusions,
    ...progressAssessment.blockedConclusions,
    ...buildGapBlockedConclusion(gapVsCompensation),
  ];

  if (dataQualityReliability === "CRITICAL") {
    blockedConclusions.push({
      area: "data-quality",
      reason: `A qualidade de dados do projeto ${project.name || project.id} compromete conclusoes fortes em parte da analise.`,
    });
  }

  const warnings = [
    ...dataQualityAssessment.warnings,
    ...scheduleAssessment.warnings,
    ...progressAssessment.warnings,
  ].slice(0, 6);
  let finalOverallReliability = computeOverallReliability(
    progressReliability,
    scheduleReliability,
    dataQualityReliability,
  );
  const finalDominantIssues = [...dominantIssues];
  const finalWarnings = [...warnings];
  let explanation = buildExplanation(progressReliability, scheduleReliability, dataQualityReliability);

  if (inputQuality?.level === "non-fatal") {
    const inputQualityLevel = inputQuality.issues.some((issue) => issue.reliabilityImpact === "LOW")
      ? "LOW"
      : "MODERATE";

    finalOverallReliability = maxLevel(finalOverallReliability, inputQualityLevel);
    finalDominantIssues.unshift(
      ...inputQuality.issues.slice(0, 3).map((issue) => ({
        id: `input-quality:${issue.id}`,
        level: issue.reliabilityImpact ?? "MODERATE",
        title: "Limitacao da entrada MPP",
        message: issue.message,
      })),
    );
    finalWarnings.unshift(inputQuality.summary);
    explanation = `${explanation} ${inputQuality.summary}`;
  }

  return {
    overallReliability: finalOverallReliability,
    progressReliability,
    scheduleReliability,
    dataQualityReliability,
    dominantIssues: finalDominantIssues.slice(0, 5),
    blockedConclusions,
    warnings: finalWarnings.slice(0, 6),
    explanation,
  };
}
