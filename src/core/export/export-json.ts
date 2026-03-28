import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { ProjectInsights } from "../insights/build-project-insights";
import type { Project } from "../model/project";
import type { SCurveResult } from "../s-curve/build-s-curve";
import type { ProjectWeightModel } from "../weight/build-project-weight-model";

export type ExportedProjectJSON = {
  project: {
    id: string;
    name: string;
  };
  tasks: Project["tasks"];
  resources: Project["resources"];
  dependencies: Project["dependencies"];
  diagnostics?: {
    items: Diagnostics["items"];
    summary: {
      error: number;
      warning: number;
      info: number;
    };
  };
  insights?: ProjectInsights;
  weightModel?: ProjectWeightModel;
  sCurve?: SCurveResult;
};

export function exportToJSON(
  project: Project,
  diagnostics?: Diagnostics,
  insights?: ProjectInsights,
  weightModel?: ProjectWeightModel,
  sCurve?: SCurveResult,
): string {
  const payload: ExportedProjectJSON = {
    project: {
      id: project.id,
      name: project.name,
    },
    tasks: project.tasks,
    resources: project.resources,
    dependencies: project.dependencies,
  };

  if (diagnostics) {
    payload.diagnostics = {
      items: diagnostics.items,
      summary: {
        error: diagnostics.errors.length,
        warning: diagnostics.warnings.length,
        info: diagnostics.info.length,
      },
    };
  }

  if (insights) {
    payload.insights = insights;
  }

  if (weightModel) {
    payload.weightModel = weightModel;
  }

  if (sCurve) {
    payload.sCurve = sCurve;
  }

  return JSON.stringify(payload);
}
