import type { Project } from "../model/project";
import type { DiagnosticIssue } from "../diagnostics/types";

export interface ValidationResult {
  issues: DiagnosticIssue[];
}

function createIssue(issue: DiagnosticIssue): DiagnosticIssue {
  return issue;
}

function hasRelevantDates(task: Project["tasks"][number]): boolean {
  return Boolean(task.startDate || task.endDate);
}

function isMilestoneTask(task: Project["tasks"][number]): boolean {
  if (!hasRelevantDates(task)) {
    return false;
  }

  return Boolean(task.startDate && task.endDate && task.startDate === task.endDate);
}

function hasValidDateRange(task: Project["tasks"][number]): boolean {
  if (!task.startDate || !task.endDate) {
    return true;
  }

  const startDate = Date.parse(task.startDate);
  const endDate = Date.parse(task.endDate);

  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
    return true;
  }

  return startDate <= endDate;
}

export function validateProject(project: Project): ValidationResult {
  const issues: DiagnosticIssue[] = [];
  const taskIds = new Set(project.tasks.map((task) => task.id));
  const resourceIds = new Set(project.resources.map((resource) => resource.id));
  const assignedTasksCount = project.tasks.filter((task) => task.resourceIds.length > 0).length;

  for (const task of project.tasks) {
    if (!task.id) {
      issues.push(
        createIssue({
          id: "task-missing-id",
          severity: "error",
          category: "structure",
          message: "Task sem id.",
          taskName: task.name || undefined,
        }),
      );
    }

    if (!task.name) {
      issues.push(
        createIssue({
          id: "task-missing-name",
          severity: "error",
          category: "data-quality",
          message: "Task sem nome.",
          taskId: task.id || undefined,
        }),
      );
    }

    if (!task.isSummary && (!task.startDate || !task.endDate)) {
      issues.push(
        createIssue({
          id: "task-missing-dates",
          severity: "warning",
          category: "schedule",
          message: `Task ${task.id} está sem datas suficientes para análise de cronograma.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (!hasValidDateRange(task)) {
      issues.push(
        createIssue({
          id: "task-inverted-dates",
          severity: "error",
          category: "schedule",
          message: `Task ${task.id} possui data inicial posterior a data final.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (!Number.isFinite(task.duration) || task.duration < 0) {
      issues.push(
        createIssue({
          id: "task-invalid-duration",
          severity: "error",
          category: "schedule",
          message: `Task ${task.id} possui duração inválida.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (task.duration === 0 && !isMilestoneTask(task)) {
      issues.push(
        createIssue({
          id: "task-zero-duration",
          severity: "warning",
          category: "schedule",
          message: `Task ${task.id} possui duração 0.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (isMilestoneTask(task) && task.duration > 0) {
      issues.push(
        createIssue({
          id: "milestone-incompatible-duration",
          severity: "warning",
          category: "schedule",
          message: `Task ${task.id} parece marco com duração incompatível maior que 0.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (task.duration === 0 && hasRelevantDates(task) && task.startDate !== task.endDate) {
      issues.push(
        createIssue({
          id: "milestone-incompatible-duration",
          severity: "warning",
          category: "schedule",
          message: `Task ${task.id} parece marco com datas incompatíveis para duração 0.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    if (!task.parentId && task.outlineLevel > 1) {
      issues.push(
        createIssue({
          id: "task-missing-parent",
          severity: "warning",
          category: "structure",
          message: `Task ${task.id} possui outlineLevel ${task.outlineLevel} sem parentId.`,
          taskId: task.id,
          taskName: task.name,
        }),
      );
    }

    for (const resourceId of task.resourceIds) {
      if (resourceId === "-1") {
        issues.push(
          createIssue({
            id: "task-unassigned-resource",
            severity: "warning",
            category: "data-quality",
            message: `Task ${task.id} está marcada como não atribuída.`,
            taskId: task.id,
            taskName: task.name,
          }),
        );
        continue;
      }

      if (!resourceIds.has(resourceId)) {
        issues.push(
          createIssue({
            id: "task-missing-resource-reference",
            severity: "error",
            category: "data-quality",
            message: `Task ${task.id} referencia recurso inexistente ${resourceId}.`,
            taskId: task.id,
            taskName: task.name,
          }),
        );
      }
    }
  }

  for (const dependency of project.dependencies) {
    if (!taskIds.has(dependency.fromTaskId) || !taskIds.has(dependency.toTaskId)) {
      const targetTask = project.tasks.find((task) => task.id === dependency.toTaskId);

      issues.push(
        createIssue({
          id: "dependency-missing-task-reference",
          severity: "error",
          category: "dependency",
          message: `Dependency ${dependency.id} referencia task inexistente.`,
          taskId: targetTask?.id,
          taskName: targetTask?.name,
        }),
      );
    }
  }

  for (const resource of project.resources) {
    if (!resource.id) {
      issues.push(
        createIssue({
          id: "resource-missing-id",
          severity: "error",
          category: "data-quality",
          message: "Resource sem id.",
        }),
      );
    }

    if (!resource.name) {
      issues.push(
        createIssue({
          id: "resource-missing-name",
          severity: "warning",
          category: "data-quality",
          message: `Resource ${resource.id} está sem nome.`,
        }),
      );
    }
  }

  if (assignedTasksCount > 100 && project.resources.length <= 1) {
    issues.push(
      createIssue({
        id: "project-low-resource-coverage",
        severity: "warning",
        category: "data-quality",
        message: "Project possui muitos assignments e recursos nomeados muito abaixo do esperado.",
      }),
    );
  }

  return {
    issues,
  };
}

