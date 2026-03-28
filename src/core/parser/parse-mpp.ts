import type { RawProject } from "./types";
import { MPPUnsupportedError } from "./mpp-unsupported-error";

export function parseMPP(filePath: string): RawProject {
  throw new MPPUnsupportedError(`Direct .mpp support is not available for ${filePath}`);
}
