import { describe, expect, it } from "vitest";

import { MPPInputFatalError, processMPP } from "./process-mpp";

const validXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Projeto Compensacao</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Disciplina Civil</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-20T17:00:00</Finish>
        <Duration>PT80H0M0S</Duration>
        <Summary>1</Summary>
        <OutlineLevel>1</OutlineLevel>
        <OutlineNumber>1</OutlineNumber>
      </Task>
      <Task>
        <UID>2</UID>
        <Name>Escavacao</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-05T17:00:00</Finish>
        <Duration>PT16H0M0S</Duration>
        <PercentComplete>25</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.1</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
      <Task>
        <UID>3</UID>
        <Name>Concretagem</Name>
        <Start>2026-01-06T08:00:00</Start>
        <Finish>2026-01-20T17:00:00</Finish>
        <Duration>PT64H0M0S</Duration>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.2</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
    </Tasks>
  </Project>
`;

describe("processMPP", () => {
  it("includes operational compensation analysis in the pipeline result", () => {
    const result = processMPP({
      filePath: "D:\\ProjetoCompensacao.xml",
      xmlContent: validXml,
    });

    expect(result.compensationAnalysis.topTasks).toHaveLength(2);
    expect(result.compensationAnalysis.topTasks[0]).toMatchObject({
      taskId: "3",
      name: "Concretagem",
      disciplineName: "Disciplina Civil",
    });
    expect(result.sCurve?.timelineGranularity).toBe("weekly");
    expect(result.sCurve?.points.length).toBeGreaterThan(0);
    expect(result.inputQuality?.level).toBe("non-fatal");
    expect(result.inputQuality?.issues.some((issue) => issue.id === "baseline-missing")).toBe(true);
  });

  it("fails explicitly when the converted cronograma has no usable temporal basis", () => {
    const invalidTemporalXml = `
      <Project xmlns="http://schemas.microsoft.com/project">
        <Name>Projeto sem base temporal</Name>
        <Tasks>
          <Task>
            <UID>1</UID>
            <Name>Atividade sem datas</Name>
            <Duration>PT16H0M0S</Duration>
            <Summary>0</Summary>
            <OutlineLevel>1</OutlineLevel>
            <OutlineNumber>1</OutlineNumber>
          </Task>
        </Tasks>
      </Project>
    `;

    expect(() =>
      processMPP({
        filePath: "D:\\ProjetoInvalido.mpp",
        xmlContent: invalidTemporalXml,
      }),
    ).toThrow(MPPInputFatalError);
  });
});
