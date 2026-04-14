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

const validXer = [
  "ERMHDR\t15.0",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tproj_name",
  "%R\tP1\tP1\tProjeto Primavera",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num\tproj_node_flag",
  "%R\tW1\tP1\t\t1\tRaiz\t10\tY",
  "%R\tW2\tP1\tW1\t1.1\tDisciplina\t20\tN",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstart_date\tend_date\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tstatus_code\ttask_type\tduration_type\ttarget_drtn_hr_cnt",
  "%R\tT1\tP1\tW2\tA100\tAtividade Primavera\t2026-01-01\t2026-01-03\t2026-01-01\t2026-01-03\t\t\t40\tTK_Active\tTT_Task\tDT_FixedDUR2\t24",
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

  it("routes XER inputs to the Primavera adapter flow", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.xer",
      xerContent: validXer,
    });

    expect(result).toMatchObject({
      ok: true,
      project: {
        id: "P1",
        name: "Projeto Primavera",
        tasks: [
          expect.objectContaining({ id: "xer-wbs:W1", isSummary: true }),
          expect.objectContaining({ id: "xer-wbs:W2", isSummary: true }),
          expect.objectContaining({ id: "T1", name: "Atividade Primavera", isSummary: false }),
        ],
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

  it("returns a compatible error when XER content is unavailable", async () => {
    const result = await processProjectInput({
      filePath: "D:\\Projeto.xer",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        sourceFormat: "xer",
        code: "XER_CONTENT_UNAVAILABLE",
        message: "Primavera XER content is required.",
      },
    });
  });
});
