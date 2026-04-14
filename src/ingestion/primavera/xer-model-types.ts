import type { XerTable } from "./parse-xer-types";

export type XerRawRecord = Record<string, string>;

export type XerProjectRecord = XerRawRecord & {
  proj_id?: string;
  proj_short_name?: string;
};

export type XerWbsRaw = XerRawRecord & {
  wbs_id?: string;
  proj_id?: string;
  parent_wbs_id?: string;
  wbs_short_name?: string;
  wbs_name?: string;
};

export type XerTaskRaw = XerRawRecord & {
  task_id?: string;
  proj_id?: string;
  wbs_id?: string;
  task_code?: string;
  task_name?: string;
};

export type XerRelationshipRaw = XerRawRecord & {
  task_pred_id?: string;
  task_id?: string;
  pred_task_id?: string;
  pred_type?: string;
};

export type XerResourceRaw = XerRawRecord & {
  rsrc_id?: string;
  parent_rsrc_id?: string;
  rsrc_name?: string;
  rsrc_short_name?: string;
};

export type XerTaskResourceRaw = XerRawRecord & {
  taskrsrc_id?: string;
  task_id?: string;
  proj_id?: string;
  rsrc_id?: string;
};

export type XerCalendarRaw = XerRawRecord & {
  clndr_id?: string;
  clndr_name?: string;
  proj_id?: string;
  clndr_type?: string;
};

export type XerActivityCodeRaw = XerRawRecord & {
  actv_code_id?: string;
  actv_code_type_id?: string;
  actv_code_name?: string;
  short_name?: string;
};

export type XerTaskActivityCodeRaw = XerRawRecord & {
  task_id?: string;
  actv_code_type_id?: string;
  actv_code_id?: string;
  proj_id?: string;
};

export type XerUdfTypeRaw = XerRawRecord & {
  udf_type_id?: string;
  table_name?: string;
  udf_type_name?: string;
  udf_type_label?: string;
};

export type XerUdfValueRaw = XerRawRecord & {
  udf_type_id?: string;
  fk_id?: string;
  proj_id?: string;
};

export type XerProjectRaw = {
  projects: XerProjectRecord[];
  wbs: XerWbsRaw[];
  tasks: XerTaskRaw[];
  relationships: XerRelationshipRaw[];
  resources: XerResourceRaw[];
  taskResources: XerTaskResourceRaw[];
  calendars: XerCalendarRaw[];
  activityCodes: XerActivityCodeRaw[];
  taskActivityCodes: XerTaskActivityCodeRaw[];
  udfTypes: XerUdfTypeRaw[];
  udfValues: XerUdfValueRaw[];
  sourceEncoding: string;
  sourceTables: string[];
  unknownTables: Map<string, XerTable>;
};

