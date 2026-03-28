import type { Diagnostics } from "./build-diagnostics";
import type { DiagnosticCategory, DiagnosticIssue, DiagnosticSeverity } from "./types";

export interface DiagnosticGroup {
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  groupKey: string;
  title: string;
  normalizedMessage: string;
  count: number;
  affectedTaskIds: string[];
  sampleDiagnostics: DiagnosticIssue[];
  dominantPattern: string;
}

export interface DiagnosticsAggregation {
  totalItems: number;
  totalGroups: number;
  groups: DiagnosticGroup[];
  topGroups: DiagnosticGroup[];
}

const severityOrder: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const categoryOrder: Record<DiagnosticCategory, number> = {
  structure: 0,
  schedule: 1,
  dependency: 2,
  "data-quality": 3,
};

const MAX_SAMPLE_DIAGNOSTICS = 3;
const MAX_TOP_GROUPS = 5;

type NormalizedDiagnostic = {
  groupKey: string;
  title: string;
  normalizedMessage: string;
  dominantPattern: string;
};

export function buildDiagnosticsAggregation(diagnostics: Diagnostics): DiagnosticsAggregation {
  const groupsByKey = new Map<string, DiagnosticGroup>();

  for (const issue of diagnostics.items) {
    const normalized = normalizeDiagnostic(issue);
    const existingGroup = groupsByKey.get(normalized.groupKey);

    if (!existingGroup) {
      groupsByKey.set(normalized.groupKey, {
        severity: issue.severity,
        category: issue.category,
        groupKey: normalized.groupKey,
        title: normalized.title,
        normalizedMessage: normalized.normalizedMessage,
        count: 1,
        affectedTaskIds: issue.taskId ? [issue.taskId] : [],
        sampleDiagnostics: [issue],
        dominantPattern: normalized.dominantPattern,
      });
      continue;
    }

    existingGroup.count += 1;

    if (issue.taskId && !existingGroup.affectedTaskIds.includes(issue.taskId)) {
      existingGroup.affectedTaskIds.push(issue.taskId);
    }

    if (existingGroup.sampleDiagnostics.length < MAX_SAMPLE_DIAGNOSTICS) {
      existingGroup.sampleDiagnostics.push(issue);
    }
  }

  const groups = [...groupsByKey.values()].sort((left, right) => {
    const severityDifference = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }

    if (right.count !== left.count) {
      return right.count - left.count;
    }

    const categoryDifference = categoryOrder[left.category] - categoryOrder[right.category];
    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    return left.title.localeCompare(right.title);
  });

  return {
    totalItems: diagnostics.items.length,
    totalGroups: groups.length,
    groups,
    topGroups: groups.slice(0, MAX_TOP_GROUPS),
  };
}

function normalizeDiagnostic(issue: DiagnosticIssue): NormalizedDiagnostic {
  switch (issue.id) {
    case "task-missing-resource-reference": {
      const resourceId = issue.message.match(/resource inexistente\s+(.+?)\.?$/i)?.[1] ?? "{resourceId}";
      return createNormalizedDiagnostic(
        issue,
        `resource-reference:${resourceId}`,
        "Referencias a resources inexistentes",
        `Task {taskId} referencia resource inexistente ${resourceId}.`,
        `missing-resource:${resourceId}`,
      );
    }

    case "task-missing-dates":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks sem datas suficientes",
        "Task {taskId} esta sem datas suficientes para analise de cronograma.",
        issue.id,
      );

    case "task-inverted-dates":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks com datas invertidas",
        "Task {taskId} possui data inicial posterior a data final.",
        issue.id,
      );

    case "task-invalid-duration":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks com duration invalida",
        "Task {taskId} possui duration invalida.",
        issue.id,
      );

    case "task-zero-duration":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks com duration zero suspeita",
        "Task {taskId} possui duration 0.",
        issue.id,
      );

    case "milestone-incompatible-duration": {
      if (issue.message.includes("datas incompat")) {
        return createNormalizedDiagnostic(
          issue,
          "milestone-incompatible-duration:dates",
          "Marcos com datas incompativeis",
          "Task {taskId} parece marco com datas incompativeis para duration 0.",
          "milestone-dates-incompatible",
        );
      }

      return createNormalizedDiagnostic(
        issue,
        "milestone-incompatible-duration:duration",
        "Marcos com duration incompatível",
        "Task {taskId} parece marco com duration incompatível maior que 0.",
        "milestone-duration-incompatible",
      );
    }

    case "task-missing-parent": {
      const outlineLevel = issue.message.match(/outlineLevel\s+(\d+)/i)?.[1] ?? "{outlineLevel}";
      return createNormalizedDiagnostic(
        issue,
        `task-missing-parent:${outlineLevel}`,
        "Tasks sem parentId estrutural",
        `Task {taskId} possui outlineLevel ${outlineLevel} sem parentId.`,
        `missing-parent:outline-level-${outlineLevel}`,
      );
    }

    case "task-unassigned-resource":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks marcadas como Unassigned",
        "Task {taskId} esta marcada como Unassigned.",
        issue.id,
      );

    case "dependency-missing-task-reference":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Dependencias com task inexistente",
        "Dependency {dependencyId} referencia task inexistente.",
        issue.id,
      );

    case "task-missing-id":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks sem identificador",
        "Task sem id.",
        issue.id,
      );

    case "task-missing-name":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Tasks sem nome",
        "Task sem nome.",
        issue.id,
      );

    case "resource-missing-id":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Resources sem identificador",
        "Resource sem id.",
        issue.id,
      );

    case "resource-missing-name": {
      const resourceId = issue.message.match(/Resource\s+(.+?)\s+esta sem nome\.?$/i)?.[1] ?? "{resourceId}";
      return createNormalizedDiagnostic(
        issue,
        `resource-missing-name:${resourceId}`,
        "Resources sem nome",
        `Resource ${resourceId} esta sem nome.`,
        `resource-missing-name:${resourceId}`,
      );
    }

    case "project-low-resource-coverage":
      return createNormalizedDiagnostic(
        issue,
        issue.id,
        "Cobertura de recursos abaixo do esperado",
        issue.message,
        issue.id,
      );

    default:
      return createNormalizedDiagnostic(
        issue,
        `${issue.id}:${issue.message}`,
        issue.id,
        issue.message,
        issue.id,
      );
  }
}

function createNormalizedDiagnostic(
  issue: DiagnosticIssue,
  suffix: string,
  title: string,
  normalizedMessage: string,
  dominantPattern: string,
): NormalizedDiagnostic {
  return {
    groupKey: [issue.severity, issue.category, issue.id, suffix].join("|"),
    title,
    normalizedMessage,
    dominantPattern,
  };
}
