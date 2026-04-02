import { describe, expect, it } from "vitest";

import { processMPP } from "../use-cases/process-mpp";
import { compareProjectVersions } from "./compare-project-versions";

const baseXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Klabin Base</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Projeto</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-20T17:00:00</Finish>
        <Duration>PT160H0M0S</Duration>
        <Summary>1</Summary>
        <OutlineLevel>1</OutlineLevel>
        <OutlineNumber>1</OutlineNumber>
      </Task>
      <Task>
        <UID>2</UID>
        <Name>Recebimento site Cranfos</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-05T17:00:00</Finish>
        <Duration>PT40H0M0S</Duration>
        <PercentComplete>10</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.1</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
      <Task>
        <UID>3</UID>
        <Name>Montagem</Name>
        <Start>2026-01-06T08:00:00</Start>
        <Finish>2026-01-10T17:00:00</Finish>
        <Duration>PT40H0M0S</Duration>
        <PercentComplete>0</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.2</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
    </Tasks>
  </Project>
`;

const currentXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Klabin Atual</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Projeto</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-20T17:00:00</Finish>
        <Duration>PT160H0M0S</Duration>
        <Summary>1</Summary>
        <OutlineLevel>1</OutlineLevel>
        <OutlineNumber>1</OutlineNumber>
      </Task>
      <Task>
        <UID>2</UID>
        <Name>Recebimento site Cranfos</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-05T17:00:00</Finish>
        <Duration>PT40H0M0S</Duration>
        <PercentComplete>65</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.1</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
      <Task>
        <UID>4</UID>
        <Name>Comissionamento</Name>
        <Start>2026-01-11T08:00:00</Start>
        <Finish>2026-01-15T17:00:00</Finish>
        <Duration>PT40H0M0S</Duration>
        <PercentComplete>15</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.3</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
    </Tasks>
  </Project>
`;

describe("compareProjectVersions", () => {
  it("matches tasks, calculates progress delta and lists new and removed tasks", () => {
    const baseResult = processMPP({
      filePath: "D:\Klabin-base.xml",
      xmlContent: baseXml,
    });
    const currentResult = processMPP({
      filePath: "D:\Klabin-atual.xml",
      xmlContent: currentXml,
    });

    const summary = compareProjectVersions(
      baseResult,
      currentResult,
      "D:\Klabin-base.xml",
      "D:\Klabin-atual.xml",
    );

    expect(summary.matching.matchedCount).toBe(1);
    expect(summary.matching.byTaskId).toBe(1);
    expect(summary.projectProgress.deltaPercent).toBeGreaterThan(0);
    expect(summary.mostAdvancedTasks[0]).toMatchObject({
      taskId: "2",
      taskIdentifier: "1.1 - Recebimento site Cranfos",
      baseProgressPercent: 10,
      currentProgressPercent: 65,
      deltaProgressPercent: 55,
    });
    expect(summary.newTasks[0]).toMatchObject({
      taskId: "4",
      taskIdentifier: "1.3 - Comissionamento",
    });
    expect(summary.removedTasks[0]).toMatchObject({
      taskId: "3",
      taskIdentifier: "1.2 - Montagem",
    });
  });
});
