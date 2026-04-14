import { describe, expect, it } from "vitest";

import { buildXerModel } from "./build-xer-model";
import { parseXer } from "./parse-xer";
import { adaptXerToProject, XerProjectAdapterError } from "./adapt-xer-to-project";

function buildModel(input: string) {
  return buildXerModel(parseXer(input));
}

function buildBaseXer(
  overrides: Partial<{
    projectRows: string[];
    wbsRows: string[];
    taskRows: string[];
    relationshipRows: string[];
    resourceRows: string[];
    taskResourceRows: string[];
    activityCodeBlock: string[];
  }> = {},
) {
  return [
    "%T\tPROJECT",
    "%F\tproj_id\tproj_short_name\tproj_name",
    ...(overrides.projectRows ?? ["%R\tP1\tP1 Short\tProject One"]),
    "%T\tPROJWBS",
    "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num\tproj_node_flag",
    ...(overrides.wbsRows ?? [
      "%R\tW1\tP1\t\t1\tRoot\t10\tY",
      "%R\tW2\tP1\tW1\t1.1\tEngineering\t20\tN",
    ]),
    "%T\tTASK",
    "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstart_date\tend_date\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tstatus_code\ttask_type\tduration_type\ttarget_drtn_hr_cnt",
    ...(overrides.taskRows ?? [
      "%R\tT1\tP1\tW2\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t15\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
    ]),
    "%T\tTASKPRED",
    "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    ...(overrides.relationshipRows ?? []),
    "%T\tTASKRSRC",
    "%F\ttaskrsrc_id\tproj_id\ttask_id\trsrc_id",
    ...(overrides.taskResourceRows ?? []),
    "%T\tRSRC",
    "%F\trsrc_id\tproj_id\trsrc_name\trsrc_type",
    ...(overrides.resourceRows ?? []),
    "%T\tCALENDAR",
    "%F\tclndr_id\tclndr_name",
    "%R\tC1\tStandard",
    ...(overrides.activityCodeBlock ?? []),
  ].join("\n");
}

describe("adaptXerToProject", () => {
  it("adapts a minimal project with a valid WBS tree", () => {
    const result = adaptXerToProject(buildModel(buildBaseXer()));

    expect(result.project).toMatchObject({
      id: "P1",
      name: "Project One",
      resources: [],
    });
    expect(result.project.tasks).toEqual([
      expect.objectContaining({
        id: "xer-wbs:W1",
        name: "Root",
        isSummary: true,
        outlineLevel: 1,
        outlineNumber: "1",
      }),
      expect.objectContaining({
        id: "xer-wbs:W2",
        name: "Engineering",
        isSummary: true,
        parentId: "xer-wbs:W1",
        outlineLevel: 2,
        outlineNumber: "1.1.1",
      }),
      expect.objectContaining({
        id: "T1",
        name: "Foundation",
        parentId: "xer-wbs:W2",
        isSummary: false,
      }),
    ]);
    expect(result.metadata).toMatchObject({
      sourceFormat: "xer",
      selectedProjectId: "P1",
      wbsCountRaw: 2,
      wbsCountAdapted: 2,
      taskCountRaw: 1,
      taskCountAdapted: 1,
      diagnosticCountsBySeverity: {
        error: 0,
        warning: 0,
        info: 0,
      },
    });
  });

  it("maps a conservative project reference date from PROJECT into the canonical Project", () => {
    const result = adaptXerToProject(
      buildModel([
        "%T\tPROJECT",
        "%F\tproj_id\tproj_short_name\tproj_name\tlast_recalc_date",
        "%R\tP1\tP1 Short\tProject One\t2018-03-01 08:00",
        "%T\tPROJWBS",
        "%F\twbs_id\tproj_id\tparent_wbs_id\twbs_short_name\twbs_name\tseq_num\tproj_node_flag",
        "%R\tW1\tP1\t\t1\tRoot\t10\tY",
        "%T\tTASK",
        "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstart_date\tend_date\ttarget_start_date\ttarget_end_date\tact_start_date\tact_end_date\tphys_complete_pct\tstatus_code\ttask_type\tduration_type\ttarget_drtn_hr_cnt",
        "%R\tT1\tP1\tW1\tA100\tFoundation\t2018-03-10\t2018-03-15\t2018-03-10\t2018-03-15\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
        "%T\tTASKPRED",
        "%F\ttask_pred_id\tproj_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
        "%T\tTASKRSRC",
        "%F\ttaskrsrc_id\tproj_id\ttask_id\trsrc_id",
        "%T\tRSRC",
        "%F\trsrc_id\tproj_id\trsrc_name\trsrc_type",
        "%T\tCALENDAR",
        "%F\tclndr_id\tclndr_name",
        "%R\tC1\tStandard",
      ].join("\n")),
    );

    expect(result.project.statusDate).toBe("2018-03-01 08:00");
    expect(result.project.currentDate).toBe("2018-03-01 08:00");
  });

  it("fails when no valid PROJECT exists", () => {
    const model = buildModel(buildBaseXer({ projectRows: [] }));

    expect(() => adaptXerToProject(model)).toThrow(XerProjectAdapterError);
    expect(() => adaptXerToProject(model)).toThrow("exactly one PROJECT record");
  });

  it("fails when multiple PROJECT records exist", () => {
    const model = buildModel(
      buildBaseXer({
        projectRows: [
          "%R\tP1\tP1 Short\tProject One",
          "%R\tP2\tP2 Short\tProject Two",
        ],
        wbsRows: [
          "%R\tW1\tP1\t\t1\tRoot\t10\tY",
          "%R\tW2\tP2\t\t1\tOther Root\t10\tY",
        ],
      }),
    );

    expect(() => adaptXerToProject(model)).toThrow(XerProjectAdapterError);
    expect(() => adaptXerToProject(model)).toThrow("multiple PROJECT records");
  });

  it("preserves PROJWBS hierarchy by parent_wbs_id", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW1\tP1\t\t1\tRoot\t10\tY",
            "%R\tW2\tP1\tW1\t2\tEngineering\t20\tN",
            "%R\tW3\tP1\tW2\t3\tStructural\t30\tN",
          ],
          taskRows: [
            "%R\tT1\tP1\tW3\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.find((task) => task.id === "xer-wbs:W3")).toMatchObject({
      parentId: "xer-wbs:W2",
      outlineLevel: 3,
      outlineNumber: "1.2.3",
    });
    expect(result.project.tasks.find((task) => task.id === "T1")).toMatchObject({
      parentId: "xer-wbs:W3",
      outlineLevel: 4,
      outlineNumber: "1.2.3.A100",
    });
  });

  it("attaches TASK to the correct WBS", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW1\tP1\t\t1\tRoot\t10\tY",
            "%R\tW2\tP1\tW1\t1.1\tEngineering\t20\tN",
            "%R\tW3\tP1\tW1\t1.2\tProcurement\t30\tN",
          ],
          taskRows: [
            "%R\tT1\tP1\tW3\tP100\tPurchase\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.find((task) => task.id === "T1")?.parentId).toBe("xer-wbs:W3");
  });

  it("diagnoses and skips TASK rows without a valid WBS", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tMISSING\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.some((task) => task.id === "T1")).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TASK_WITHOUT_WBS",
        severity: "warning",
        entityType: "TASK",
        entityId: "T1",
      }),
    );
    expect(result.metadata.taskCountRaw).toBe(1);
    expect(result.metadata.taskCountAdapted).toBe(0);
  });

  it("diagnoses duplicate WBS ids and keeps the first deterministic occurrence", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW1\tP1\t\t1\tRoot\t10\tY",
            "%R\tW2\tP1\tW1\t1.1\tEngineering\t20\tN",
            "%R\tW2\tP1\tW1\t1.2\tDuplicate Engineering\t30\tN",
          ],
        }),
      ),
    );

    expect(result.project.tasks.filter((task) => task.id === "xer-wbs:W2")).toHaveLength(1);
    expect(result.project.tasks.some((task) => task.name === "Duplicate Engineering")).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "WBS_DUPLICATE_ID",
        severity: "warning",
        entityType: "PROJWBS",
        entityId: "W2",
      }),
    );
  });

  it("diagnoses orphan WBS without silently repairing the structure", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW1\tP1\t\t1\tRoot\t10\tY",
            "%R\tW2\tP1\tMISSING\t2\tOrphan\t20\tN",
          ],
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tAttached to Orphan\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.find((task) => task.id === "xer-wbs:W2")).toMatchObject({
      parentId: undefined,
      outlineLevel: 1,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "WBS_ORPHAN",
        entityType: "PROJWBS",
        entityId: "W2",
      }),
    );
  });

  it("diagnoses multiple WBS roots and preserves a deterministic top-level order", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW2\tP1\t\t2\tSecond Root\t20\tY",
            "%R\tW1\tP1\t\t1\tFirst Root\t10\tY",
          ],
          taskRows: [],
        }),
      ),
    );

    expect(result.project.tasks.map((task) => task.id)).toEqual(["xer-wbs:W1", "xer-wbs:W2"]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "WBS_MULTIPLE_ROOTS",
        severity: "warning",
        entityType: "PROJWBS",
      }),
    );
    expect(result.metadata.diagnosticCountsByCode.WBS_MULTIPLE_ROOTS).toBe(1);
  });

  it("diagnoses duplicate TASK ids and keeps the first deterministic occurrence", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tFirst Version\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
            "%R\tT1\tP1\tW2\tA200\tSecond Version\t2014-03-01\t2014-03-05\t2014-03-01\t2014-03-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.filter((task) => task.id === "T1")).toHaveLength(1);
    expect(result.project.tasks.find((task) => task.id === "T1")?.name).toBe("First Version");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TASK_DUPLICATE_ID",
        severity: "warning",
        entityType: "TASK",
        entityId: "T1",
      }),
    );
  });

  it("diagnoses TASK invalid date ranges without dropping the task", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tBad Dates\t2014-02-10\t2014-02-05\t2014-02-10\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
        }),
      ),
    );

    expect(result.project.tasks.some((task) => task.id === "T1")).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TASK_INVALID_DATE_RANGE",
        entityType: "TASK",
        entityId: "T1",
      }),
    );
  });

  it("adapts a basic TASKPRED dependency", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
            "%R\tT2\tP1\tW2\tA200\tMasonry\t2014-02-06\t2014-02-10\t2014-02-06\t2014-02-10\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
          relationshipRows: ["%R\tR1\tP1\tT2\tT1\tPR_FS\t0"],
        }),
      ),
    );

    expect(result.project.dependencies).toEqual([
      {
        id: "R1",
        fromTaskId: "T1",
        toTaskId: "T2",
        type: "PR_FS",
      },
    ]);
  });

  it("ignores invalid TASKPRED rows with diagnostics", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          relationshipRows: ["%R\tR1\tP1\tT2\tMISSING\tPR_FS\t0"],
        }),
      ),
    );

    expect(result.project.dependencies).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RELATIONSHIP_SKIPPED_MISSING_TASK",
        severity: "warning",
        entityType: "TASKPRED",
        entityId: "R1",
      }),
    );
  });

  it("ignores self-referencing relationships with diagnostics", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          relationshipRows: ["%R\tR1\tP1\tT1\tT1\tPR_FS\t0"],
        }),
      ),
    );

    expect(result.project.dependencies).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RELATIONSHIP_SELF_REFERENCE",
        severity: "warning",
        entityType: "TASKPRED",
        entityId: "R1",
      }),
    );
  });

  it("deduplicates equivalent relationships with diagnostics", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
            "%R\tT2\tP1\tW2\tA200\tMasonry\t2014-02-06\t2014-02-10\t2014-02-06\t2014-02-10\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
          relationshipRows: [
            "%R\tR1\tP1\tT2\tT1\tPR_FS\t0",
            "%R\tR2\tP1\tT2\tT1\tPR_FS\t0",
          ],
        }),
      ),
    );

    expect(result.project.dependencies).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RELATIONSHIP_DUPLICATE",
        severity: "info",
        entityType: "TASKPRED",
        entityId: "R2",
      }),
    );
  });

  it("ignores unsupported relationship types with diagnostics", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          taskRows: [
            "%R\tT1\tP1\tW2\tA100\tFoundation\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
            "%R\tT2\tP1\tW2\tA200\tMasonry\t2014-02-06\t2014-02-10\t2014-02-06\t2014-02-10\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
          relationshipRows: ["%R\tR1\tP1\tT2\tT1\tPR_UNKNOWN\t0"],
        }),
      ),
    );

    expect(result.project.dependencies).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RELATIONSHIP_UNSUPPORTED_TYPE",
        severity: "warning",
        entityType: "TASKPRED",
        entityId: "R1",
      }),
    );
  });

  it("fails when the selected project becomes empty after project filtering", () => {
    const model = buildModel(
      buildBaseXer({
        wbsRows: ["%R\tW9\tP2\t\t9\tOther Project Root\t10\tY"],
        taskRows: ["%R\tT9\tP2\tW9\tA900\tOther Project Task\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40"],
      }),
    );

    expect(() => adaptXerToProject(model)).toThrow(XerProjectAdapterError);
    expect(() => adaptXerToProject(model)).toThrow("no PROJWBS records found");
  });

  it("produces deterministic output when input arrives out of order", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          wbsRows: [
            "%R\tW3\tP1\tW1\tB\tBeta\t30\tN",
            "%R\tW1\tP1\t\tA\tRoot\t10\tY",
            "%R\tW2\tP1\tW1\tA\tAlpha\t20\tN",
          ],
          taskRows: [
            "%R\tT2\tP1\tW2\tB200\tSecond\t2014-02-06\t2014-02-10\t2014-02-06\t2014-02-10\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
            "%R\tT1\tP1\tW2\tA100\tFirst\t2014-02-01\t2014-02-05\t2014-02-01\t2014-02-05\t\t\t0\tTK_NotStart\tTT_Task\tDT_FixedDUR2\t40",
          ],
          relationshipRows: [
            "%R\tR2\tP1\tT2\tT1\tPR_FS\t0",
            "%R\tR1\tP1\tT2\tT1\tPR_FS\t0",
          ],
        }),
      ),
    );

    expect(result.project.tasks.map((task) => task.id)).toEqual([
      "xer-wbs:W1",
      "xer-wbs:W2",
      "xer-wbs:W3",
      "T1",
      "T2",
    ]);
    expect(result.project.dependencies).toEqual([
      {
        id: "R2",
        fromTaskId: "T1",
        toTaskId: "T2",
        type: "PR_FS",
      },
    ]);
  });

  it("keeps ACTVCODE out of the structural hierarchy", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          activityCodeBlock: [
            "%T\tACTVCODE",
            "%F\tactv_code_id\tactv_code_name\tshort_name",
            "%R\tC1\tMechanical\tME",
            "%T\tTASKACTV",
            "%F\ttask_id\tactv_code_id\tproj_id",
            "%R\tT1\tC1\tP1",
          ],
        }),
      ),
    );

    expect(result.project.tasks.find((task) => task.id === "T1")?.parentId).toBe("xer-wbs:W2");
    expect(result.project.tasks.some((task) => task.name === "Mechanical")).toBe(false);
  });

  it("keeps RSRC and TASKRSRC out of the functional Project structure", () => {
    const result = adaptXerToProject(
      buildModel(
        buildBaseXer({
          resourceRows: [
            "%R\tR1\t\tCrew\tRT_Labor",
            "%R\tR2\tP2\tOff Project Crew\tRT_Labor",
          ],
          taskResourceRows: [
            "%R\tTR1\tP1\tT1\tR1",
            "%R\tTR2\tP2\tT9\tR2",
          ],
        }),
      ),
    );

    expect(result.project.resources).toEqual([]);
    expect(result.project.tasks.find((task) => task.id === "T1")?.resourceIds).toEqual([]);
    expect(result.metadata.resourceCountRaw).toBe(1);
    expect(result.metadata.taskResourceCountRaw).toBe(1);
    expect(result.metadata.diagnosticCountsByCode.PROJECT_FILTER_MISMATCH).toBe(2);
  });

  it("logs critical failure events for multiple PROJECT records", () => {
    const entries: Array<Record<string, unknown>> = [];
    const model = buildModel(
      buildBaseXer({
        projectRows: [
          "%R\tP1\tP1 Short\tProject One",
          "%R\tP2\tP2 Short\tProject Two",
        ],
        wbsRows: [
          "%R\tW1\tP1\t\t1\tRoot\t10\tY",
          "%R\tW2\tP2\t\t1\tOther Root\t10\tY",
        ],
      }),
    );

    expect(() =>
      adaptXerToProject(model, {
        logEvent: (entry) => {
          entries.push(entry);
        },
      }),
    ).toThrow(XerProjectAdapterError);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "primavera-xer",
          event: "adaptation_started",
          severity: "info",
        }),
        expect.objectContaining({
          source: "primavera-xer",
          event: "adaptation_failed",
          severity: "error",
          diagnosticCode: "MULTIPLE_PROJECTS",
        }),
      ]),
    );
  });

  it("does not let logging failures break a successful adaptation", () => {
    const result = adaptXerToProject(buildModel(buildBaseXer()), {
      logEvent: () => {
        throw new Error("log unavailable");
      },
    });

    expect(result.project.id).toBe("P1");
    expect(result.project.tasks.some((task) => task.id === "T1")).toBe(true);
  });

  it("emits payloads with the minimum operational context", () => {
    const entries: Array<Record<string, unknown>> = [];

    adaptXerToProject(buildModel(buildBaseXer()), {
      logEvent: (entry) => {
        entries.push(entry);
      },
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "primavera-xer",
          event: "project_selected",
          severity: "info",
          selectedProjectId: "P1",
          context: expect.objectContaining({
            projectName: "Project One",
          }),
        }),
        expect.objectContaining({
          source: "primavera-xer",
          event: "adaptation_completed",
          severity: "info",
          selectedProjectId: "P1",
          context: expect.objectContaining({
            taskCountRaw: 1,
            taskCountAdapted: 1,
          }),
        }),
      ]),
    );
  });
});
