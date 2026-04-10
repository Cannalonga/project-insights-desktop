import { describe, expect, it } from "vitest";

import { detectInputFormat } from "./detect-input-format";

const validMSPDIXml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>Projeto de teste</Name>
  <Tasks>
    <Task>
      <UID>1</UID>
      <Name>Tarefa de teste</Name>
    </Task>
  </Tasks>
</Project>`;

describe("detectInputFormat", () => {
  it("detects MPP files by extension", () => {
    expect(detectInputFormat({ filePath: "obra.MPP" })).toBe("mpp");
  });

  it("detects MSPDI XML files by structure", () => {
    expect(detectInputFormat({ filePath: "cronograma.xml", xmlContent: validMSPDIXml })).toBe("mspdi-xml");
  });

  it("detects MSPDI XML files from bytes", () => {
    const bytes = new TextEncoder().encode(validMSPDIXml);

    expect(detectInputFormat({ filePath: "cronograma.xml", bytes })).toBe("mspdi-xml");
  });

  it("returns unknown for unsupported or invalid inputs", () => {
    expect(detectInputFormat({ filePath: "cronograma.txt", xmlContent: "<NotProject />" })).toBe("unknown");
  });
});
