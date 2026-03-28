import { describe, expect, it } from "vitest";

import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { Project } from "../model/project";
import { buildMPPInputQuality } from "./build-mpp-input-quality";

function createDiagnostics(overrides: Partial<Diagnostics> = {}): Diagnostics {
  return {
    hasErrors: false,
    hasWarnings: false,
    hasInfo: false,
    items: [],
    errors: [],
    warnings: [],
    info: [],
    ...overrides,
  };
}

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Projeto Teste",
    tasks: [
      {
        id: "1",
        name: "Task 1",
        startDate: "2026-03-01T08:00:00",
        endDate: "2026-03-10T17:00:00",
        percentComplete: 25,
        physicalPercentComplete: 0,
        actualStartDate: "",
        actualEndDate: "",
        actualDurationHours: 0,
        actualWorkHours: 0,
        remainingWorkHours: 0,
        baselineStartDate: "2026-03-01T08:00:00",
        baselineEndDate: "2026-03-10T17:00:00",
        baselineDurationHours: 72,
        resumeDate: "",
        stopDate: "",
        duration: 72,
        outlineLevel: 1,
        outlineNumber: "1",
        isSummary: false,
        resourceIds: ["r1"],
      },
    ],
    resources: [{ id: "r1", name: "Equipe", type: "work" }],
    dependencies: [],
    ...overrides,
  };
}

describe("buildMPPInputQuality", () => {
  it("classifies a healthy input as no relevant problem", () => {
    const assessment = buildMPPInputQuality(createProject(), createDiagnostics());

    expect(assessment.level).toBe("no-relevant-problem");
    expect(assessment.issues).toHaveLength(0);
  });

  it("classifies missing baseline as non-fatal limitation", () => {
    const assessment = buildMPPInputQuality(
      createProject({
        tasks: [
          {
            ...createProject().tasks[0],
            baselineStartDate: "",
            baselineEndDate: "",
          },
        ],
      }),
      createDiagnostics(),
    );

    expect(assessment.level).toBe("non-fatal");
    expect(assessment.issues.some((issue) => issue.id === "baseline-missing")).toBe(true);
  });

  it("classifies missing temporal basis as fatal", () => {
    const assessment = buildMPPInputQuality(
      createProject({
        tasks: [
          {
            ...createProject().tasks[0],
            startDate: "",
            endDate: "",
          },
        ],
      }),
      createDiagnostics(),
    );

    expect(assessment.level).toBe("fatal");
    expect(assessment.issues[0]?.id).toBe("no-valid-current-dates");
  });
});
