export type XerTable = {
  name: string;
  fields: string[];
  records: string[][];
};

export type XerParseResult = {
  tables: Map<string, XerTable>;
  sourceEncoding: string;
  tableOrder: string[];
};

