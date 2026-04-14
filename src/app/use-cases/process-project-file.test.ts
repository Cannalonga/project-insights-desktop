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

const validXer = [
  "ERMHDR\t15.0",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tproj_name",
  "%R\tP1\tP1\tProjeto XER",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num\tproj_node_flag",
  "%R\tW1\tP1\t\t1\tRaiz\t10\tY",
  "%R\tW2\tP1\tW1\t1.1\tFrente\t20\tN",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstart_date\tend_date\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tstatus_code\ttask_type\tduration_type\ttarget_drtn_hr_cnt",
  "%R\tT1\tP1\tW2\tA100\tAtividade XER\t2026-01-01\t2026-01-03\t2026-01-01\t2026-01-03\t\t\t15\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t24",
  "%T\tTASKPRED",
  "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
  "%T\tTASKRSRC",
  "%F\ttaskrsrc_id\tproj_id\ttask_id\trsrc_id",
  "%T\tRSRC",
  "%F\trsrc_id\tproj_id\trsrc_name\trsrc_type",
  "%T\tCALENDAR",
  "%F\tclndr_id\tclndr_name",
  "%R\tC1\tStandard",
].join("\n");

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
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "D:\\Projeto.xml",
      model: expect.objectContaining({
        name: "Projeto A",
      }),
      xmlContent: validXml,
    }));
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      "validating_input",
      "reading_xml",
      "generating_analysis",
      "completed",
    ]);
    expect(logEvent).toHaveBeenCalled();
  });

  it("processes xer input directly through the Primavera adapter flow", async () => {
    mockedProcessMPPWithHistory.mockResolvedValueOnce({ marker: "xer" } as never);
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".xer",
      mimeType: "application/x-primavera-xer",
      sizeBytes: 4096,
    });
    const readProjectFile = vi.fn();
    const readBinaryProjectFile = vi.fn().mockResolvedValue(new TextEncoder().encode(validXer));
    const onStage = vi.fn();
    const logEvent = vi.fn<(_: ProcessingLogPayload) => Promise<void>>().mockResolvedValue(undefined);

    const result = await processProjectFile(
      {
        filePath: "D:\\Projeto.xer",
      },
      vi.fn(),
      validateFile,
      readProjectFile,
      { onStage, logEvent, readBinaryProjectFile },
    );

    expect(result).toEqual({ marker: "xer" });
    expect(validateFile).toHaveBeenCalledWith("D:\\Projeto.xer");
    expect(readProjectFile).not.toHaveBeenCalled();
    expect(readBinaryProjectFile).toHaveBeenCalledWith("D:\\Projeto.xer");
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "D:\\Projeto.xer",
      model: expect.objectContaining({
        name: "Projeto XER",
      }),
    }));
    expect(onStage.mock.calls.map(([stage]) => stage)).toEqual([
      "validating_input",
      "reading_xer",
      "generating_analysis",
      "completed",
    ]);
    expect(logEvent).toHaveBeenCalled();
  });

  it("keeps XER intake working even when bytes are not strict UTF-8", async () => {
    mockedProcessMPPWithHistory.mockResolvedValueOnce({ marker: "xer-binary" } as never);
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".xer",
      mimeType: "application/x-primavera-xer",
      sizeBytes: 4096,
    });
    const readProjectFile = vi.fn();
    const baseBytes = Array.from(new TextEncoder().encode(validXer));
    const projectNameBytes = Array.from(new TextEncoder().encode("Projeto XER"));
    const projectNameStart = baseBytes.findIndex((_, index) =>
      projectNameBytes.every((byte, offset) => baseBytes[index + offset] === byte),
    );

    if (projectNameStart === -1) {
      throw new Error("Unable to locate the XER project name bytes in the test fixture.");
    }

    const nonStrictUtf8Bytes = Uint8Array.from([
      ...baseBytes.slice(0, projectNameStart + 3),
      0xca,
      ...baseBytes.slice(projectNameStart + 4),
    ]);
    const readBinaryProjectFile = vi.fn().mockResolvedValue(nonStrictUtf8Bytes);

    const result = await processProjectFile(
      {
        filePath: "D:\\Projeto.xer",
      },
      vi.fn(),
      validateFile,
      readProjectFile,
      { readBinaryProjectFile },
    );

    expect(result).toEqual({ marker: "xer-binary" });
    expect(readProjectFile).not.toHaveBeenCalled();
    expect(readBinaryProjectFile).toHaveBeenCalledWith("D:\\Projeto.xer");
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "D:\\Projeto.xer",
      model: expect.objectContaining({
        id: "P1",
      }),
    }));
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
    expect(mockedProcessMPPWithHistory).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "D:\\Projeto.mpp",
      model: expect.objectContaining({
        name: "Projeto A",
      }),
      xmlContent: validXml,
    }));
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
    const exportUserLog = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("C:\\Users\\cliente\\Desktop\\CannaConverter_Logs\\cannaconverter-log-1.log");

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.mpp",
        },
        convertMppToXml,
        validateFile,
        undefined,
        { logEvent, exportUserLog },
      ),
    ).rejects.toThrow(
      "Um log técnico foi salvo em C:\\Users\\cliente\\Desktop\\CannaConverter_Logs\\cannaconverter-log-1.log.",
    );

    expect(mockedProcessMPPWithHistory).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalled();
    expect(exportUserLog).toHaveBeenCalledTimes(1);
  });

  it("keeps guided fallback when desktop log export is unavailable", async () => {
    const convertMppToXml = vi
      .fn()
      .mockRejectedValue(new MPPConversionError("Nao foi possivel processar o arquivo .mpp."));
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".mpp",
      mimeType: "application/vnd.ms-project",
      sizeBytes: 1024,
    });
    const exportUserLog = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.mpp",
        },
        convertMppToXml,
        validateFile,
        undefined,
        { exportUserLog },
      ),
    ).rejects.toThrow(
      "Não foi possível processar este arquivo diretamente. Algumas versões do MS Project podem gerar variações no formato. Se possível, gere uma nova exportação do cronograma e processe novamente.",
    );

    expect(exportUserLog).toHaveBeenCalledTimes(1);
  });

  it("exports a desktop log and preserves the underlying message when XER analysis fails", async () => {
    const validateFile = vi.fn().mockResolvedValue({
      extension: ".xer",
      mimeType: "application/x-primavera-xer",
      sizeBytes: 4096,
    });
    const readProjectFile = vi.fn();
    const readBinaryProjectFile = vi.fn().mockResolvedValue(new TextEncoder().encode(validXer));
    const logEvent = vi.fn<(_: ProcessingLogPayload) => Promise<void>>().mockResolvedValue(undefined);
    const exportUserLog = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("C:\\Users\\cliente\\Desktop\\CannaConverter_Logs\\project-insights-app-log-1.log");
    const processor = vi.fn().mockRejectedValue(new Error("Falha ao consolidar o cronograma Primavera."));

    await expect(
      processProjectFile(
        {
          filePath: "D:\\Projeto.xer",
        },
        vi.fn(),
        validateFile,
        readProjectFile,
        { logEvent, exportUserLog, readBinaryProjectFile },
        processor,
      ),
    ).rejects.toThrow(
      "Falha ao consolidar o cronograma Primavera. Um log técnico foi salvo em C:\\Users\\cliente\\Desktop\\CannaConverter_Logs\\project-insights-app-log-1.log.",
    );

    expect(readProjectFile).not.toHaveBeenCalled();
    expect(readBinaryProjectFile).toHaveBeenCalledWith("D:\\Projeto.xer");
    expect(exportUserLog).toHaveBeenCalledTimes(1);
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
