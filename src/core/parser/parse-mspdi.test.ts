import { describe, expect, it } from "vitest";

import { MSPDIParseError } from "./mspdi-parse-error";
import { parseMSPDI } from "./parse-mspdi";

function expectParseError(xmlContent: string, code: MSPDIParseError["code"]): void {
  try {
    parseMSPDI(xmlContent);
    throw new Error("Expected parseMSPDI to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(MSPDIParseError);
    expect((error as MSPDIParseError).code).toBe(code);
  }
}

describe("parseMSPDI", () => {
  it("throws EMPTY_FILE for empty content", () => {
    expectParseError("", "EMPTY_FILE");
  });

  it("throws INVALID_XML for malformed XML", () => {
    expectParseError("<Project><Tasks>", "INVALID_XML");
  });

  it("throws UNSAFE_XML when DTD markup is present", () => {
    expectParseError(`<!DOCTYPE Project [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><Project></Project>`, "UNSAFE_XML");
  });

  it("throws INVALID_MSPDI when Project root is missing", () => {
    expectParseError("<Root></Root>", "INVALID_MSPDI");
  });

  it("throws INVALID_MSPDI when Tasks section is missing", () => {
    expectParseError("<Project></Project>", "INVALID_MSPDI");
  });

  it("throws NO_TASKS_FOUND when Tasks has no Task nodes", () => {
    expectParseError("<Project><Tasks></Tasks></Project>", "NO_TASKS_FOUND");
  });

  it("throws INVALID_MSPDI when Task nodes are structurally useless", () => {
    expectParseError("<Project><Tasks><Task></Task></Tasks></Project>", "INVALID_MSPDI");
  });

  it("returns a valid raw project for minimal MSPDI XML", () => {
    const result = parseMSPDI(`
      <Project xmlns="http://schemas.microsoft.com/project">
        <Name>Projeto Minimo</Name>
        <Tasks>
          <Task>
            <UID>1</UID>
            <Name>Tarefa 1</Name>
            <Start>2026-01-01T08:00:00</Start>
            <Finish>2026-01-01T17:00:00</Finish>
            <Duration>PT8H0M0S</Duration>
            <Summary>0</Summary>
            <OutlineLevel>1</OutlineLevel>
          </Task>
        </Tasks>
      </Project>
    `);
    const tasks = result.tasks ?? [];
    const resources = result.resources ?? [];
    const dependencies = result.dependencies ?? [];

    expect(result.name).toBe("Projeto Minimo");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "1",
      name: "Tarefa 1",
      duration: 8,
      outlineLevel: 1,
      summary: false,
      resourceIds: [],
    });
    expect(resources).toEqual([]);
    expect(dependencies).toEqual([]);
  });

  it("maps real progress fields when they exist in MSPDI", () => {
    const result = parseMSPDI(`
      <Project xmlns="http://schemas.microsoft.com/project">
        <Name>Projeto Progresso</Name>
        <Tasks>
          <Task>
            <UID>1</UID>
            <Name>Tarefa 1</Name>
            <Start>2026-01-01T08:00:00</Start>
            <Finish>2026-01-10T17:00:00</Finish>
            <ActualStart>2026-01-02T08:00:00</ActualStart>
            <ActualFinish>2026-01-11T17:00:00</ActualFinish>
            <BaselineStart>2026-01-01T08:00:00</BaselineStart>
            <BaselineFinish>2026-01-09T17:00:00</BaselineFinish>
            <Duration>PT8H0M0S</Duration>
            <ActualDuration>PT4H0M0S</ActualDuration>
            <BaselineDuration>PT8H0M0S</BaselineDuration>
            <ActualWork>PT16H0M0S</ActualWork>
            <RemainingWork>PT8H0M0S</RemainingWork>
            <PercentComplete>50</PercentComplete>
            <PhysicalPercentComplete>40</PhysicalPercentComplete>
            <Resume>2026-01-06T08:00:00</Resume>
            <Stop>2026-01-05T17:00:00</Stop>
            <Summary>0</Summary>
            <OutlineLevel>1</OutlineLevel>
          </Task>
        </Tasks>
      </Project>
    `);

    expect(result.tasks?.[0]).toMatchObject({
      percentComplete: 50,
      physicalPercentComplete: 40,
      actualStartDate: "2026-01-02T08:00:00",
      actualEndDate: "2026-01-11T17:00:00",
      actualDurationHours: 4,
      actualWorkHours: 16,
      remainingWorkHours: 8,
      baselineStartDate: "2026-01-01T08:00:00",
      baselineEndDate: "2026-01-09T17:00:00",
      baselineDurationHours: 8,
      resumeDate: "2026-01-06T08:00:00",
      stopDate: "2026-01-05T17:00:00",
    });
  });

  it("maps nested baseline blocks from real MSPDI structure", () => {
    const result = parseMSPDI(`
      <Project xmlns="http://schemas.microsoft.com/project">
        <Name>Projeto Baseline</Name>
        <StatusDate>2026-01-20T00:00:00</StatusDate>
        <Tasks>
          <Task>
            <UID>1</UID>
            <Name>Tarefa com Baseline</Name>
            <Start>2026-01-10T08:00:00</Start>
            <Finish>2026-01-20T17:00:00</Finish>
            <ActualStart>2026-01-12T08:00:00</ActualStart>
            <Duration>PT80H0M0S</Duration>
            <Summary>0</Summary>
            <OutlineLevel>1</OutlineLevel>
            <Baseline>
              <Number>0</Number>
              <Start>2026-01-01T08:00:00</Start>
              <Finish>2026-01-09T17:00:00</Finish>
              <Duration>PT64H0M0S</Duration>
            </Baseline>
          </Task>
        </Tasks>
      </Project>
    `);

    expect(result.statusDate).toBe("2026-01-20T00:00:00");
    expect(result.tasks?.[0]).toMatchObject({
      baselineStartDate: "2026-01-01T08:00:00",
      baselineEndDate: "2026-01-09T17:00:00",
      baselineDurationHours: 64,
    });
  });

  it("throws XML_TOO_LARGE when the XML exceeds the safe size limit", () => {
    const oversizedPayload = "a".repeat(26 * 1024 * 1024);
    expectParseError(`<Project><Tasks><Task><UID>1</UID><Name>${oversizedPayload}</Name></Task></Tasks></Project>`, "XML_TOO_LARGE");
  });
});
