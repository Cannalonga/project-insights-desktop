import type { XerParseResult, XerTable } from "./parse-xer-types";

export class XerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XerParseError";
  }
}

function splitXerLine(line: string): string[] {
  return line.split("\t");
}

function createTable(name: string): XerTable {
  return {
    name,
    fields: [],
    records: [],
  };
}

export function parseXer(input: string): XerParseResult {
  const tables = new Map<string, XerTable>();
  const tableOrder: string[] = [];
  let currentTable: XerTable | undefined;
  let currentTableHasFields = false;

  const lines = input.split(/\r\n|\n|\r/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (!line.startsWith("%")) {
      return;
    }

    const parts = splitXerLine(line);
    const marker = parts[0];

    if (marker === "%T") {
      const tableName = parts[1];

      if (!tableName) {
        throw new XerParseError(`Invalid XER structure at line ${lineNumber}: table name is required.`);
      }

      if (tables.has(tableName)) {
        throw new XerParseError(`Invalid XER structure at line ${lineNumber}: duplicate table ${tableName}.`);
      }

      currentTable = createTable(tableName);
      currentTableHasFields = false;
      tables.set(tableName, currentTable);
      tableOrder.push(tableName);
      return;
    }

    if (marker === "%F") {
      if (!currentTable) {
        throw new XerParseError(`Invalid XER structure at line ${lineNumber}: %F appeared before %T.`);
      }

      if (currentTableHasFields) {
        throw new XerParseError(`Invalid XER structure at line ${lineNumber}: duplicate %F for table ${currentTable.name}.`);
      }

      currentTable.fields = parts.slice(1);
      currentTableHasFields = true;
      return;
    }

    if (marker === "%R") {
      if (!currentTable || !currentTableHasFields) {
        throw new XerParseError(`Invalid XER structure at line ${lineNumber}: %R appeared before %F.`);
      }

      currentTable.records.push(parts.slice(1));
    }
  });

  return {
    tables,
    sourceEncoding: "unknown",
    tableOrder,
  };
}
