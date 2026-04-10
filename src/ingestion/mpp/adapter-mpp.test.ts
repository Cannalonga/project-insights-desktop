import { describe, expect, it, vi } from "vitest";

import { adaptMPPToProject } from "./adapter-mpp";

const validMSPDIXml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>Projeto convertido</Name>
  <Tasks>
    <Task>
      <UID>1</UID>
      <Name>Tarefa convertida</Name>
      <PercentComplete>75</PercentComplete>
    </Task>
  </Tasks>
</Project>`;

class TestConversionError extends Error {
  code = "MPP_CONVERSION_FAILED";
}

describe("adaptMPPToProject", () => {
  it("converts MPP to MSPDI XML and delegates to the MSPDI adapter", async () => {
    const convertToMSPDIXml = vi.fn().mockResolvedValue(validMSPDIXml);

    const result = await adaptMPPToProject({
      filePath: "D:\\Projeto.mpp",
      convertToMSPDIXml,
    });

    expect(convertToMSPDIXml).toHaveBeenCalledWith("D:\\Projeto.mpp");
    expect(result).toMatchObject({
      ok: true,
      project: {
        name: "Projeto convertido",
        tasks: [
          {
            id: "1",
            name: "Tarefa convertida",
            percentComplete: 75,
          },
        ],
      },
    });
  });

  it("returns a compatible error when conversion fails", async () => {
    const convertToMSPDIXml = vi.fn().mockRejectedValue(new TestConversionError("Falha na conversao MPP"));

    const result = await adaptMPPToProject({
      filePath: "D:\\Projeto.mpp",
      convertToMSPDIXml,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "mpp",
        code: "MPP_CONVERSION_FAILED",
        message: "Falha na conversao MPP",
      },
    });
  });

  it("returns a compatible error when converted MSPDI XML is invalid", async () => {
    const convertToMSPDIXml = vi.fn().mockResolvedValue("<Project />");

    const result = await adaptMPPToProject({
      filePath: "D:\\Projeto.mpp",
      convertToMSPDIXml,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "mpp",
        code: "INVALID_MSPDI",
        message: "Invalid MSPDI XML: missing Tasks section",
      },
    });
  });
});
