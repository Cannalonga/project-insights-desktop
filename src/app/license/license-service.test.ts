import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLicenseService } from "./license-service";

const { loadLicenseMock, saveLicenseMock, verifyLicenseMock } = vi.hoisted(() => ({
  loadLicenseMock: vi.fn(),
  saveLicenseMock: vi.fn(),
  verifyLicenseMock: vi.fn(),
}));

vi.mock("./load-license", () => ({
  loadLicense: () => loadLicenseMock(),
}));

vi.mock("./save-license", () => ({
  saveLicense: (...args: unknown[]) => saveLicenseMock(...args),
}));

vi.mock("./verify-license", () => ({
  verifyLicense: (...args: unknown[]) => verifyLicenseMock(...args),
}));

describe("license service", () => {
  beforeEach(() => {
    loadLicenseMock.mockReset();
    saveLicenseMock.mockReset();
    verifyLicenseMock.mockReset();
  });

  it("returns missing when no persisted license exists", async () => {
    loadLicenseMock.mockResolvedValue({ status: "missing" });

    await expect(createLicenseService().loadCurrentState()).resolves.toMatchObject({
      status: "missing",
      isLicensed: false,
    });
  });

  it("returns invalid when persisted license cannot be read safely", async () => {
    loadLicenseMock.mockResolvedValue({ status: "invalid" });

    await expect(createLicenseService().loadCurrentState()).resolves.toMatchObject({
      status: "invalid",
      isLicensed: false,
    });
  });

  it("returns a valid state when a stored annual license verifies correctly", async () => {
    loadLicenseMock.mockResolvedValue({ status: "loaded", contents: "license-file" });
    verifyLicenseMock.mockResolvedValue({
      customerName: "Cliente Teste",
      licenseId: "LIC-123",
      plan: "annual",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });

    await expect(createLicenseService().loadCurrentState()).resolves.toMatchObject({
      status: "valid",
      isLicensed: true,
      plan: "annual",
    });
  });

  it("falls back to invalid state when stored content is corrupted", async () => {
    loadLicenseMock.mockResolvedValue({ status: "loaded", contents: "broken-file" });
    verifyLicenseMock.mockRejectedValue(new Error("Licenca invalida ou corrompida."));

    await expect(createLicenseService().loadCurrentState()).resolves.toMatchObject({
      status: "invalid",
      isLicensed: false,
    });
  });

  it("persists the imported license only after successful verification", async () => {
    verifyLicenseMock.mockResolvedValue({
      customerName: "Cliente Teste",
      licenseId: "LIC-456",
      plan: "semiannual",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-06-30T00:00:00.000Z",
    });

    const state = await createLicenseService().importLicense("new-license-file");

    expect(saveLicenseMock).toHaveBeenCalledWith("new-license-file");
    expect(state).toMatchObject({
      status: "valid",
      plan: "semiannual",
      isLicensed: true,
    });
  });

  it("does not persist tampered content when signature verification fails", async () => {
    verifyLicenseMock.mockRejectedValue(new Error("signature mismatch"));

    await expect(createLicenseService().importLicense("tampered-license")).rejects.toThrow("signature mismatch");
    expect(saveLicenseMock).not.toHaveBeenCalled();
  });

  it("replaces runtime state when a new license is imported manually", async () => {
    verifyLicenseMock
      .mockResolvedValueOnce({
        customerName: "Cliente Demo",
        licenseId: "LIC-001",
        plan: "semiannual",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-06-30T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        customerName: "Cliente Premium",
        licenseId: "LIC-002",
        plan: "annual",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
      });

    const service = createLicenseService();
    const firstState = await service.importLicense("license-a");
    const secondState = await service.importLicense("license-b");

    expect(firstState).toMatchObject({ plan: "semiannual", licenseId: "LIC-001" });
    expect(secondState).toMatchObject({ plan: "annual", licenseId: "LIC-002" });
    expect(saveLicenseMock).toHaveBeenNthCalledWith(1, "license-a");
    expect(saveLicenseMock).toHaveBeenNthCalledWith(2, "license-b");
  });
});
