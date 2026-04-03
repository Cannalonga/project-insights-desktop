import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLicenseService } from "./license-service";

const { loadStoredLicenseStateMock, activateLicenseMock, validateLicenseMock, clearInvalidStateMock } = vi.hoisted(() => ({
  loadStoredLicenseStateMock: vi.fn(),
  activateLicenseMock: vi.fn(),
  validateLicenseMock: vi.fn(),
  clearInvalidStateMock: vi.fn(),
}));

vi.mock("./load-stored-license-state", () => ({
  loadStoredLicenseState: () => loadStoredLicenseStateMock(),
}));

vi.mock("./activate-license", () => ({
  activateLicense: (...args: unknown[]) => activateLicenseMock(...args),
  LicenseActivationError: class LicenseActivationError extends Error {},
}));

vi.mock("./validate-license", () => ({
  validateLicense: (...args: unknown[]) => validateLicenseMock(...args),
}));

vi.mock("./clear-invalid-license-state", () => ({
  clearInvalidLicenseState: (...args: unknown[]) => clearInvalidStateMock(...args),
}));

describe("license service", () => {
  beforeEach(() => {
    loadStoredLicenseStateMock.mockReset();
    activateLicenseMock.mockReset();
    validateLicenseMock.mockReset();
    clearInvalidStateMock.mockReset();
  });

  it("returns the locally loaded state", async () => {
    loadStoredLicenseStateMock.mockResolvedValue({
      context: { status: "missing", isLicensed: false, source: "local", message: "missing" },
      storedState: null,
    });

    await expect(createLicenseService().loadCurrentState()).resolves.toMatchObject({
      status: "missing",
      isLicensed: false,
    });
  });

  it("delegates activation to the activation use case", async () => {
    activateLicenseMock.mockResolvedValue({
      status: "valid",
      isLicensed: true,
      source: "remote",
      message: "ok",
    });

    await expect(createLicenseService().activateLicense("PI-ABCDE-12345-FGHIJ-67890")).resolves.toMatchObject({
      status: "valid",
      isLicensed: true,
    });
  });

  it("validates the stored state when one exists", async () => {
    loadStoredLicenseStateMock.mockResolvedValue({
      context: { status: "offline_valid", isLicensed: true, source: "local", message: "offline" },
      storedState: {
        schemaVersion: 2,
        projectRef: "uziellpqviqtyquyaomr",
        licenseKey: "PI-ABCDE-12345-FGHIJ-67890",
        machineFingerprint: "fp",
        activationCorrelationToken: "token",
        licenseStatus: "active",
        lastValidationState: "valid",
        trustedUntil: "2026-04-10T00:00:00.000Z",
        nextValidationRequiredAt: "2026-04-10T00:00:00.000Z",
        lastValidatedAt: "2026-04-03T00:00:00.000Z",
      },
    });
    validateLicenseMock.mockResolvedValue({
      status: "valid",
      isLicensed: true,
      source: "remote",
      message: "validated",
    });

    await expect(createLicenseService().validateCurrentState()).resolves.toMatchObject({
      status: "valid",
      isLicensed: true,
    });
  });

  it("returns null when there is no stored state to validate", async () => {
    loadStoredLicenseStateMock.mockResolvedValue({
      context: { status: "missing", isLicensed: false, source: "local", message: "missing" },
      storedState: null,
    });

    await expect(createLicenseService().validateCurrentState()).resolves.toBeNull();
  });
});
