import { describe, expect, it } from "vitest";

import { getLicenseFeatureDecision } from "./license-feature-policy";

describe("license feature policy", () => {
  it("allows premium actions for valid licenses", () => {
    expect(
      getLicenseFeatureDecision(
        {
          status: "VALID",
          isLicensed: true,
          source: "remote",
          message: "Licença ativa.",
        },
        "export_csv",
      ),
    ).toEqual({
      allowed: true,
      title: "",
      description: "",
    });
  });

  it("blocks premium actions when license is missing", () => {
    expect(
      getLicenseFeatureDecision(
        {
          status: "NO_LICENSE",
          isLicensed: false,
          source: "local",
          message: "Modo demonstração.",
        },
        "export_csv",
      ),
    ).toEqual({
      allowed: false,
      title: "Exportacao CSV completa disponivel na versao completa",
      description: "Insira uma licenca valida ou obtenha a versao completa para liberar este recurso.",
    });
  });

  it("exposes specific labels for presentation-gated demo blocks", () => {
    expect(
      getLicenseFeatureDecision(
        {
          status: "NO_LICENSE",
          isLicensed: false,
          source: "local",
          message: "Modo demonstração.",
        },
        "trend_curve_detail",
      ),
    ).toEqual({
      allowed: false,
      title: "Curva S detalhada disponivel na versao completa",
      description: "Insira uma licenca valida ou obtenha a versao completa para liberar este recurso.",
    });
  });
});
