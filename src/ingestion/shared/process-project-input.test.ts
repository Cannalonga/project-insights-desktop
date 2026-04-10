import { describe, expect, it, vi } from "vitest";

import { processProjectInput } from "./process-project-input";

const validMSPDIXml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>Projeto de entrada</Name>
  <Tasks>
    <Task>
      <UID>1</UID>
      <Name>Tarefa de entrada</Name>
      <PercentComplete>40</PercentComplete>
    </Task>
  </Tasks>
</Project>`;

describe("processProjectInput", () => {
  it("routes MPP inputs to the MPP adapter", async () => {
    const convertMPPToMSPDIXml = vi.fn().mockResolvedValue(validMSPDIXml);

    const result = await processProjectInput({
      filePath: "D:\\Projeto.mpp",
      convertMPPToMSPDIXml,
    });

    expect(convertMPPToMSPDIXml).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(result).toMatchObject({
      ok: true,
      project: {
        name: "Projeto de entrada",
        tasks: [
          {
            id: "1",
            name: "Tarefa de entrada",
            percentComplete: 40,
          },
        ],
      },
    });
  });

  it("routes MSPDI XML inputs to the MSPDI adapter", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.xml",
      xmlContent: validMSPDIXml,
    });

    expect(result).toMatchObject({
      ok: true,
      project: {
        name: "Projeto de entrada",
        tasks: [
          {
            id: "1",
            name: "Tarefa de entrada",
          },
        ],
      },
    });
  });

  it("routes MSPDI XML bytes to the MSPDI adapter", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.xml",
      bytes: new TextEncoder().encode(validMSPDIXml),
    });

    expect(result).toMatchObject({
      ok: true,
      project: {
        name: "Projeto de entrada",
      },
    });
  });

  it("returns a compatible error for unknown inputs", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.txt",
      xmlContent: "<NotProject />",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "unknown",
        code: "UNSUPPORTED_PROJECT_INPUT",
        message: "Unsupported project input format.",
      },
    });
  });

  it("returns a compatible error when MPP conversion is unavailable", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.mpp",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "mpp",
        code: "MPP_CONVERTER_UNAVAILABLE",
        message: "MPP conversion function is required.",
      },
    });
  });
});
