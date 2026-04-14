import { describe, expect, it } from "vitest";

import { parseXer, XerParseError } from "./parse-xer";

describe("parseXer", () => {
  it("parses a minimal XER table", () => {
    const result = parseXer("%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1749\tZ2 RR R1.03");
    const table = result.tables.get("PROJECT");

    expect(result.sourceEncoding).toBe("unknown");
    expect(result.tableOrder).toEqual(["PROJECT"]);
    expect(table).toEqual({
      name: "PROJECT",
      fields: ["proj_id", "proj_short_name"],
      records: [["1749", "Z2 RR R1.03"]],
    });
  });

  it("preserves multiple tables and table order", () => {
    const result = parseXer([
      "ERMHDR\t6.2\t2014-04-05\tProject",
      "%T\tPROJECT",
      "%F\tproj_id\tproj_short_name",
      "%R\t1749\tZ2 RR R1.03",
      "%T\tTASK",
      "%F\ttask_id\ttask_name",
      "%R\t1001\tFoundation",
    ].join("\n"));

    expect(result.tableOrder).toEqual(["PROJECT", "TASK"]);
    expect(result.tables.get("TASK")?.records).toEqual([["1001", "Foundation"]]);
  });

  it("supports tables without records", () => {
    const result = parseXer("%T\tCALENDAR\n%F\tclndr_id\tclndr_name");

    expect(result.tables.get("CALENDAR")).toEqual({
      name: "CALENDAR",
      fields: ["clndr_id", "clndr_name"],
      records: [],
    });
  });

  it("preserves multiple records and raw string values", () => {
    const input = [
      "%T\tTASK",
      "%F\ttask_id\ttask_name\ttarget_drtn_hr_cnt",
      "%R\t1001\tEscavacao\t240",
      "%R\t1002\tMecanica\t0",
    ].join("\r\n");

    const result = parseXer(input);

    expect(result.tables.get("TASK")?.records).toEqual([
      ["1001", "Escavacao", "240"],
      ["1002", "Mecanica", "0"],
    ]);
  });

  it("keeps unknown tables instead of discarding them", () => {
    const result = parseXer("%T\tCUSTOMTABLE\n%F\tcustom_id\tcustom_value\n%R\t1\tABC");

    expect(result.tableOrder).toEqual(["CUSTOMTABLE"]);
    expect(result.tables.get("CUSTOMTABLE")?.records).toEqual([["1", "ABC"]]);
  });

  it("throws a clear error when a record appears before fields", () => {
    expect(() => parseXer("%T\tTASK\n%R\t1001\tFoundation")).toThrow(XerParseError);
    expect(() => parseXer("%T\tTASK\n%R\t1001\tFoundation")).toThrow("%R appeared before %F");
  });

  it("throws a clear error when fields appear before a table", () => {
    expect(() => parseXer("%F\tproj_id")).toThrow(XerParseError);
    expect(() => parseXer("%F\tproj_id")).toThrow("%F appeared before %T");
  });

  it("fails instead of overwriting duplicate tables or fields", () => {
    expect(() => parseXer("%T\tTASK\n%F\ttask_id\n%T\tTASK\n%F\ttask_id")).toThrow("duplicate table TASK");
    expect(() => parseXer("%T\tTASK\n%F\ttask_id\n%F\ttask_name")).toThrow("duplicate %F for table TASK");
  });
});
