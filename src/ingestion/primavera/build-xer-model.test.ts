import { describe, expect, it } from "vitest";

import { parseXer } from "./parse-xer";
import { buildXerModel, XerModelError } from "./build-xer-model";

function buildMinimalParsedXer() {
  return parseXer([
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name\tplan_start_date",
    "%R\t1749\tZ2 RR R1.03\t2014-02-01 00:00",
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_name",
    "%R\t35512\t1749\t\tFORUM EL DJAZAIR",
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\ttask_name\ttarget_drtn_hr_cnt",
    "%R\t1001\t1749\t35512\tFoundation\t240",
    "%R\t1002\t1749\t35512\tMasonry\t0",
    "%T\tTASKPRED",
    "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type",
    "%R\t1\t1002\t1001\tPR_FS",
    "%T\tTASKRSRC",
    "%F\ttaskrsrc_id\ttask_id\tproj_id\trsrc_id",
    "%R\t500\t1001\t1749\t900",
    "%T\tRSRC",
    "%F\trsrc_id\trsrc_name\trsrc_type",
    "%R\t900\tCrew\tRT_Labor",
    "%T\tCALENDAR",
    "%F\tclndr_id\tclndr_name\tday_hr_cnt",
    "%R\t644\tStandard\t8",
  ].join("\n"));
}

describe("buildXerModel", () => {
  it("builds a Primavera intermediate model from required XER tables", () => {
    const model = buildXerModel(buildMinimalParsedXer());

    expect(model.projects).toEqual([
      {
        proj_id: "1749",
        proj_short_name: "Z2 RR R1.03",
        plan_start_date: "2014-02-01 00:00",
      },
    ]);
    expect(model.wbs).toHaveLength(1);
    expect(model.tasks).toHaveLength(2);
    expect(model.relationships).toEqual([
      {
        task_pred_id: "1",
        task_id: "1002",
        pred_task_id: "1001",
        pred_type: "PR_FS",
      },
    ]);
    expect(model.taskResources).toHaveLength(1);
    expect(model.resources).toHaveLength(1);
    expect(model.calendars).toHaveLength(1);
    expect(model.sourceEncoding).toBe("unknown");
  });

  it("fails clearly when an essential table is missing", () => {
    const parsed = parseXer([
      "%T\tPROJECT",
      "%F\tproj_id",
      "%R\t1749",
    ].join("\n"));

    expect(() => buildXerModel(parsed)).toThrow(XerModelError);
    expect(() => buildXerModel(parsed)).toThrow("Missing required XER table: PROJWBS.");
  });

  it("keeps non-structural tables optional when they are absent", () => {
    const parsed = parseXer([
      "%T\tPROJECT",
      "%F\tproj_id",
      "%R\t1749",
      "%T\tPROJWBS",
      "%F\twbs_id",
      "%R\t35512",
      "%T\tTASK",
      "%F\ttask_id",
      "%R\t1001",
      "%T\tTASKPRED",
      "%F\ttask_pred_id",
    ].join("\n"));

    const model = buildXerModel(parsed);

    expect(model.taskResources).toEqual([]);
    expect(model.resources).toEqual([]);
    expect(model.calendars).toEqual([]);
  });

  it("maps records by field name instead of fixed position assumptions", () => {
    const parsed = parseXer([
      "%T\tPROJECT",
      "%F\tproj_short_name\tproj_id",
      "%R\tZ2 RR R1.03\t1749",
      "%T\tPROJWBS",
      "%F\twbs_name\twbs_id",
      "%R\tFORUM EL DJAZAIR\t35512",
      "%T\tTASK",
      "%F\ttask_name\ttask_id\twbs_id",
      "%R\tFoundation\t1001\t35512",
      "%T\tTASKPRED",
      "%F\tpred_type\tpred_task_id\ttask_id",
      "%R\tPR_FS\t1001\t1002",
      "%T\tTASKRSRC",
      "%F\trsrc_id\ttask_id",
      "%R\t900\t1001",
      "%T\tRSRC",
      "%F\trsrc_name\trsrc_id",
      "%R\tCrew\t900",
      "%T\tCALENDAR",
      "%F\tclndr_name\tclndr_id",
      "%R\tStandard\t644",
    ].join("\n"));

    const model = buildXerModel(parsed);

    expect(model.projects[0].proj_id).toBe("1749");
    expect(model.tasks[0].task_id).toBe("1001");
    expect(model.tasks[0].task_name).toBe("Foundation");
    expect(model.relationships[0].pred_task_id).toBe("1001");
    expect(model.resources[0].rsrc_id).toBe("900");
  });

  it("preserves record counts, table order, and unknown tables", () => {
    const parsed = parseXer([
      "%T\tPROJECT",
      "%F\tproj_id",
      "%R\t1749",
      "%T\tPROJWBS",
      "%F\twbs_id",
      "%R\t35512",
      "%T\tTASK",
      "%F\ttask_id",
      "%R\t1001",
      "%R\t1002",
      "%T\tTASKPRED",
      "%F\ttask_pred_id",
      "%T\tTASKRSRC",
      "%F\ttaskrsrc_id",
      "%T\tRSRC",
      "%F\trsrc_id",
      "%T\tCALENDAR",
      "%F\tclndr_id",
      "%T\tCUSTOMTABLE",
      "%F\tcustom_id\tcustom_value",
      "%R\t1\tABC",
    ].join("\n"));

    const model = buildXerModel(parsed);

    expect(model.tasks).toHaveLength(2);
    expect(model.sourceTables).toEqual([
      "PROJECT",
      "PROJWBS",
      "TASK",
      "TASKPRED",
      "TASKRSRC",
      "RSRC",
      "CALENDAR",
      "CUSTOMTABLE",
    ]);
    expect(model.unknownTables.get("CUSTOMTABLE")?.records).toEqual([["1", "ABC"]]);
  });

  it("captures optional activity code and UDF tables when present", () => {
    const parsed = parseXer([
      "%T\tPROJECT",
      "%F\tproj_id",
      "%R\t1749",
      "%T\tPROJWBS",
      "%F\twbs_id",
      "%R\t35512",
      "%T\tTASK",
      "%F\ttask_id",
      "%R\t1001",
      "%T\tTASKPRED",
      "%F\ttask_pred_id",
      "%T\tTASKRSRC",
      "%F\ttaskrsrc_id",
      "%T\tRSRC",
      "%F\trsrc_id",
      "%T\tCALENDAR",
      "%F\tclndr_id",
      "%T\tACTVCODE",
      "%F\tactv_code_id\tactv_code_name",
      "%R\t4177\tMEP CONTRACTOR",
      "%T\tTASKACTV",
      "%F\ttask_id\tactv_code_id",
      "%R\t1001\t4177",
      "%T\tUDFTYPE",
      "%F\tudf_type_id\tudf_type_label",
      "%R\t129\tDifference dates",
      "%T\tUDFVALUE",
      "%F\tudf_type_id\tfk_id\tudf_text",
      "%R\t129\t1001\tA",
    ].join("\n"));

    const model = buildXerModel(parsed);

    expect(model.activityCodes).toEqual([{ actv_code_id: "4177", actv_code_name: "MEP CONTRACTOR" }]);
    expect(model.taskActivityCodes).toEqual([{ task_id: "1001", actv_code_id: "4177" }]);
    expect(model.udfTypes).toEqual([{ udf_type_id: "129", udf_type_label: "Difference dates" }]);
    expect(model.udfValues).toEqual([{ udf_type_id: "129", fk_id: "1001", udf_text: "A" }]);
  });

  it("builds from a representative XER excerpt with optional enrichment tables", () => {
    const parsed = parseXer([
      "ERMHDR\t6.2\t2014-04-05\tProject",
      "%T\tPROJECT",
      "%F\tproj_id\tproj_short_name\tplan_start_date\tlast_recalc_date",
      "%R\t1749\tZ2 RR R1.03\t2014-02-01 00:00\t2014-02-01 00:00",
      "%T\tPROJWBS",
      "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tproj_node_flag",
      "%R\t35512\t1749\t24621\tZ2 RR R1.03\tFORUM EL DJAZAIR\tY",
      "%T\tTASK",
      "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code",
      "%R\t1001\t1749\t35512\tGEN1000\tCommencement Date\tTT_Mile\tTK_NotStart",
      "%T\tTASKPRED",
      "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
      "%T\tTASKRSRC",
      "%F\ttaskrsrc_id\ttask_id\tproj_id\trsrc_id",
      "%T\tRSRC",
      "%F\trsrc_id\trsrc_name\trsrc_type",
      "%T\tCALENDAR",
      "%F\tclndr_id\tclndr_name\tclndr_type\tday_hr_cnt",
      "%R\t644\tStandard\tCA_Project\t8",
      "%T\tACTVCODE",
      "%F\tactv_code_id\tactv_code_type_id\tactv_code_name\tshort_name",
      "%R\t4177\t1051\tMEP CONTRACTOR\tMEP",
    ].join("\n"));

    const model = buildXerModel(parsed);

    expect(model.projects[0].proj_short_name).toBe("Z2 RR R1.03");
    expect(model.wbs[0].proj_node_flag).toBe("Y");
    expect(model.tasks[0].task_type).toBe("TT_Mile");
    expect(model.calendars[0].clndr_type).toBe("CA_Project");
    expect(model.activityCodes[0].short_name).toBe("MEP");
  });
});
