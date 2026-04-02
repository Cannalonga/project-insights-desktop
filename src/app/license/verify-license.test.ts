import { beforeEach, describe, expect, it, vi } from "vitest";

import { LicenseVerificationError, verifyLicense } from "./verify-license";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("verifyLicense", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("rejects malformed license files before calling the backend", async () => {
    await expect(verifyLicense("not-json")).rejects.toBeInstanceOf(LicenseVerificationError);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejects files without signature before calling the backend", async () => {
    await expect(
      verifyLicense(
        JSON.stringify({
          payload: {
            customerName: "Cliente Teste",
            licenseId: "LIC-123",
            plan: "annual",
            issuedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-12-31T00:00:00.000Z",
          },
        }),
      ),
    ).rejects.toThrow("Licenca em formato invalido.");

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("returns the verified payload when the backend accepts the signature", async () => {
    invokeMock.mockResolvedValue({
      payload: {
        customerName: "Cliente Teste",
        licenseId: "LIC-123",
        plan: "annual",
        issuedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-12-31T00:00:00.000Z",
      },
    });

    await expect(
      verifyLicense(
        JSON.stringify({
          payload: {
            customerName: "Cliente Teste",
            licenseId: "LIC-123",
            plan: "annual",
            issuedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-12-31T00:00:00.000Z",
          },
          signature: "abc123",
        }),
      ),
    ).resolves.toMatchObject({
      customerName: "Cliente Teste",
      licenseId: "LIC-123",
    });
  });

  it("returns a friendly invalid message when the backend rejects the signature", async () => {
    invokeMock.mockRejectedValue(new Error("bad signature"));

    await expect(
      verifyLicense(
        JSON.stringify({
          payload: {
            customerName: "Cliente Teste",
            licenseId: "LIC-123",
            plan: "annual",
            issuedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-12-31T00:00:00.000Z",
          },
          signature: "abc123",
        }),
      ),
    ).rejects.toThrow("Licenca invalida ou corrompida.");
  });

  it("invalidates tampered payloads when signature verification fails", async () => {
    invokeMock.mockRejectedValue(new Error("signature mismatch after payload change"));

    await expect(
      verifyLicense(
        JSON.stringify({
          payload: {
            customerName: "Cliente Alterado",
            licenseId: "LIC-123",
            plan: "annual",
            issuedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2027-01-01T00:00:00.000Z",
          },
          signature: "abc123",
        }),
      ),
    ).rejects.toThrow("Licenca invalida ou corrompida.");
  });
});
