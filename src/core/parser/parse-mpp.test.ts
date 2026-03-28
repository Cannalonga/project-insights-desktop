import { describe, expect, it } from "vitest";

import { MPPUnsupportedError } from "./mpp-unsupported-error";
import { parseMPP } from "./parse-mpp";

describe("parseMPP", () => {
  it("throws explicit unsupported error for .mpp input", () => {
    try {
      parseMPP("D:\\Cronogramas\\projeto.mpp");
      throw new Error("Expected parseMPP to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MPPUnsupportedError);
      expect((error as MPPUnsupportedError).code).toBe("UNSUPPORTED_MPP");
      expect((error as Error).message).toContain(".mpp");
    }
  });
});
