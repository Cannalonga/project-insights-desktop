import { describe, expect, it } from "vitest";

import { mapRawProjectToModel } from "../../core/mapper/map-project";
import { parseMSPDI } from "../../core/parser/parse-mspdi";
import { adaptMSPDIToProject } from "./adapter-mspdi";

const validMSPDIXml = `<?xml version="1.0" encoding="UTF-8"?>
<Project>
  <Name>Projeto MSPDI</Name>
  <StatusDate>2026-04-10T00:00:00</StatusDate>
  <Tasks>
    <Task>
      <UID>1</UID>
      <Name>Planejamento</Name>
      <Start>2026-04-01T08:00:00</Start>
      <Finish>2026-04-05T17:00:00</Finish>
      <PercentComplete>50</PercentComplete>
    </Task>
  </Tasks>
</Project>`;

describe("adaptMSPDIToProject", () => {
  it("maps valid MSPDI XML to the canonical Project model", () => {
    const result = adaptMSPDIToProject(validMSPDIXml);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected MSPDI adapter to return a Project.");
    }

    expect(result.project).toMatchObject({
      name: "Projeto MSPDI",
      statusDate: "2026-04-10T00:00:00",
      tasks: [
        {
          id: "1",
          name: "Planejamento",
          percentComplete: 50,
        },
      ],
    });
  });

  it("keeps adapter output equivalent to the current parser and mapper path", () => {
    const result = adaptMSPDIToProject(validMSPDIXml);
    const currentProject = mapRawProjectToModel(parseMSPDI(validMSPDIXml));

    expect(result).toEqual({
      ok: true,
      project: currentProject,
    });
  });

  it("returns a compatible error for invalid MSPDI XML", () => {
    const result = adaptMSPDIToProject("<Project />");

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "mspdi-xml",
        code: "INVALID_MSPDI",
        message: "Invalid MSPDI XML: missing Tasks section",
      },
    });
  });
});
