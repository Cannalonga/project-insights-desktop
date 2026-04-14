import type { XerParseResult, XerTable } from "./parse-xer-types";
import type {
  XerActivityCodeRaw,
  XerCalendarRaw,
  XerProjectRaw,
  XerProjectRecord,
  XerRawRecord,
  XerRelationshipRaw,
  XerResourceRaw,
  XerTaskActivityCodeRaw,
  XerTaskRaw,
  XerTaskResourceRaw,
  XerUdfTypeRaw,
  XerUdfValueRaw,
  XerWbsRaw,
} from "./xer-model-types";

export class XerModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XerModelError";
  }
}

const ESSENTIAL_TABLES = [
  "PROJECT",
  "PROJWBS",
  "TASK",
  "TASKPRED",
] as const;

const OPTIONAL_TABLES = [
  "TASKRSRC",
  "RSRC",
  "CALENDAR",
  "ACTVCODE",
  "TASKACTV",
  "UDFTYPE",
  "UDFVALUE",
] as const;

const KNOWN_TABLES = new Set<string>([...ESSENTIAL_TABLES, ...OPTIONAL_TABLES]);

function assertNoDuplicateFields(table: XerTable): void {
  const seen = new Set<string>();

  for (const field of table.fields) {
    if (seen.has(field)) {
      throw new XerModelError(`Invalid XER model source: duplicate field ${field} in table ${table.name}.`);
    }

    seen.add(field);
  }
}

function tableToRecords<TRecord extends XerRawRecord>(table: XerTable): TRecord[] {
  assertNoDuplicateFields(table);

  return table.records.map((record) => {
    const mapped: XerRawRecord = {};

    table.fields.forEach((field, index) => {
      mapped[field] = record[index] ?? "";
    });

    return mapped as TRecord;
  });
}

function getRequiredTable(parsed: XerParseResult, tableName: (typeof ESSENTIAL_TABLES)[number]): XerTable {
  const table = parsed.tables.get(tableName);

  if (!table) {
    throw new XerModelError(`Missing required XER table: ${tableName}.`);
  }

  return table;
}

function getOptionalRecords<TRecord extends XerRawRecord>(
  parsed: XerParseResult,
  tableName: (typeof OPTIONAL_TABLES)[number],
): TRecord[] {
  const table = parsed.tables.get(tableName);
  return table ? tableToRecords<TRecord>(table) : [];
}

function getUnknownTables(parsed: XerParseResult): Map<string, XerTable> {
  const unknownTables = new Map<string, XerTable>();

  for (const [tableName, table] of parsed.tables) {
    if (!KNOWN_TABLES.has(tableName)) {
      unknownTables.set(tableName, table);
    }
  }

  return unknownTables;
}

export function buildXerModel(parsed: XerParseResult): XerProjectRaw {
  return {
    projects: tableToRecords<XerProjectRecord>(getRequiredTable(parsed, "PROJECT")),
    wbs: tableToRecords<XerWbsRaw>(getRequiredTable(parsed, "PROJWBS")),
    tasks: tableToRecords<XerTaskRaw>(getRequiredTable(parsed, "TASK")),
    relationships: tableToRecords<XerRelationshipRaw>(getRequiredTable(parsed, "TASKPRED")),
    taskResources: getOptionalRecords<XerTaskResourceRaw>(parsed, "TASKRSRC"),
    resources: getOptionalRecords<XerResourceRaw>(parsed, "RSRC"),
    calendars: getOptionalRecords<XerCalendarRaw>(parsed, "CALENDAR"),
    activityCodes: getOptionalRecords<XerActivityCodeRaw>(parsed, "ACTVCODE"),
    taskActivityCodes: getOptionalRecords<XerTaskActivityCodeRaw>(parsed, "TASKACTV"),
    udfTypes: getOptionalRecords<XerUdfTypeRaw>(parsed, "UDFTYPE"),
    udfValues: getOptionalRecords<XerUdfValueRaw>(parsed, "UDFVALUE"),
    sourceEncoding: parsed.sourceEncoding,
    sourceTables: [...parsed.tableOrder],
    unknownTables: getUnknownTables(parsed),
  };
}
