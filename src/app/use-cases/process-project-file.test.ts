import { beforeEach, describe, expect, it, vi } from "vitest";

import { processMPPWithHistory } from "./process-mpp-with-history";
import { MPPConversionError } from "./convert-mpp-to-xml";
import { processProjectFile } from "./process-project-file";
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

  it("rejects direct xml input explicitly", async () => {
    await expect(
      processProjectFile({
        filePath: "D:\\Projeto.xml",
        xmlContent: validXml,
      }),
    ).rejects.toThrow("A entrada do CannaConverter 2.0 aceita apenas arquivos .mpp.");

    expect(mockedProcessMPPWithHistory).not.toHaveBeenCalled();
  });

  it("converts mpp to xml before calling the MSPDI pipeline", async () => {
    mockedProcessMPPWithHistory.mockResolvedValueOnce({ marker: "mpp" } as never);
    const convertMppToXml = vi.fn().mockResolvedValue(validXml);
    const validateFile = vi.fn().mockResolvedValue(undefined);

    const result = await processProjectFile(
      {
        filePath: "D:\\Projeto.mpp",
      },
      convertMppToXml,
      validateFile,
    );

    expect(result).toEqual({ marker: "mpp" });
    expect(validateFile).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(convertMppToXml).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith({
      filePath: "D:\\Projeto.mpp",
      xmlContent: validXml,
    });
  });

  it("fails explicitly when mpp conversion is not possible", async () => {
    const convertMppToXml = vi
      .fn()
      .mockRejectedValue(new MPPConversionError("Nao foi possivel processar o arquivo .mpp."));
    const validateFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.mpp",
        },
        convertMppToXml,
        validateFile,
      ),
    ).rejects.toBeInstanceOf(MPPConversionError);

    expect(mockedProcessMPPWithHistory).not.toHaveBeenCalled();
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
