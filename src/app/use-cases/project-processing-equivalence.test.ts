import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeProject } from "../../core/analysis/analyze-project";
import { processProjectInput } from "../../ingestion/shared/process-project-input";
import { buildProcessExports } from "./build-process-exports";
import { processMPP, type ProcessResult } from "./process-mpp";

const FIXED_GENERATED_AT = "2026-04-10T12:00:00.000Z";

const validXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Projeto Equivalente</Name>
    <StatusDate>2026-01-10T00:00:00</StatusDate>
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
        <PercentComplete>80</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.2</OutlineNumber>
        <OutlineParentUID>1</OutlineParentUID>
      </Task>
    </Tasks>
  </Project>
`;

function freezeProcessingTime(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_GENERATED_AT));
}

function comparableResult(result: ProcessResult): ProcessResult {
  return result;
}

async function buildResultFromNewPipeline(): Promise<ProcessResult> {
  const projectInput = await processProjectInput({
    filePath: "D:\\ProjetoEquivalente.xml",
    xmlContent: validXml,
  });

  if (!projectInput.ok) {
    throw new Error(`Expected valid MSPDI input, got ${projectInput.error.code}`);
  }

  const analysis = analyzeProject(projectInput.project, FIXED_GENERATED_AT);
  const exports = buildProcessExports({
    generatedAt: FIXED_GENERATED_AT,
    model: projectInput.project,
    analysis,
  });

  return {
    analysisMode: "single",
    generatedAt: FIXED_GENERATED_AT,
    model: projectInput.project,
    ...analysis,
    ...exports,
  };
}

describe("project processing equivalence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the public processMPP wrapper equivalent to the new ingestion and analysis pipeline", async () => {
    freezeProcessingTime();

    const publicResult = processMPP({
      filePath: "D:\\ProjetoEquivalente.xml",
      xmlContent: validXml,
    });
    const composedResult = await buildResultFromNewPipeline();

    expect(comparableResult(publicResult)).toEqual(comparableResult(composedResult));
  });
});
