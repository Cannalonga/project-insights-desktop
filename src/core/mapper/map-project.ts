import type { Dependency } from "../model/dependency";
import type { Project } from "../model/project";
import type { Resource } from "../model/resource";
import type { Task } from "../model/task";
import type { RawDependency, RawProject, RawResource, RawTask } from "../parser/types";

function mapRawTask(rawTask: RawTask): Task {
  return {
    id: rawTask.id ?? "",
    name: rawTask.name ?? "",
    startDate: rawTask.startDate ?? "",
    endDate: rawTask.endDate ?? "",
    percentComplete: rawTask.percentComplete ?? 0,
    physicalPercentComplete: rawTask.physicalPercentComplete ?? 0,
    actualStartDate: rawTask.actualStartDate ?? "",
    actualEndDate: rawTask.actualEndDate ?? "",
    actualDurationHours: rawTask.actualDurationHours ?? 0,
    actualWorkHours: rawTask.actualWorkHours ?? 0,
    remainingWorkHours: rawTask.remainingWorkHours ?? 0,
    baselineStartDate: rawTask.baselineStartDate ?? "",
    baselineEndDate: rawTask.baselineEndDate ?? "",
    baselineDurationHours: rawTask.baselineDurationHours ?? 0,
    resumeDate: rawTask.resumeDate ?? "",
    stopDate: rawTask.stopDate ?? "",
    duration: rawTask.duration ?? 0,
    outlineLevel: rawTask.outlineLevel ?? 0,
    outlineNumber: rawTask.outlineNumber ?? "",
    isSummary: rawTask.summary ?? false,
    parentId: rawTask.parentId,
    resourceIds: rawTask.resourceIds ?? [],
  };
}

function getParentOutlineNumber(outlineNumber: string): string | undefined {
  if (!outlineNumber.includes(".")) {
    return undefined;
  }

  const segments = outlineNumber.split(".");
  segments.pop();

  const parentOutlineNumber = segments.join(".");
  return parentOutlineNumber || undefined;
}

function populateParentIds(tasks: Task[]): Task[] {
  const taskIdByOutlineNumber = new Map(
    tasks
      .filter((task) => task.outlineNumber)
      .map((task) => [task.outlineNumber, task.id] as const),
  );

  return tasks.map((task) => {
    if (task.outlineLevel <= 1) {
      return {
        ...task,
        parentId: undefined,
      };
    }

    if (task.parentId) {
      return task;
    }

    const parentOutlineNumber = getParentOutlineNumber(task.outlineNumber);
    const parentId = parentOutlineNumber ? taskIdByOutlineNumber.get(parentOutlineNumber) : undefined;

    return {
      ...task,
      parentId,
    };
  });
}

function mapRawResource(rawResource: RawResource): Resource {
  return {
    id: rawResource.id ?? "",
    name: rawResource.name ?? "",
    type: rawResource.type ?? "",
  };
}

function mapRawDependency(rawDependency: RawDependency): Dependency {
  return {
    id: rawDependency.id ?? "",
    fromTaskId: rawDependency.fromTaskId ?? "",
    toTaskId: rawDependency.toTaskId ?? "",
    type: rawDependency.type ?? "",
  };
}

export function mapRawProjectToModel(raw: RawProject): Project {
  const tasks = populateParentIds((raw.tasks ?? []).map(mapRawTask).filter((task) => task.id !== "0"));
  const taskIds = new Set(tasks.map((task) => task.id));
  const hasUnassignedResource = tasks.some((task) => task.resourceIds.includes("-1"));
  const resources = (raw.resources ?? []).map(mapRawResource);
  const hasExplicitUnassignedResource = resources.some((resource) => resource.id === "-1");
  const dependencies = (raw.dependencies ?? [])
    .map(mapRawDependency)
    .filter(
      (dependency) => taskIds.has(dependency.fromTaskId) && taskIds.has(dependency.toTaskId),
    );

  if (hasUnassignedResource && !hasExplicitUnassignedResource) {
    resources.push({
      id: "-1",
      name: "Unassigned",
      type: "system",
    });
  }

  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    statusDate: raw.statusDate ?? "",
    currentDate: raw.currentDate ?? "",
    tasks,
    resources,
    dependencies,
  };
}
