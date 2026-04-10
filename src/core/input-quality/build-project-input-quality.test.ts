import { describe, expect, it } from "vitest";

import type { Diagnostics } from "../diagnostics/build-diagnostics";
import type { Project } from "../model/project";
import { buildProjectInputQuality } from "./build-project-input-quality";
import { buildMPPInputQuality } from "./build-mpp-input-quality";

const diagnostics: Diagnostics = {
  hasErrors: false,
  hasWarnings: false,
  hasInfo: false,
  items: [],
  errors: [],
  warnings: [],
  info: [],
};

const project: Project = {
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
};

describe("buildProjectInputQuality", () => {
  it("preserves the current input quality behavior through a neutral entrypoint", () => {
    expect(buildProjectInputQuality(project, diagnostics)).toEqual(
      buildMPPInputQuality(project, diagnostics),
    );
  });
});
