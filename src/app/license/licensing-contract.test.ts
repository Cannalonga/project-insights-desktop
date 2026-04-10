import { describe, expect, it } from "vitest";

import {
  LicensingContractError,
  parseActivateLicenseResponse,
  parseValidateLicenseResponse,
} from "../../core/license/licensing-contract";

describe("licensing contract", () => {
  it("parses approved activation responses defensively", () => {
    const parsed = parseActivateLicenseResponse({
      success: true,
      code: "activation_approved",
      data: {
        approved: true,
        reason: "first_activation",
        license_status: "active",
        activation: {
          activation_id: "act-1",
          machine_fingerprint: "fp-1",
          first_activated_at: "2026-04-03T00:00:00.000Z",
        },
        activation_token: "token-1",
        trusted_until: "2026-04-10T00:00:00.000Z",
        next_validation_required_at: "2026-04-10T00:00:00.000Z",
      },
    });

    expect(parsed).toMatchObject({
      approved: true,
      reason: "first_activation",
      activationCorrelationToken: "token-1",
    });
  });

  it("parses denied activation responses without trusting extra fields", () => {
    const parsed = parseActivateLicenseResponse({
      success: true,
      code: "activation_denied",
      data: {
        approved: false,
        reason: "license_already_bound",
        license_status: "active",
        expires_at: "2027-04-05T00:00:00.000Z",
      },
    });

    expect(parsed).toEqual({
      approved: false,
      reason: "license_already_bound",
      licenseStatus: "active",
    });
  });

  it("parses validate responses", () => {
    const parsed = parseValidateLicenseResponse({
      success: true,
      code: "license_validation_result",
      data: {
        state: "valid",
        reason: "validated",
        license_status: "active",
        trusted_until: "2026-04-10T00:00:00.000Z",
        next_validation_required_at: "2026-04-10T00:00:00.000Z",
      },
    });

    expect(parsed).toMatchObject({
      state: "valid",
      licenseStatus: "active",
    });
  });

  it("fails safely when mandatory fields are missing", () => {
    expect(() =>
      parseActivateLicenseResponse({
        success: true,
        code: "activation_approved",
        data: { approved: true },
      }),
    ).toThrow(LicensingContractError);
  });
});
