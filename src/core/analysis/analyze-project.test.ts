import { describe, expect, it } from "vitest";

import type { Project } from "../model/project";
import { analyzeProject, ProjectAnalysisFatalError } from "./analyze-project";

const project: Project = {
  id: "project-1",
  name: "Projeto Analise",
  statusDate: "2026-04-10T00:00:00",
  currentDate: "2026-04-10T00:00:00",
  resources: [],
  dependencies: [],
  tasks: [
    {
      id: "1",
      name: "Disciplina",
      startDate: "2026-04-01T08:00:00",
      endDate: "2026-04-10T17:00:00",
      percentComplete: 0,
      physicalPercentComplete: 0,
      actualStartDate: "",
      actualEndDate: "",
      actualDurationHours: 0,
      actualWorkHours: 0,
      remainingWorkHours: 0,
      baselineStartDate: "2026-04-01T08:00:00",
      baselineEndDate: "2026-04-10T17:00:00",
      baselineDurationHours: 80,
      resumeDate: "",
      stopDate: "",
      duration: 80,
      outlineLevel: 1,
      outlineNumber: "1",
      isSummary: true,
      resourceIds: [],
    },
    {
      id: "2",
      name: "Atividade",
      startDate: "2026-04-01T08:00:00",
      endDate: "2026-04-05T17:00:00",
      percentComplete: 50,
      physicalPercentComplete: 50,
      actualStartDate: "2026-04-01T08:00:00",
      actualEndDate: "",
      actualDurationHours: 16,
      actualWorkHours: 16,
      remainingWorkHours: 16,
      baselineStartDate: "2026-04-01T08:00:00",
      baselineEndDate: "2026-04-05T17:00:00",
      baselineDurationHours: 40,
      resumeDate: "",
      stopDate: "",
      duration: 40,
      outlineLevel: 2,
      outlineNumber: "1.1",
      isSummary: false,
      parentId: "1",
      resourceIds: [],
    },
  ],
};

describe("analyzeProject", () => {
  it("analyzes a canonical Project without depending on an input format", () => {
    const result = analyzeProject(project, "2026-04-10T12:00:00.000Z");

    expect(result.insights.summary.status).toBeDefined();
    expect(result.score).toBeDefined();
    expect(result.disciplines).toHaveLength(1);
    expect(result.weightModel.normalizedProjectValue).toBeGreaterThan(0);
    expect(result.executiveReportHtml).toContain("Projeto Analise");
  });

  it("fails explicitly when a canonical Project has no usable temporal basis", () => {
    expect(() =>
      analyzeProject(
        {
          ...project,
          tasks: [
            {
              ...project.tasks[1],
              startDate: "",
              endDate: "",
              baselineStartDate: "",
              baselineEndDate: "",
              baselineDurationHours: 0,
            },
          ],
        },
        "2026-04-10T12:00:00.000Z",
      ),
    ).toThrow(ProjectAnalysisFatalError);
  });
});
