import {
  buildProjectInsightsExport,
  stringifyProjectInsightsExport,
  type BuildProjectInsightsExportInput,
  type ProjectInsightsExport,
} from "./build-project-insights-export";

export type ExportedProjectJSON = ProjectInsightsExport;
export type ExportToJSONInput = BuildProjectInsightsExportInput;

export { buildProjectInsightsExport };

export function exportToJSON(input: ExportToJSONInput): string {
  return stringifyProjectInsightsExport(input);
}
