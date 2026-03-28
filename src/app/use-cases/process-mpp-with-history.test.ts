import { describe, expect, it, vi } from "vitest";

import type { SnapshotStore } from "../history/snapshot-store";
import { processMPPWithHistory } from "./process-mpp-with-history";

const validXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Projeto A</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Tarefa 1</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-10T17:00:00</Finish>
        <PercentComplete>50</PercentComplete>
        <Duration>PT8H0M0S</Duration>
        <Summary>0</Summary>
        <OutlineLevel>1</OutlineLevel>
      </Task>
    </Tasks>
  </Project>
`;

describe("processMPPWithHistory", () => {
  it("saves snapshot after valid processing", async () => {
    const store: SnapshotStore = {
      loadSnapshots: vi.fn().mockResolvedValue([]),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processMPPWithHistory({ filePath: "D:\\ProjetoA.xml", xmlContent: validXml }, store);

    expect(result.model.tasks).toHaveLength(1);
    expect(store.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not save snapshot when processing fails", async () => {
    const store: SnapshotStore = {
      loadSnapshots: vi.fn().mockResolvedValue([]),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    await expect(processMPPWithHistory({ filePath: "D:\\bad.xml", xmlContent: "" }, store)).rejects.toThrow();
    expect(store.saveSnapshot).not.toHaveBeenCalled();
  });

  it("does not compare projects with different identities", async () => {
    const previousResult = await processMPPWithHistory(
      {
        filePath: "D:\\ProjetoB.xml",
        xmlContent: validXml.replace("Projeto A", "Projeto B"),
      },
      {
        loadSnapshots: vi.fn().mockResolvedValue([]),
        saveSnapshot: vi.fn().mockResolvedValue(undefined),
      },
    );

    const store: SnapshotStore = {
      loadSnapshots: vi.fn().mockResolvedValue([
        {
          capturedAt: "2026-03-22T10:00:00.000Z",
          sourceFileName: "ProjetoB.xml",
          projectIdentity: {
            key: "projeto b::2026-01-01t08:00:00",
            name: "Projeto B",
            anchorDate: "2026-01-01T08:00:00",
          },
          projectSummary: {
            id: "",
            name: "Projeto B",
            finishDate: "2026-01-10T17:00:00",
          },
          taskSummary: {
            totalTasks: 1,
            completedTasks: 0,
            tasksWithProgress: 1,
            tasksWithResources: 0,
            tasksWithValidDates: 1,
            tasksWithBaseline: 0,
            averagePercentComplete: 50,
          },
          diagnosticsSummary: {
            error: 0,
            warning: 0,
            info: 0,
          },
          insightsSummary: {
            status: previousResult.insights.summary.status,
            warningCount: previousResult.insights.warnings.length,
            highlightCount: previousResult.insights.highlights.length,
          },
          taskProgressData: [],
        },
      ]),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processMPPWithHistory({ filePath: "D:\\ProjetoA.xml", xmlContent: validXml }, store);

    expect(result.comparison).toBeUndefined();
    expect(result.gapVsCompensation?.status).toBe("unavailable");
  });

  it("adds gap vs compensation when there is compatible historical data", async () => {
    const store: SnapshotStore = {
      loadSnapshots: vi.fn().mockResolvedValue([
        {
          capturedAt: "2026-03-22T10:00:00.000Z",
          sourceFileName: "ProjetoA.xml",
          projectIdentity: {
            key: "projeto a::2026-01-01T08:00:00",
            name: "Projeto A",
            anchorDate: "2026-01-01T08:00:00",
          },
          projectSummary: {
            id: "",
            name: "Projeto A",
            finishDate: "2026-01-10T17:00:00",
          },
          taskSummary: {
            totalTasks: 1,
            completedTasks: 0,
            tasksWithProgress: 1,
            tasksWithResources: 0,
            tasksWithValidDates: 1,
            tasksWithBaseline: 0,
            averagePercentComplete: 80,
          },
          diagnosticsSummary: {
            error: 0,
            warning: 0,
            info: 0,
          },
          insightsSummary: {
            status: "consistente",
            warningCount: 0,
            highlightCount: 0,
          },
          taskProgressData: [],
        },
      ]),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processMPPWithHistory(
      { filePath: "D:\\ProjetoA.xml", xmlContent: validXml },
      store,
    );

    expect(result.comparison).toBeDefined();
    expect(result.gapVsCompensation).toMatchObject({
      gapPercent: 30,
      status: "recoverable",
    });
  });
});
