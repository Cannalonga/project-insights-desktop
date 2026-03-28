import { beforeEach, describe, expect, it, vi } from "vitest";

import { processMPPWithHistory } from "./process-mpp-with-history";
import { MPPConversionError } from "./convert-mpp-to-xml";
import type { ProcessingLogPayload } from "./processing-log";
import { ProjectFileGuidanceError, processProjectFile } from "./process-project-file";
import { InputFileValidationError } from "./validate-input-file";

vi.mock("./process-mpp-with-history", () => ({
  processMPPWithHistory: vi.fn(),
}));

const mockedProcessMPPWithHistory = vi.mocked(processMPPWithHistory);

const validXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Projeto A</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Tarefa 1</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-10T17:00:00</Finish>
        <Duration>PT8H0M0S</Duration>
        <Summary>0</Summary>
        <OutlineLevel>1</OutlineLevel>
        <OutlineNumber>1</OutlineNumber>
      </Task>
    </Tasks>
  </Project>
`;

describe("processProjectFile", () => {
  beforeEach(() => {
    mockedProcessMPPWithHistory.mockReset();
  });

  it("processes xml input directly when MSPDI is provided as the safe path", async () => {
    mockedProcessMPPWithHistory.mockResolvedValueOnce({ marker: "xml" } as never);
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".xml",
      mimeType: "application/xml",
      sizeBytes: 2048,
    });
    const readXmlFile = vi.fn().mockResolvedValue(validXml);
    const onStage = vi.fn();
    const logEvent = vi.fn<(_: ProcessingLogPayload) => Promise<void>>().mockResolvedValue(undefined);

    const result = await processProjectFile(
      {
        filePath: "D:\\Projeto.xml",
      },
      vi.fn(),
      validateFile,
      readXmlFile,
      { onStage, logEvent },
    );

    expect(result).toEqual({ marker: "xml" });
    expect(validateFile).toHaveBeenCalledWith("D:\\Projeto.xml");
    expect(readXmlFile).toHaveBeenCalledWith("D:\\Projeto.xml");
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith({
      filePath: "D:\\Projeto.xml",
      xmlContent: validXml,
    });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      "validating_input",
      "reading_xml",
      "generating_analysis",
      "completed",
    ]);
    expect(logEvent).toHaveBeenCalled();
  });

  it("converts mpp to xml before calling the MSPDI pipeline", async () => {
    mockedProcessMPPWithHistory.mockResolvedValueOnce({ marker: "mpp" } as never);
    const convertMppToXml = vi.fn().mockResolvedValue(validXml);
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".mpp",
      mimeType: "application/vnd.ms-project",
      sizeBytes: 1024,
    });
    const onStage = vi.fn();
    const logEvent = vi.fn<(_: ProcessingLogPayload) => Promise<void>>().mockResolvedValue(undefined);

    const result = await processProjectFile(
      {
        filePath: "D:\\Projeto.mpp",
      },
      convertMppToXml,
      validateFile,
      undefined,
      { onStage, logEvent },
    );

    expect(result).toEqual({ marker: "mpp" });
    expect(validateFile).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(convertMppToXml).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith({
      filePath: "D:\\Projeto.mpp",
      xmlContent: validXml,
    });
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      "validating_input",
      "converting_mpp",
      "generating_analysis",
      "completed",
    ]);
    expect(logEvent).toHaveBeenCalled();
  });

  it("returns guided fallback when mpp conversion is not possible", async () => {
    const convertMppToXml = vi
      .fn()
      .mockRejectedValue(new MPPConversionError("Nao foi possivel processar o arquivo .mpp."));
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".mpp",
      mimeType: "application/vnd.ms-project",
      sizeBytes: 1024,
    });
    const logEvent = vi.fn<(_: ProcessingLogPayload) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.mpp",
        },
        convertMppToXml,
        validateFile,
        undefined,
        { logEvent },
      ),
    ).rejects.toBeInstanceOf(ProjectFileGuidanceError);

    expect(mockedProcessMPPWithHistory).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalled();
  });

  it("fails explicitly when the selected file is unsafe before conversion starts", async () => {
    const validateFile = vi
      .fn()
      .mockRejectedValue(new InputFileValidationError("O arquivo selecionado esta vazio ou corrompido."));
    const convertMppToXml = vi.fn();

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.mpp",
        },
        convertMppToXml,
        validateFile,
      ),
    ).rejects.toThrow("O arquivo selecionado esta vazio ou corrompido.");

    expect(convertMppToXml).not.toHaveBeenCalled();
    expect(mockedProcessMPPWithHistory).not.toHaveBeenCalled();
  });
});
