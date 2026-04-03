import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadStoredLicenseState } from "./load-stored-license-state";

const { loadStoredLicensingStateMock, getMachineFingerprintMock, clearInvalidLicenseStateMock, resolveLicensingConfigMock } = vi.hoisted(() => ({
  loadStoredLicensingStateMock: vi.fn(),
  getMachineFingerprintMock: vi.fn(),
  clearInvalidLicenseStateMock: vi.fn(),
  resolveLicensingConfigMock: vi.fn(),
}));

vi.mock("../../infrastructure/license/license-state-storage", () => ({
  loadStoredLicensingState: () => loadStoredLicensingStateMock(),
}));

vi.mock("../../infrastructure/license/machine-fingerprint", () => ({
  getMachineFingerprint: () => getMachineFingerprintMock(),
}));

vi.mock("../../infrastructure/license/licensing-config", () => ({
  resolveLicensingConfig: () => resolveLicensingConfigMock(),
}));

vi.mock("./clear-invalid-license-state", () => ({
  clearInvalidLicenseState: () => clearInvalidLicenseStateMock(),
}));

describe("loadStoredLicenseState", () => {
  beforeEach(() => {
    loadStoredLicensingStateMock.mockReset();
    getMachineFingerprintMock.mockReset();
    clearInvalidLicenseStateMock.mockReset();
    resolveLicensingConfigMock.mockReset();
    resolveLicensingConfigMock.mockReturnValue({ projectRef: "uziellpqviqtyquyaomr" });
  });

  it("returns missing when there is no persisted state", async () => {
    loadStoredLicensingStateMock.mockResolvedValue({ status: "missing" });

    await expect(loadStoredLicenseState()).resolves.toMatchObject({
      context: { status: "missing", isLicensed: false },
      storedState: null,
    });
  });

  it("returns offline valid when fingerprint matches and trusted window is alive", async () => {
    loadStoredLicensingStateMock.mockResolvedValue({
      status: "loaded",
      state: {
        schemaVersion: 2,
        projectRef: "uziellpqviqtyquyaomr",
        licenseKey: "PI-ABCDE-12345-FGHIJ-67890",
        machineFingerprint: "fingerprint-a",
        activationCorrelationToken: "token",
        licenseStatus: "active",
        lastValidationState: "valid",
        trustedUntil: "2099-04-10T00:00:00.000Z",
        nextValidationRequiredAt: "2099-04-10T00:00:00.000Z",
        lastValidatedAt: "2026-04-03T00:00:00.000Z",
      },
    });
    getMachineFingerprintMock.mockResolvedValue("fingerprint-a");

    await expect(loadStoredLicenseState()).resolves.toMatchObject({
      context: { status: "offline_valid", isLicensed: true },
    });
  });

  it("clears copied state when the fingerprint no longer matches the machine", async () => {
    loadStoredLicensingStateMock.mockResolvedValue({
      status: "loaded",
      state: {
        schemaVersion: 2,
        projectRef: "uziellpqviqtyquyaomr",
        licenseKey: "PI-ABCDE-12345-FGHIJ-67890",
        machineFingerprint: "fingerprint-a",
        activationCorrelationToken: "token",
        licenseStatus: "active",
        lastValidationState: "valid",
        trustedUntil: "2099-04-10T00:00:00.000Z",
        nextValidationRequiredAt: "2099-04-10T00:00:00.000Z",
        lastValidatedAt: "2026-04-03T00:00:00.000Z",
      },
    });
    getMachineFingerprintMock.mockResolvedValue("fingerprint-b");

    await expect(loadStoredLicenseState()).resolves.toMatchObject({
      context: { status: "mismatch", isLicensed: false },
      storedState: null,
    });
    expect(clearInvalidLicenseStateMock).toHaveBeenCalled();
  });
});
