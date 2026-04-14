import { afterEach, describe, expect, it, vi } from "vitest";

import { processMPP, type ProcessInput, type ProcessResult } from "./process-mpp";
import { processProjectFile } from "./process-project-file";

const FIXED_GENERATED_AT = "2026-04-10T12:00:00.000Z";

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

const validXer = [
  "ERMHDR\t15.0",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tproj_name",
  "%R\tP1\tP1\tProjeto Equivalente",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num\tproj_node_flag",
  "%R\tW1\tP1\t\t1\tDisciplina\t10\tY",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstart_date\tend_date\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tstatus_code\ttask_type\tduration_type\ttarget_drtn_hr_cnt",
  "%R\tT2\tP1\tW1\t1.1\tAtividade\t2026-01-01\t2026-01-03\t2026-01-01\t2026-01-03\t\t\t50\tTK_Active\tTT_Task\tDT_FixedDUR2\t16",
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

function freezeProcessingTime(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_GENERATED_AT));
}

function processWithoutHistory(input: ProcessInput): Promise<ProcessResult> {
  return Promise.resolve(processMPP(input));
}

describe("processProjectFile integration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes converted mpp, direct xml, and direct xer through the official intake", async () => {
    freezeProcessingTime();

    const mppResult = await processProjectFile(
      {
        filePath: "D:\\Projeto.mpp",
      },
      async () => validXml,
      async () => ({ extension: ".mpp", mimeType: "application/vnd.ms-project", sizeBytes: 1024 }),
      async () => validXml,
      { logEvent: async () => undefined },
      processWithoutHistory,
    );

    const xmlResult = await processProjectFile(
      {
        filePath: "D:\\Projeto.xml",
      },
      async () => validXml,
      async () => ({ extension: ".xml", mimeType: "application/xml", sizeBytes: 1024 }),
      async () => validXml,
      { logEvent: async () => undefined },
      processWithoutHistory,
    );

    const xerResult = await processProjectFile(
      {
        filePath: "D:\\Projeto.xer",
      },
      async () => validXml,
      async () => ({ extension: ".xer", mimeType: "application/x-primavera-xer", sizeBytes: 1024 }),
      async () => validXer,
      { logEvent: async () => undefined, readBinaryProjectFile: async () => new TextEncoder().encode(validXer) },
      processWithoutHistory,
    );

    expect(mppResult.model.name).toBe("Projeto Equivalente");
    expect(mppResult.model.tasks).toHaveLength(2);
    expect(mppResult.insights.summary.status).toBeDefined();
    expect(xmlResult.model.name).toBe("Projeto Equivalente");
    expect(xmlResult.model.tasks).toHaveLength(2);
    expect(xerResult.model.name).toBe("Projeto Equivalente");
    expect(xerResult.model.tasks.some((task) => task.id === "T2")).toBe(true);
    expect(xerResult.insights.summary.status).toBeDefined();
    expect(mppResult).toEqual(xmlResult);
  });
});
