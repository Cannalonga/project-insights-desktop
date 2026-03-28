import { describe, expect, it } from "vitest";

import type { Diagnostics } from "./build-diagnostics";
import { buildDiagnosticsAggregation } from "./build-diagnostics-aggregation";

describe("buildDiagnosticsAggregation", () => {
  it("agrupa diagnostics repetitivos por causa raiz preservando a contagem real", () => {
    const diagnostics: Diagnostics = {
      hasErrors: true,
      hasWarnings: false,
      hasInfo: false,
      items: [
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 1 referencia resource inexistente -65535.",
          taskId: "1",
          taskName: "Task 1",
        },
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 10 referencia resource inexistente -65535.",
          taskId: "10",
          taskName: "Task 10",
        },
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 100 referencia resource inexistente -65535.",
          taskId: "100",
          taskName: "Task 100",
        },
      ],
      errors: [],
      warnings: [],
      info: [],
    };
    diagnostics.errors = diagnostics.items;

    const aggregation = buildDiagnosticsAggregation(diagnostics);

    expect(aggregation.totalItems).toBe(3);
    expect(aggregation.totalGroups).toBe(1);
    expect(aggregation.groups[0]).toMatchObject({
      severity: "error",
      category: "data-quality",
      title: "Referencias a resources inexistentes",
      normalizedMessage: "Task {taskId} referencia resource inexistente -65535.",
      count: 3,
      dominantPattern: "missing-resource:-65535",
    });
    expect(aggregation.groups[0].affectedTaskIds).toEqual(["1", "10", "100"]);
    expect(aggregation.groups[0].sampleDiagnostics).toHaveLength(3);
  });

  it("separa grupos quando a causa raiz muda", () => {
    const diagnostics: Diagnostics = {
      hasErrors: true,
      hasWarnings: false,
      hasInfo: false,
      items: [
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 1 referencia resource inexistente -65535.",
          taskId: "1",
        },
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 2 referencia resource inexistente -777.",
          taskId: "2",
        },
      ],
      errors: [],
      warnings: [],
      info: [],
    };
    diagnostics.errors = diagnostics.items;

    const aggregation = buildDiagnosticsAggregation(diagnostics);

    expect(aggregation.totalGroups).toBe(2);
    expect(aggregation.groups.map((group) => group.normalizedMessage)).toEqual([
      "Task {taskId} referencia resource inexistente -65535.",
      "Task {taskId} referencia resource inexistente -777.",
    ]);
  });

  it("ordena por severidade e volume para leitura executiva", () => {
    const diagnostics: Diagnostics = {
      hasErrors: true,
      hasWarnings: true,
      hasInfo: false,
      items: [
        {
          id: "task-missing-dates",
          severity: "warning",
          category: "schedule",
          message: "Task 1 esta sem datas suficientes para analise de cronograma.",
          taskId: "1",
        },
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 2 referencia resource inexistente -65535.",
          taskId: "2",
        },
        {
          id: "task-missing-resource-reference",
          severity: "error",
          category: "data-quality",
          message: "Task 3 referencia resource inexistente -65535.",
          taskId: "3",
        },
      ],
      errors: [],
      warnings: [],
      info: [],
    };
    diagnostics.errors = diagnostics.items.filter((item) => item.severity === "error");
    diagnostics.warnings = diagnostics.items.filter((item) => item.severity === "warning");

    const aggregation = buildDiagnosticsAggregation(diagnostics);

    expect(aggregation.topGroups[0]).toMatchObject({
      severity: "error",
      count: 2,
    });
    expect(aggregation.topGroups[1]).toMatchObject({
      severity: "warning",
      count: 1,
    });
  });
});
