import { describe, expect, it } from "vitest";

import { buildGapVsCompensation } from "./build-gap-vs-compensation";

describe("buildGapVsCompensation integration behavior", () => {
  it("keeps unavailable when history exists but there is no negative progress gap", () => {
    const result = buildGapVsCompensation(
      {
        previousSnapshotAt: "2026-03-19T08:00:00.000Z",
        currentSnapshotAt: "2026-03-26T08:00:00.000Z",
        projectMatched: true,
        metricsDelta: {
          percentCompleteDelta: 4,
          completedTasksDelta: 1,
          tasksWithProgressDelta: 2,
          warningDelta: 0,
          errorDelta: 0,
          infoDelta: 0,
        },
        highlights: [],
        warnings: [],
      },
      {
        topTasks: [],
        potential: {
          top3ImpactPercent: 10,
          top5ImpactPercent: 18,
          message: "Mensagem",
        },
      },
    );

    expect(result.status).toBe("unavailable");
    expect(result.gapPercent).toBeUndefined();
  });
});
