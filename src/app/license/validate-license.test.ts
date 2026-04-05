import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateLicense } from "./validate-license";

const { validateLicenseRequestMock, getMachineFingerprintMock, saveStoredLicensingStateMock, clearStoredLicensingStateMock, resolveLicensingConfigMock } = vi.hoisted(() => ({
  validateLicenseRequestMock: vi.fn(),
  getMachineFingerprintMock: vi.fn(),
  saveStoredLicensingStateMock: vi.fn(),
  clearStoredLicensingStateMock: vi.fn(),
  resolveLicensingConfigMock: vi.fn(),
}));

vi.mock("../../infrastructure/license/licensing-http-client", () => ({
  validateLicenseRequest: (...args: unknown[]) => validateLicenseRequestMock(...args),
  LicensingHttpError: class LicensingHttpError extends Error {
    constructor(
      public readonly kind: "network" | "timeout" | "invalid_json",
      message: string,
      public readonly diagnostics?: Record<string, unknown>,
    ) {
      super(message);
    }
  },
}));

vi.mock("../../infrastructure/license/machine-fingerprint", () => ({
  getMachineFingerprint: () => getMachineFingerprintMock(),
}));

vi.mock("../../infrastructure/license/license-state-storage", () => ({
  saveStoredLicensingState: (...args: unknown[]) => saveStoredLicensingStateMock(...args),
  clearStoredLicensingState: (...args: unknown[]) => clearStoredLicensingStateMock(...args),
}));

vi.mock("../../infrastructure/license/licensing-config", () => ({
  resolveLicensingConfig: () => resolveLicensingConfigMock(),
}));

vi.mock("./clear-invalid-license-state", () => ({
  clearInvalidLicenseState: (...args: unknown[]) => clearStoredLicensingStateMock(...args),
}));

describe("validateLicense", () => {
  const storedState = {
    schemaVersion: 2 as const,
    projectRef: "uziellpqviqtyquyaomr",
    licenseKey: "PI-ABCDE-12345-FGHIJ-67890",
    machineFingerprint: "fingerprint-a",
    activationCorrelationToken: "token-a",
    licenseStatus: "active" as const,
    lastValidationState: "valid" as const,
    expiresAt: "2027-04-05T00:00:00.000Z",
    trustedUntil: "2099-04-10T00:00:00.000Z",
    nextValidationRequiredAt: "2099-04-10T00:00:00.000Z",
    lastValidatedAt: "2026-04-03T00:00:00.000Z",
  };

  beforeEach(() => {
    validateLicenseRequestMock.mockReset();
    getMachineFingerprintMock.mockReset();
    saveStoredLicensingStateMock.mockReset();
    clearStoredLicensingStateMock.mockReset();
    resolveLicensingConfigMock.mockReset();
    resolveLicensingConfigMock.mockReturnValue({ projectRef: "uziellpqviqtyquyaomr" });
    getMachineFingerprintMock.mockResolvedValue("fingerprint-a");
  });

  it("renews trust when the backend returns valid", async () => {
    validateLicenseRequestMock.mockResolvedValue({
      status: 200,
      elapsedMs: 110,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "validate-license",
      body: {
        success: true,
        code: "license_validation_result",
        data: {
          state: "valid",
          reason: "validated",
          license_status: "active",
          expires_at: "2027-04-05T00:00:00.000Z",
          trusted_until: "2099-05-10T00:00:00.000Z",
          next_validation_required_at: "2099-05-10T00:00:00.000Z",
        },
      },
    });

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "VALID", isLicensed: true, expiresAt: "2027-04-05T00:00:00.000Z" });
    expect(saveStoredLicensingStateMock).toHaveBeenCalledOnce();
    expect(saveStoredLicensingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: "2027-04-05T00:00:00.000Z" }),
    );
  });

  it("clears local state when the backend returns revoked", async () => {
    validateLicenseRequestMock.mockResolvedValue({
      status: 200,
      elapsedMs: 130,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "validate-license",
      body: {
        success: true,
        code: "license_validation_result",
        data: {
          state: "revoked",
          reason: "revoked",
          license_status: "revoked",
          expires_at: "2027-04-05T00:00:00.000Z",
          trusted_until: null,
          next_validation_required_at: null,
        },
      },
    });

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "REVOKED", isLicensed: false });
    expect(clearStoredLicensingStateMock).toHaveBeenCalled();
  });

  it("falls back to offline valid when the network fails inside the trust window", async () => {
    const HttpError = (await import("../../infrastructure/license/licensing-http-client")).LicensingHttpError;
    validateLicenseRequestMock.mockRejectedValue(
      new HttpError("network", "offline", {
        operation: "validate-license",
        classifiedReason: "offline",
        rawErrorName: "TypeError",
        rawErrorMessage: "Failed to fetch",
        elapsedMs: 54,
        host: "uziellpqviqtyquyaomr.supabase.co",
        stage: "connect",
      }),
    );

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "OFFLINE_VALID", isLicensed: true });
    expect(state.diagnostics).toMatchObject({ classifiedReason: "offline" });
    expect(saveStoredLicensingStateMock).not.toHaveBeenCalled();
  });

  it("returns a safe error on invalid payloads instead of treating them as valid", async () => {
    validateLicenseRequestMock.mockResolvedValue({
      status: 200,
      elapsedMs: 75,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "validate-license",
      body: {
        success: true,
        code: "license_validation_result",
        data: {
          state: "unexpected_state",
          reason: "???",
          license_status: "active",
          expires_at: "2027-04-05T00:00:00.000Z",
          trusted_until: null,
          next_validation_required_at: null,
        },
      },
    });

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "ERROR", isLicensed: false });
    expect(state.diagnostics).toMatchObject({ classifiedReason: "invalid_response" });
    expect(clearStoredLicensingStateMock).not.toHaveBeenCalled();
  });
});
