import { describe, expect, it } from "vitest";

import { processProjectFile } from "./process-project-file";

const validXml = `
  <Project xmlns="http://schemas.microsoft.com/project">
    <Name>Projeto Equivalente</Name>
    <Tasks>
      <Task>
        <UID>1</UID>
        <Name>Disciplina</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-05T17:00:00</Finish>
        <Duration>PT40H0M0S</Duration>
        <Summary>1</Summary>
        <OutlineLevel>1</OutlineLevel>
        <OutlineNumber>1</OutlineNumber>
      </Task>
      <Task>
        <UID>2</UID>
        <Name>Atividade</Name>
        <Start>2026-01-01T08:00:00</Start>
        <Finish>2026-01-03T17:00:00</Finish>
        <Duration>PT16H0M0S</Duration>
        <PercentComplete>50</PercentComplete>
        <Summary>0</Summary>
        <OutlineLevel>2</OutlineLevel>
        <OutlineNumber>1.1</OutlineNumber>
      </Task>
    </Tasks>
  </Project>
`;

describe("processProjectFile integration", () => {
  it("processes converted mpp and also supports direct xml fallback", async () => {
    const mppResult = await processProjectFile(
      {
        filePath: "D:\\Projeto.mpp",
      },
      async () => validXml,
      async () => ({ extension: ".mpp", mimeType: "application/vnd.ms-project", sizeBytes: 1024 }),
    );

    const xmlResult = await processProjectFile(
      {
        filePath: "D:\\Projeto.xml",
      },
      async () => validXml,
      async () => ({ extension: ".xml", mimeType: "application/xml", sizeBytes: 1024 }),
      async () => validXml,
    );

    expect(mppResult.model.name).toBe("Projeto Equivalente");
    expect(mppResult.model.tasks).toHaveLength(2);
    expect(mppResult.insights.summary.status).toBeDefined();
    expect(xmlResult.model.name).toBe("Projeto Equivalente");
    expect(xmlResult.model.tasks).toHaveLength(2);
  });
});
