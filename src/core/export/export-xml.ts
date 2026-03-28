import type { OperationalCompensationAnalysis, OperationalCompensationDiscipline } from "../compensation/build-operational-compensation";
import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { DiagnosticsAggregation } from "../diagnostics/build-diagnostics-aggregation";
import type { ProjectDiscipline } from "../disciplines/build-project-disciplines";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { DisciplineProgressAnalysis } from "../progress/build-discipline-progress";
import type { AnalysisReliability } from "../reliability/build-analysis-reliability";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ScheduleStatus } from "../schedule/build-schedule-status";
import type { ProjectScore } from "../score/build-project-score";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

type ExportToXMLInput = {
  generatedAt: string;
  project: Project;
  diagnostics: Diagnostics;
  diagnosticsAggregation: DiagnosticsAggregation;
  insights: ProjectInsights;
  score: ProjectScore;
  disciplines: ProjectDiscipline[];
  weightModel: ProjectWeightModel;
  disciplineProgress?: DisciplineProgressAnalysis;
  sCurve?: SCurveResult;
  scheduleStatus?: ScheduleStatus;
  analysisReliability?: AnalysisReliability;
  compensationAnalysis: OperationalCompensationAnalysis;
  compensationByDiscipline: OperationalCompensationDiscipline[];
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function valueTag(tagName: string, value: string | number | boolean | undefined): string {
  return `<${tagName}>${escapeXml(String(value ?? ""))}</${tagName}>`;
}

export function exportToXML(input: ExportToXMLInput): string {
  const {
    generatedAt,
    project,
    diagnostics,
    diagnosticsAggregation,
    insights,
    score,
    disciplines,
    weightModel,
    disciplineProgress,
    sCurve,
    scheduleStatus,
    analysisReliability,
    compensationAnalysis,
    compensationByDiscipline,
  } = input;

  const tasksXml = project.tasks.map((task) => `
      <task>
        ${valueTag("id", task.id)}
        ${valueTag("outlineNumber", task.outlineNumber)}
        ${valueTag("outlineLevel", task.outlineLevel)}
        ${valueTag("parentId", task.parentId)}
        ${valueTag("name", task.name)}
        ${valueTag("startDate", task.startDate)}
        ${valueTag("endDate", task.endDate)}
        ${valueTag("actualStartDate", task.actualStartDate)}
        ${valueTag("actualEndDate", task.actualEndDate)}
        ${valueTag("baselineStartDate", task.baselineStartDate)}
        ${valueTag("baselineEndDate", task.baselineEndDate)}
        ${valueTag("percentComplete", task.percentComplete)}
        ${valueTag("physicalPercentComplete", task.physicalPercentComplete)}
        ${valueTag("duration", task.duration)}
        ${valueTag("baselineDurationHours", task.baselineDurationHours)}
        ${valueTag("actualDurationHours", task.actualDurationHours)}
        ${valueTag("actualWorkHours", task.actualWorkHours)}
        ${valueTag("remainingWorkHours", task.remainingWorkHours)}
        ${valueTag("resumeDate", task.resumeDate)}
        ${valueTag("stopDate", task.stopDate)}
        ${valueTag("isSummary", task.isSummary)}
        <resourceIds>${task.resourceIds.map((resourceId) => valueTag("resourceId", resourceId)).join("")}</resourceIds>
      </task>`.trim()).join("\n");

  const resourcesXml = project.resources.map((resource) => `
      <resource>
        ${valueTag("id", resource.id)}
        ${valueTag("name", resource.name)}
        ${valueTag("type", resource.type)}
      </resource>`.trim()).join("\n");

  const dependenciesXml = project.dependencies.map((dependency) => `
      <dependency>
        ${valueTag("id", dependency.id)}
        ${valueTag("fromTaskId", dependency.fromTaskId)}
        ${valueTag("toTaskId", dependency.toTaskId)}
        ${valueTag("type", dependency.type)}
      </dependency>`.trim()).join("\n");

  const diagnosticsXml = diagnostics.items.map((item) => `
      <diagnostic>
        ${valueTag("id", item.id)}
        ${valueTag("severity", item.severity)}
        ${valueTag("category", item.category)}
        ${valueTag("message", item.message)}
        ${valueTag("taskId", item.taskId)}
        ${valueTag("taskName", item.taskName)}
      </diagnostic>`.trim()).join("\n");

  const diagnosticsGroupsXml = diagnosticsAggregation.groups.map((group) => `
      <group>
        ${valueTag("severity", group.severity)}
        ${valueTag("category", group.category)}
        ${valueTag("groupKey", group.groupKey)}
        ${valueTag("title", group.title)}
        ${valueTag("normalizedMessage", group.normalizedMessage)}
        ${valueTag("count", group.count)}
        ${valueTag("dominantPattern", group.dominantPattern)}
        <affectedTaskIds>${group.affectedTaskIds.map((taskId) => valueTag("taskId", taskId)).join("")}</affectedTaskIds>
      </group>`.trim()).join("\n");

  const disciplinesXml = disciplines.map((discipline) => `
      <discipline>
        ${valueTag("outlineNumber", discipline.outlineNumber)}
        ${valueTag("name", discipline.name)}
        ${valueTag("totalTasks", discipline.totalTasks)}
      </discipline>`.trim()).join("\n");

  const disciplineProgressXml = disciplineProgress
    ? disciplineProgress.disciplines.map((discipline) => `
      <disciplineProgress>
        ${valueTag("disciplineName", discipline.disciplineName)}
        ${valueTag("outlineNumber", discipline.outlineNumber)}
        ${valueTag("averagePercentComplete", discipline.averagePercentComplete)}
        ${valueTag("progressWeightedPercent", discipline.progressWeightedPercent)}
        ${valueTag("earnedNormalizedValue", discipline.earnedNormalizedValue)}
        ${valueTag("remainingNormalizedValue", discipline.remainingNormalizedValue)}
        ${valueTag("totalOperationalTasks", discipline.totalOperationalTasks)}
        ${valueTag("completedTasks", discipline.completedTasks)}
        ${valueTag("inProgressTasks", discipline.inProgressTasks)}
        ${valueTag("notStartedTasks", discipline.notStartedTasks)}
      </disciplineProgress>`.trim()).join("\n")
    : "";

  const weightTasksXml = weightModel.taskWeights.map((taskWeight) => `
      <taskWeight>
        ${valueTag("taskId", taskWeight.taskId)}
        ${valueTag("outlineNumber", taskWeight.outlineNumber)}
        ${valueTag("taskName", taskWeight.taskName)}
        ${valueTag("disciplineName", taskWeight.disciplineName)}
        ${valueTag("progressSource", taskWeight.progressSource)}
        ${valueTag("progressPercentUsed", taskWeight.progressPercentUsed)}
        ${valueTag("normalizedValue", taskWeight.normalizedValue)}
        ${valueTag("normalizedWeightPercent", taskWeight.normalizedWeightPercent)}
        ${valueTag("earnedNormalizedValue", taskWeight.earnedNormalizedValue)}
        ${valueTag("remainingNormalizedValue", taskWeight.remainingNormalizedValue)}
      </taskWeight>`.trim()).join("\n");

  const compensationXml = compensationAnalysis.topTasks.map((task) => `
      <task>
        ${valueTag("taskId", task.taskId)}
        ${valueTag("name", task.name)}
        ${valueTag("disciplineName", task.disciplineName)}
        ${valueTag("progressPercent", task.progressPercent)}
        ${valueTag("impactPercent", task.impactPercent)}
        ${valueTag("remainingNormalizedValue", task.remainingNormalizedValue)}
      </task>`.trim()).join("\n");

  const compensationByDisciplineXml = compensationByDiscipline.map((discipline) => `
      <discipline>
        ${valueTag("disciplineName", discipline.disciplineName)}
        ${valueTag("impactPercent", discipline.impactPercent)}
        ${valueTag("totalRemainingValue", discipline.totalRemainingValue)}
        ${valueTag("top3ImpactPercent", discipline.top3ImpactPercent)}
      </discipline>`.trim()).join("\n");

  const sCurveXml = sCurve
    ? sCurve.points.map((point) => `
      <point>
        ${valueTag("date", point.date)}
        ${valueTag("planned", point.planned)}
        ${valueTag("plannedAccumulated", point.plannedAccumulated)}
        ${valueTag("replanned", point.replanned)}
        ${valueTag("replannedAccumulated", point.replannedAccumulated)}
        ${valueTag("real", point.real)}
        ${valueTag("realAccumulated", point.realAccumulated)}
      </point>`.trim()).join("\n")
    : "";

  const warningsXml = analysisReliability?.warnings.map((warning) => valueTag("warning", warning)).join("") ?? "";
  const blockedConclusionsXml =
    analysisReliability?.blockedConclusions.map((item) => `
      <blockedConclusion>
        ${valueTag("area", item.area)}
        ${valueTag("reason", item.reason)}
      </blockedConclusion>`.trim()).join("\n") ?? "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<cannaConverterExport version="1.0">
  <metadata>
    ${valueTag("generatedAt", generatedAt)}
    ${valueTag("inputFormats", "mpp,xml")}
    ${valueTag("exportFormats", "csv,xml,json,html")}
  </metadata>
  <project>
    ${valueTag("id", project.id)}
    ${valueTag("name", project.name)}
  </project>
  <score>
    ${valueTag("value", score.value)}
    ${valueTag("status", score.status)}
    ${valueTag("summaryMessage", score.summaryMessage)}
  </score>
  <insights>
    <summary>
      ${valueTag("status", insights.summary.status)}
      ${valueTag("message", insights.summary.message)}
    </summary>
    <highlights>${insights.highlights.map((highlight) => valueTag("highlight", highlight)).join("")}</highlights>
    <warnings>${insights.warnings.map((warning) => valueTag("warning", warning)).join("")}</warnings>
  </insights>
  <scheduleStatus>
    ${valueTag("status", scheduleStatus?.status)}
    ${valueTag("basedOnBaseline", scheduleStatus?.basedOnBaseline)}
    ${valueTag("progressReal", scheduleStatus?.progressReal)}
    ${valueTag("progressExpected", scheduleStatus?.progressExpected)}
    ${valueTag("gap", scheduleStatus?.gap)}
    ${valueTag("explanation", scheduleStatus?.explanation)}
  </scheduleStatus>
  <analysisReliability>
    ${valueTag("overallReliability", analysisReliability?.overallReliability)}
    ${valueTag("progressReliability", analysisReliability?.progressReliability)}
    ${valueTag("scheduleReliability", analysisReliability?.scheduleReliability)}
    ${valueTag("dataQualityReliability", analysisReliability?.dataQualityReliability)}
    ${valueTag("explanation", analysisReliability?.explanation)}
    <warnings>${warningsXml}</warnings>
    <blockedConclusions>${blockedConclusionsXml}</blockedConclusions>
  </analysisReliability>
  <tasks>
${tasksXml}
  </tasks>
  <resources>
${resourcesXml}
  </resources>
  <dependencies>
${dependenciesXml}
  </dependencies>
  <diagnostics summaryError="${diagnostics.errors.length}" summaryWarning="${diagnostics.warnings.length}" summaryInfo="${diagnostics.info.length}">
${diagnosticsXml}
  </diagnostics>
  <diagnosticsAggregation>
${diagnosticsGroupsXml}
  </diagnosticsAggregation>
  <disciplines>
${disciplinesXml}
  </disciplines>
  <disciplineProgress>
${disciplineProgressXml}
  </disciplineProgress>
  <weightModel>
    ${valueTag("normalizedProjectValue", weightModel.normalizedProjectValue)}
    ${valueTag("totalEarnedNormalizedValue", weightModel.totalEarnedNormalizedValue)}
    ${valueTag("totalRemainingNormalizedValue", weightModel.totalRemainingNormalizedValue)}
    ${valueTag("progressWeightedPercent", weightModel.progressWeightedPercent)}
    ${valueTag("disclaimer", weightModel.disclaimer)}
    <taskWeights>
${weightTasksXml}
    </taskWeights>
  </weightModel>
  <compensation>
    ${valueTag("top3ImpactPercent", compensationAnalysis.potential.top3ImpactPercent)}
    ${valueTag("top5ImpactPercent", compensationAnalysis.potential.top5ImpactPercent)}
    ${valueTag("message", compensationAnalysis.potential.message)}
    <topTasks>
${compensationXml}
    </topTasks>
    <byDiscipline>
${compensationByDisciplineXml}
    </byDiscipline>
  </compensation>
  <sCurve scopeLabel="${escapeXml(sCurve?.scopeLabel ?? "")}" granularity="${escapeXml(sCurve?.timelineGranularity ?? "")}">
    ${valueTag("percentBaseValue", sCurve?.percentBaseValue)}
    ${valueTag("explanation", sCurve?.explanation)}
    <points>
${sCurveXml}
    </points>
  </sCurve>
</cannaConverterExport>`;
}
