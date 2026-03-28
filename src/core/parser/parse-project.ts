import { parseMPP } from "./parse-mpp";
import { parseMSPDI } from "./parse-mspdi";
import type { RawProject } from "./types";

type ParseProjectInput = {
  filePath?: string;
  xmlContent?: string;
};

export function parseProject(input: ParseProjectInput): RawProject {
  if (input.xmlContent !== undefined) {
    return parseMSPDI(input.xmlContent);
  }

  return parseMPP(input.filePath ?? "");
}
