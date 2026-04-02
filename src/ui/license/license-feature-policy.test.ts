import { describe, expect, it } from "vitest";

import { getLicenseFeatureDecision } from "./license-feature-policy";

describe("license feature policy", () => {
  it("allows premium actions for valid licenses", () => {
    expect(
      getLicenseFeatureDecision(
        {
          status: "valid",
          isLicensed: true,
          message: "Licenca ativa.",
        },
        "export_power_bi_package",
      ),
    ).toMatchObject({
      allowed: true,
    });
  });

  it("blocks premium actions when license is missing", () => {
    expect(
      getLicenseFeatureDecision(
        {
          status: "missing",
          isLicensed: false,
          message: "Modo demonstracao ativo.",
        },
        "export_power_bi_package",
      ),
    ).toMatchObject({
      allowed: false,
      title: "Pacote Power BI disponivel na versao completa",
    });
  });
});
