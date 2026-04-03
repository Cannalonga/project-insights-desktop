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
    constructor(public readonly kind: "network" | "timeout" | "invalid_json", message: string) {
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
      body: {
        success: true,
        code: "license_validation_result",
        data: {
          state: "valid",
          reason: "validated",
          license_status: "active",
          trusted_until: "2099-05-10T00:00:00.000Z",
          next_validation_required_at: "2099-05-10T00:00:00.000Z",
        },
      },
    });

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "valid", isLicensed: true });
    expect(saveStoredLicensingStateMock).toHaveBeenCalledOnce();
  });

  it("clears local state when the backend returns revoked", async () => {
    validateLicenseRequestMock.mockResolvedValue({
      status: 200,
      body: {
        success: true,
        code: "license_validation_result",
        data: {
          state: "revoked",
          reason: "revoked",
          license_status: "revoked",
          trusted_until: null,
          next_validation_required_at: null,
        },
      },
    });

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "revoked", isLicensed: false });
    expect(clearStoredLicensingStateMock).toHaveBeenCalled();
  });

  it("falls back to offline valid when the network fails inside the trust window", async () => {
    const HttpError = (await import("../../infrastructure/license/licensing-http-client")).LicensingHttpError;
    validateLicenseRequestMock.mockRejectedValue(new HttpError("network", "offline"));

    const state = await validateLicense(storedState);

    expect(state).toMatchObject({ status: "offline_valid", isLicensed: true });
    expect(saveStoredLicensingStateMock).not.toHaveBeenCalled();
  });
});
