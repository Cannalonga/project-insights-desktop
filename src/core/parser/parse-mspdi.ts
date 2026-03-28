import type { RawDependency, RawProject, RawResource, RawTask } from "./types";
import { MSPDIParseError } from "./mspdi-parse-error";

const ENABLE_MSPDI_DEBUG = false;
const MAX_XML_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_TASK_NODES = 25_000;
const MAX_OUTLINE_LEVEL = 20;
const FORBIDDEN_XML_MARKUP = /<!DOCTYPE|<!ENTITY|<!ATTLIST|<!NOTATION/i;

function getFirstChildText(parent: Element, tagName: string): string | undefined {
  const child = Array.from(parent.children).find((element) => element.localName === tagName);
  const text = child?.textContent?.trim();

  return text ? text : undefined;
}

function getFirstChildElement(parent: Element, tagName: string): Element | undefined {
  return Array.from(parent.children).find((element) => element.localName === tagName);
}

function getChildElements(parent: ParentNode, tagName: string): Element[] {
  return Array.from(parent.children).filter((element) => element.localName === tagName);
}

function logMSPDIDebug(label: string, value: unknown): void {
  if (!ENABLE_MSPDI_DEBUG) {
    return;
  }
}

function parseDurationToHours(value?: string): number {
  if (!value) {
    return 0;
  }

  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);

  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours + minutes / 60 + seconds / 3600;
}

function parseSummary(value?: string): boolean {
  return value === "1";
}

function parseNumericValue(value?: string): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return parsedValue;
}

function parseOutlineLevel(value?: string): number {
  return parseNumericValue(value);
}

function getPrimaryBaseline(taskElement: Element): Element | undefined {
  const baselines = getChildElements(taskElement, "Baseline");
  if (baselines.length === 0) {
    return undefined;
  }

  return (
    baselines.find((baseline) => getFirstChildText(baseline, "Number") === "0")
    ?? baselines[0]
  );
}

function getTaskBaselineText(taskElement: Element, tagName: string): string | undefined {
  const baseline = getPrimaryBaseline(taskElement);
  if (!baseline) {
    return undefined;
  }

  return getFirstChildText(baseline, tagName);
}

function parseTasks(projectElement: Element): RawTask[] {
  const tasksElement = getChildElements(projectElement, "Tasks")[0];

  if (!tasksElement) {
    return [];
  }

  return getChildElements(tasksElement, "Task").map((taskElement) => ({
    id: getFirstChildText(taskElement, "UID"),
    name: getFirstChildText(taskElement, "Name"),
    startDate: getFirstChildText(taskElement, "Start"),
    endDate: getFirstChildText(taskElement, "Finish"),
    percentComplete: parseNumericValue(
      getFirstChildText(taskElement, "PercentComplete") ?? getFirstChildText(taskElement, "PercentageComplete"),
    ),
    physicalPercentComplete: parseNumericValue(getFirstChildText(taskElement, "PhysicalPercentComplete")),
    actualStartDate: getFirstChildText(taskElement, "ActualStart"),
    actualEndDate: getFirstChildText(taskElement, "ActualFinish"),
    actualDurationHours: parseDurationToHours(getFirstChildText(taskElement, "ActualDuration")),
    actualWorkHours: parseDurationToHours(getFirstChildText(taskElement, "ActualWork")),
    remainingWorkHours: parseDurationToHours(getFirstChildText(taskElement, "RemainingWork")),
    baselineStartDate: getFirstChildText(taskElement, "BaselineStart") ?? getTaskBaselineText(taskElement, "Start"),
    baselineEndDate: getFirstChildText(taskElement, "BaselineFinish") ?? getTaskBaselineText(taskElement, "Finish"),
    baselineDurationHours: parseDurationToHours(
      getFirstChildText(taskElement, "BaselineDuration") ?? getTaskBaselineText(taskElement, "Duration"),
    ),
    resumeDate: getFirstChildText(taskElement, "Resume"),
    stopDate: getFirstChildText(taskElement, "Stop"),
    duration: parseDurationToHours(getFirstChildText(taskElement, "Duration")),
    outlineLevel: parseOutlineLevel(getFirstChildText(taskElement, "OutlineLevel")),
    outlineNumber: getFirstChildText(taskElement, "OutlineNumber"),
    summary: parseSummary(getFirstChildText(taskElement, "Summary")),
    parentId: getFirstChildText(taskElement, "OutlineParentUID"),
    resourceIds: [],
  }));
}

function parseResources(projectElement: Element): RawResource[] {
  const resourcesElement = getChildElements(projectElement, "Resources")[0];

  if (!resourcesElement) {
    logMSPDIDebug("resources count", 0);
    return [];
  }

  const resourceElements = getChildElements(resourcesElement, "Resource");
  const resources = resourceElements.map((resourceElement) => {
    const uid = getFirstChildText(resourceElement, "UID");
    const id = getFirstChildText(resourceElement, "ID");
    const name = getFirstChildText(resourceElement, "Name");
    const type = getFirstChildText(resourceElement, "Type");

    return {
      id: uid,
      name,
      type,
      _debugId: id,
    };
  });

  logMSPDIDebug("resources count", resources.length);
  logMSPDIDebug(
    "resources sample",
    resources.slice(0, 10).map((resource) => ({
      uid: resource.id,
      id: resource._debugId,
      name: resource.name,
      type: resource.type,
    })),
  );

  return resources.map(({ id, name, type }) => ({
    id,
    name,
    type,
  }));
}

function parseDependencies(projectElement: Element): RawDependency[] {
  const tasksElement = getChildElements(projectElement, "Tasks")[0];

  if (!tasksElement) {
    return [];
  }

  const dependencies: RawDependency[] = [];

  for (const taskElement of getChildElements(tasksElement, "Task")) {
    const currentTaskId = getFirstChildText(taskElement, "UID");
    const predecessorLinks = getChildElements(taskElement, "PredecessorLink");

    for (const predecessorLink of predecessorLinks) {
      dependencies.push({
        id: `${getFirstChildText(predecessorLink, "PredecessorUID") ?? ""}-${currentTaskId ?? ""}`,
        fromTaskId: getFirstChildText(predecessorLink, "PredecessorUID"),
        toTaskId: currentTaskId,
        type: getFirstChildText(predecessorLink, "Type"),
      });
    }
  }

  return dependencies;
}

function buildAssignmentMap(projectElement: Element): Map<string, string[]> {
  const assignmentsElement = getChildElements(projectElement, "Assignments")[0];
  const assignments = new Map<string, string[]>();

  if (!assignmentsElement) {
    logMSPDIDebug("assignments count", 0);
    return assignments;
  }

  const assignmentElements = getChildElements(assignmentsElement, "Assignment");
  const assignmentSamples: Array<{ uid?: string; taskUID?: string; resourceUID?: string }> = [];

  for (const assignmentElement of assignmentElements) {
    const assignmentUID = getFirstChildText(assignmentElement, "UID");
    const taskId = getFirstChildText(assignmentElement, "TaskUID");
    const resourceId = getFirstChildText(assignmentElement, "ResourceUID");

    if (assignmentSamples.length < 10) {
      assignmentSamples.push({
        uid: assignmentUID,
        taskUID: taskId,
        resourceUID: resourceId,
      });
    }

    if (!taskId || !resourceId) {
      continue;
    }

    const taskResourceIds = assignments.get(taskId) ?? [];
    taskResourceIds.push(resourceId);
    assignments.set(taskId, taskResourceIds);
  }

  logMSPDIDebug("assignments count", assignmentElements.length);
  logMSPDIDebug(
    "assignment resourceUID sample",
    assignmentSamples.map((assignment) => assignment.resourceUID),
  );
  logMSPDIDebug("assignments sample", assignmentSamples);

  return assignments;
}

function getProjectElement(xmlContent: string): Element {
  if (!xmlContent.trim()) {
    throw new MSPDIParseError("EMPTY_FILE", "Empty XML content");
  }

  const xmlSize = new TextEncoder().encode(xmlContent).length;
  if (xmlSize > MAX_XML_DOCUMENT_BYTES) {
    throw new MSPDIParseError("XML_TOO_LARGE", "XML content exceeds the safe processing size limit");
  }

  if (FORBIDDEN_XML_MARKUP.test(xmlContent)) {
    throw new MSPDIParseError("UNSAFE_XML", "Unsafe XML markup is not allowed");
  }

  const parser = new DOMParser();
  const xmlDocument = parser.parseFromString(xmlContent, "application/xml");
  const parserErrors = Array.from(xmlDocument.getElementsByTagName("parsererror"));

  if (parserErrors.length > 0) {
    throw new MSPDIParseError("INVALID_XML", "Invalid XML content");
  }

  const projectElement = xmlDocument.documentElement;

  if (!projectElement || projectElement.localName !== "Project") {
    throw new MSPDIParseError("INVALID_MSPDI", "Invalid MSPDI XML: missing Project root node");
  }

  return projectElement;
}

function getValidatedTaskNodes(projectElement: Element): Element[] {
  const tasksElement = getChildElements(projectElement, "Tasks")[0];

  if (!tasksElement) {
    throw new MSPDIParseError("INVALID_MSPDI", "Invalid MSPDI XML: missing Tasks section");
  }

  const taskNodes = getChildElements(tasksElement, "Task");

  if (taskNodes.length === 0) {
    throw new MSPDIParseError("NO_TASKS_FOUND", "Invalid MSPDI XML: no Task nodes found");
  }

  if (taskNodes.length > MAX_TASK_NODES) {
    throw new MSPDIParseError("TOO_MANY_TASKS", "Task count exceeds the safe processing limit");
  }

  const hasUsableTask = taskNodes.some((taskNode) => {
    const taskId = getFirstChildText(taskNode, "UID");
    const taskName = getFirstChildText(taskNode, "Name");

    return Boolean(taskId || taskName);
  });

  if (!hasUsableTask) {
    throw new MSPDIParseError("INVALID_MSPDI", "Invalid MSPDI XML: no usable Task nodes found");
  }

  const exceedsOutlineDepth = taskNodes.some((taskNode) => {
    const outlineLevel = parseOutlineLevel(getFirstChildText(taskNode, "OutlineLevel"));
    return outlineLevel > MAX_OUTLINE_LEVEL;
  });

  if (exceedsOutlineDepth) {
    throw new MSPDIParseError("OUTLINE_DEPTH_EXCEEDED", "Outline depth exceeds the safe processing limit");
  }

  return taskNodes;
}

export function parseMSPDI(xmlContent: string): RawProject {
  const projectElement = getProjectElement(xmlContent);
  getValidatedTaskNodes(projectElement);

  const assignmentMap = buildAssignmentMap(projectElement);
  const tasks = parseTasks(projectElement).map((task) => ({
    ...task,
    resourceIds: assignmentMap.get(task.id ?? "") ?? [],
  }));

  return {
    name: getFirstChildText(projectElement, "Name"),
    statusDate: getFirstChildText(projectElement, "StatusDate"),
    currentDate: getFirstChildText(projectElement, "CurrentDate"),
    tasks,
    resources: parseResources(projectElement),
    dependencies: parseDependencies(projectElement),
  };
}
