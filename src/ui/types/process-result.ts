import type {
  OperationalCompensationAnalysis,
  OperationalCompensationDiscipline,
} from "../../core/compensation/build-operational-compensation";
import type { GapVsCompensation } from "../../core/compensation/build-gap-vs-compensation";
import type { ExecutiveAlert } from "../../core/alerts/build-executive-alerts";
import type { Diagnostics } from "../../core/diagnostics/build-diagnostics";
import type { DiagnosticsAggregation } from "../../core/diagnostics/build-diagnostics-aggregation";
import type { ProjectDiscipline } from "../../core/disciplines/build-project-disciplines";
import type { ProjectInsights } from "../../core/insights/build-project-insights";
import type { Project } from "../../core/model/project";
import type { DisciplineProgressAnalysis } from "../../core/progress/build-discipline-progress";
import type { AnalysisReliability } from "../../core/reliability/build-analysis-reliability";
import type { MPPInputQualityAssessment } from "../../core/input-quality/build-mpp-input-quality";
import type { SCurveResult } from "../../core/s-curve/build-s-curve";
import type { ScheduleStatus } from "../../core/schedule/build-schedule-status";
import type { ProjectScore } from "../../core/score/build-project-score";
import type { ProjectWeightModel } from "../../core/weight/build-project-weight-model";
import type { ProjectComparison } from "../../app/history/snapshot-history";
import type { VersionComparisonSummary } from "../../app/comparison/compare-project-versions";

export type ProcessResult = {
  analysisMode?: "single" | "comparison";
  generatedAt: string;
  model: Project;
  diagnostics: Diagnostics;
  diagnosticsAggregation: DiagnosticsAggregation;
  inputQuality?: MPPInputQualityAssessment;
  json: string;
  structuredXml: string;
  csv: string;
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
  executiveAlerts: ExecutiveAlert[];
  executiveReportHtml: string;
  gapVsCompensation?: GapVsCompensation;
  comparison?: ProjectComparison;
  versionComparison?: VersionComparisonSummary;
};
