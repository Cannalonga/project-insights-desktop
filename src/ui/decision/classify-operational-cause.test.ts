import { describe, expect, it } from "vitest";

import { classifyOperationalCause } from "./classify-operational-cause";

describe("classifyOperationalCause", () => {
  it("classifies external block when progress is low with real delay and relevant impact", () => {
    const cause = classifyOperationalCause({
      progressPercent: 20,
      impactPercent: 14,
      remainingNormalizedValue: 180000,
      delayDays: 24,
      occurrenceCount: 2,
      hasActualStart: true,
      hasActualFinish: false,
      confidence: "medium",
      impactType: "unlock",
      scheduleStatus: "ATRASADO",
    });

    expect(cause.code).toBe("external_block");
  });

  it("classifies direct execution delay when the task is late and unfinished", () => {
    const cause = classifyOperationalCause({
      progressPercent: 45,
      impactPercent: 9,
      remainingNormalizedValue: 90000,
      delayDays: 10,
      occurrenceCount: 1,
      hasActualStart: true,
      hasActualFinish: false,
      confidence: "high",
      impactType: "delay_reduction",
      scheduleStatus: "ATRASADO",
    });

    expect(cause.code).toBe("execution_delay");
  });

  it("classifies low productivity when execution exists but progress remains below expected", () => {
    const cause = classifyOperationalCause({
      progressPercent: 55,
      impactPercent: 10,
      remainingNormalizedValue: 85000,
      delayDays: 3,
      occurrenceCount: 1,
      hasActualStart: true,
      hasActualFinish: false,
      confidence: "high",
      impactType: "progress",
      scheduleStatus: "ATRASADO",
    });

    expect(cause.code).toBe("low_productivity");
  });

  it("classifies critical concentration when impact is high without stronger cause evidence", () => {
    const cause = classifyOperationalCause({
      progressPercent: 85,
      impactPercent: 18,
      remainingNormalizedValue: 210000,
      delayDays: 0,
      occurrenceCount: 1,
      hasActualStart: true,
      hasActualFinish: false,
      confidence: "medium",
      impactType: "progress",
      scheduleStatus: "ATENCAO",
    });

    expect(cause.code).toBe("critical_concentration");
  });

  it("classifies dependency block when the front has not started and remains delayed", () => {
    const cause = classifyOperationalCause({
      progressPercent: 0,
      impactPercent: 11,
      remainingNormalizedValue: 130000,
      delayDays: 18,
      occurrenceCount: 3,
      hasActualStart: false,
      hasActualFinish: false,
      confidence: "medium",
      impactType: "unlock",
      scheduleStatus: "ATRASADO",
    });

    expect(cause.code).toBe("dependency_block");
  });

  it("falls back to insufficient signal when there is not enough evidence", () => {
    const cause = classifyOperationalCause({
      progressPercent: 0,
      impactPercent: 3,
      remainingNormalizedValue: 5000,
      delayDays: 0,
      occurrenceCount: 1,
      hasActualStart: false,
      hasActualFinish: false,
      confidence: "low",
      impactType: "progress",
      scheduleStatus: "OK",
    });

    expect(cause.code).toBe("insufficient_signal");
  });
});
