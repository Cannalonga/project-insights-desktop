import { describe, expect, it } from "vitest";

import { prepareTextExportContent } from "./prepare-text-export";

describe("prepareTextExportContent", () => {
  it("adds UTF-8 BOM to CSV exports for Excel compatibility", () => {
    const content = 'nome,disciplina\n"Escavação","Mecânica"';

    expect(prepareTextExportContent(content, "csv")).toBe(`\uFEFF${content}`);
    expect(prepareTextExportContent(content, "fact_tasks.csv")).toBe(`\uFEFF${content}`);
  });

  it("does not alter non-CSV exports", () => {
    const json = '{"nome":"Escavação"}';
    const xml = "<name>Escavação</name>";

    expect(prepareTextExportContent(json, "json")).toBe(json);
    expect(prepareTextExportContent(xml, "structured.xml")).toBe(xml);
  });

  it("does not duplicate BOM when content already has one", () => {
    const content = '\uFEFFnome\n"validação"';

    expect(prepareTextExportContent(content, "csv")).toBe(content);
  });
});
