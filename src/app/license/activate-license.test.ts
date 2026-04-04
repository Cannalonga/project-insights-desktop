import { beforeEach, describe, expect, it, vi } from "vitest";

import { activateLicense, LicenseActivationError } from "./activate-license";

const { activateLicenseRequestMock, getMachineFingerprintMock, saveStoredLicensingStateMock, resolveLicensingConfigMock } = vi.hoisted(() => ({
  activateLicenseRequestMock: vi.fn(),
  getMachineFingerprintMock: vi.fn(),
  saveStoredLicensingStateMock: vi.fn(),
  resolveLicensingConfigMock: vi.fn(),
}));

vi.mock("../../infrastructure/license/licensing-http-client", () => ({
  activateLicenseRequest: (...args: unknown[]) => activateLicenseRequestMock(...args),
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
}));

vi.mock("../../infrastructure/license/licensing-config", () => ({
  resolveLicensingConfig: () => resolveLicensingConfigMock(),
}));

describe("activateLicense", () => {
  beforeEach(() => {
    activateLicenseRequestMock.mockReset();
    getMachineFingerprintMock.mockReset();
    saveStoredLicensingStateMock.mockReset();
    resolveLicensingConfigMock.mockReset();
    resolveLicensingConfigMock.mockReturnValue({ projectRef: "uziellpqviqtyquyaomr" });
    getMachineFingerprintMock.mockResolvedValue("fingerprint-a");
  });

  it("persists state when activation is approved", async () => {
    activateLicenseRequestMock.mockResolvedValue({
      status: 200,
      elapsedMs: 120,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "activate-license",
      body: {
        success: true,
        code: "activation_approved",
        data: {
          approved: true,
          reason: "first_activation",
          license_status: "active",
          activation: {
            activation_id: "act-1",
            machine_fingerprint: "fingerprint-a",
            first_activated_at: "2026-04-03T00:00:00.000Z",
          },
          activation_token: "token-a",
          trusted_until: "2099-04-10T00:00:00.000Z",
          next_validation_required_at: "2099-04-10T00:00:00.000Z",
        },
      },
    });

    const state = await activateLicense("PI-ABCDE-12345-FGHIJ-67890");

    expect(state).toMatchObject({ status: "VALID", isLicensed: true });
    expect(saveStoredLicensingStateMock).toHaveBeenCalledOnce();
  });

  it("maps bound licenses to mismatch without persisting a new valid state", async () => {
    activateLicenseRequestMock.mockResolvedValue({
      status: 409,
      elapsedMs: 140,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "activate-license",
      body: {
        success: true,
        code: "activation_denied",
        data: {
          approved: false,
          reason: "license_already_bound",
          license_status: "active",
        },
      },
    });

    const state = await activateLicense("PI-ABCDE-12345-FGHIJ-67890");

    expect(state).toMatchObject({ status: "MISMATCH", isLicensed: false });
    expect(saveStoredLicensingStateMock).not.toHaveBeenCalled();
  });

  it("turns invalid backend payload into a safe activation error", async () => {
    activateLicenseRequestMock.mockResolvedValue({
      status: 200,
      elapsedMs: 99,
      host: "uziellpqviqtyquyaomr.supabase.co",
      operation: "activate-license",
      body: {
        success: true,
        code: "activation_approved",
        data: {
          approved: true,
          reason: "unexpected_reason",
          license_status: "active",
          activation: {
            activation_id: "act-1",
            machine_fingerprint: "fingerprint-a",
            first_activated_at: "2026-04-03T00:00:00.000Z",
          },
          activation_token: "token-a",
          trusted_until: "2099-04-10T00:00:00.000Z",
          next_validation_required_at: "2099-04-10T00:00:00.000Z",
        },
      },
    });

    await expect(activateLicense("PI-ABCDE-12345-FGHIJ-67890")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("rejects malformed license keys before calling the backend", async () => {
    await expect(activateLicense("bad-license")).rejects.toBeInstanceOf(LicenseActivationError);
    expect(activateLicenseRequestMock).not.toHaveBeenCalled();
  });

  it("preserves diagnostics when the request fails on dns resolution", async () => {
    const HttpError = (await import("../../infrastructure/license/licensing-http-client")).LicensingHttpError;
    activateLicenseRequestMock.mockRejectedValue(
      new HttpError("network", "fetch failed", {
        operation: "activate-license",
        classifiedReason: "dns",
        rawErrorName: "TypeError",
        rawErrorMessage: "Failed to fetch",
        elapsedMs: 43,
        host: "uziellpqviqtyquyaomr.supabase.co",
        stage: "dns",
      }),
    );

    await expect(activateLicense("PI-ABCDE-12345-FGHIJ-67890")).rejects.toMatchObject({
      code: "network",
      diagnostics: expect.objectContaining({
        classifiedReason: "dns",
        stage: "dns",
        host: "uziellpqviqtyquyaomr.supabase.co",
      }),
    });
  });
});
