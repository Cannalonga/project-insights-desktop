import type { Diagnostics } from "../diagnostics/build-diagnostics";
import { buildDiagnostics } from "../diagnostics/build-diagnostics";
import { buildProjectInsights, type ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import { buildProjectScore, type ProjectScore } from "../score/build-project-score";
import { validateProject } from "../validation/validate-project";

export type ProjectDiscipline = {
  name: string;
  outlineNumber: string;
  disciplineType?: string;
  totalTasks: number;
  metrics: ProjectInsights["metrics"];
  diagnostics: Diagnostics;
  insights: ProjectInsights;
  score: ProjectScore;
};

function normalizeDisciplineText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectDisciplineTypeFromText(value: string): string | null {
  const normalized = normalizeDisciplineText(value);

  if (normalized.includes("civil")) {
    return "CIVIL";
  }

  if (normalized.includes("mec")) {
    return "MECANICA";
  }

  if (normalized.includes("ele")) {
    return "ELETRICA";
  }

  if (normalized.includes("comiss")) {
    return "COMISSIONAMENTO";
  }

  return null;
}

function detectDisciplineType(
  disciplineRoot: Project["tasks"][number],
  disciplineProject: Project,
): string {
  const rootType = detectDisciplineTypeFromText(disciplineRoot.name);
  if (rootType) {
    return rootType;
  }

  for (const task of disciplineProject.tasks) {
    const detected = detectDisciplineTypeFromText(task.name);
    if (detected) {
      return detected;
    }
  }

  return "OUTRO";
}

function isDisciplineRoot(task: Project["tasks"][number]): boolean {
  return task.isSummary === true && task.outlineLevel === 1 && Boolean(task.outlineNumber);
}

export function belongsToDiscipline(taskOutlineNumber: string, disciplineOutlineNumber: string): boolean {
  return (
    taskOutlineNumber === disciplineOutlineNumber ||
    taskOutlineNumber.startsWith(`${disciplineOutlineNumber}.`)
  );
}

export function buildScopedProjectByOutlineNumber(
  project: Project,
  disciplineOutlineNumber: string,
): Project {
  const tasks = project.tasks.filter((task) =>
    belongsToDiscipline(task.outlineNumber, disciplineOutlineNumber),
  );
  const taskIds = new Set(tasks.map((task) => task.id));
  const resourceIds = new Set(tasks.flatMap((task) => task.resourceIds));
  const resources = project.resources.filter((resource) => resourceIds.has(resource.id));
  const dependencies = project.dependencies.filter(
    (dependency) => taskIds.has(dependency.fromTaskId) && taskIds.has(dependency.toTaskId),
  );

  return {
    id: `${project.id}:${disciplineOutlineNumber}`,
    name: project.name,
    tasks,
    resources,
    dependencies,
  };
}

function buildDisciplineProject(
  project: Project,
  disciplineRoot: Project["tasks"][number],
): Project {
  return {
    ...buildScopedProjectByOutlineNumber(project, disciplineRoot.outlineNumber),
    id: `${project.id}:${disciplineRoot.id}`,
    name: disciplineRoot.name,
  };
}

export function buildProjectDisciplines(project: Project): ProjectDiscipline[] {
  const disciplineRoots = project.tasks.filter(isDisciplineRoot);

  return disciplineRoots
    .map((disciplineRoot) => {
      const disciplineProject = buildDisciplineProject(project, disciplineRoot);
      const validation = validateProject(disciplineProject);
      const diagnostics = buildDiagnostics(validation);
      const insights = buildProjectInsights(disciplineProject, diagnostics);
      const score = buildProjectScore(diagnostics, insights);

      return {
        name: disciplineRoot.name,
        outlineNumber: disciplineRoot.outlineNumber,
        disciplineType: detectDisciplineType(disciplineRoot, disciplineProject),
        totalTasks: disciplineProject.tasks.length,
        metrics: insights.metrics,
        diagnostics,
        insights,
        score,
      };
    })
    .sort((left, right) => left.outlineNumber.localeCompare(right.outlineNumber, undefined, { numeric: true }));
}
