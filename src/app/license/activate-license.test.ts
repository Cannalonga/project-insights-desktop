import { beforeEach, describe, expect, it, vi } from "vitest";

import { activateLicense, LicenseActivationError } from "./activate-license";

const {
  activateLicenseRequestMock,
  getMachineFingerprintMock,
  saveStoredLicensingStateMock,
  resolveLicensingConfigMock,
  appendOperationalLogMock,
} = vi.hoisted(() => ({
  activateLicenseRequestMock: vi.fn(),
  getMachineFingerprintMock: vi.fn(),
  saveStoredLicensingStateMock: vi.fn(),
  resolveLicensingConfigMock: vi.fn(),
  appendOperationalLogMock: vi.fn(),
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
  LicensingConfigError: class LicensingConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "LicensingConfigError";
    }
  },
  resolveLicensingConfig: () => resolveLicensingConfigMock(),
}));

vi.mock("../use-cases/app-log", () => ({
  appendOperationalLog: (...args: unknown[]) => appendOperationalLogMock(...args),
}));

describe("activateLicense", () => {
  beforeEach(() => {
    activateLicenseRequestMock.mockReset();
    getMachineFingerprintMock.mockReset();
    saveStoredLicensingStateMock.mockReset();
    resolveLicensingConfigMock.mockReset();
    appendOperationalLogMock.mockReset();
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
          expires_at: "2027-04-05T00:00:00.000Z",
          trusted_until: "2099-04-10T00:00:00.000Z",
          next_validation_required_at: "2099-04-10T00:00:00.000Z",
        },
      },
    });

    const state = await activateLicense("PI-ABCDE-12345-FGHIJ-67890");

    expect(state).toMatchObject({ status: "VALID", isLicensed: true, expiresAt: "2027-04-05T00:00:00.000Z" });
    expect(saveStoredLicensingStateMock).toHaveBeenCalledOnce();
    expect(saveStoredLicensingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: "2027-04-05T00:00:00.000Z" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "fingerprint_start" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "fingerprint_done" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "http_start" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "http_response" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "parse_done" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "persist_start" }),
    );
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "license_apply_checkpoint", stage: "persist_done" }),
    );
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
          expires_at: "2027-04-05T00:00:00.000Z",
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

  it("preserves raw diagnostics when machine fingerprint retrieval fails before the request", async () => {
    getMachineFingerprintMock.mockRejectedValue({
      name: "InvokeError",
      message: "machine fingerprint command failed",
      code: "TAURI_INVOKE_ERR",
    });

    await expect(activateLicense("PI-ABCDE-12345-FGHIJ-67890")).rejects.toMatchObject({
      code: "unexpected",
      diagnostics: expect.objectContaining({
        operation: "activate-license",
        stage: "fingerprint_start",
        rawErrorName: "InvokeError",
        rawErrorMessage: "machine fingerprint command failed",
        rawErrorCode: "TAURI_INVOKE_ERR",
      }),
    });
    expect(activateLicenseRequestMock).not.toHaveBeenCalled();
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "license_apply_checkpoint",
        outcome: "failure",
        stage: "fingerprint_start",
        rawErrorName: "InvokeError",
      }),
    );
  });

  it("preserves raw diagnostics when local state persistence fails after approval", async () => {
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
          expires_at: "2027-04-05T00:00:00.000Z",
          trusted_until: "2099-04-10T00:00:00.000Z",
          next_validation_required_at: "2099-04-10T00:00:00.000Z",
        },
      },
    });
    saveStoredLicensingStateMock.mockRejectedValue({
      name: "InvokeError",
      message: "failed to persist local licensing state",
      code: "SAVE_STATE_ERR",
    });

    await expect(activateLicense("PI-ABCDE-12345-FGHIJ-67890")).rejects.toMatchObject({
      code: "unexpected",
      message:
        "A licenca foi aprovada, mas nao foi possivel salvar o estado local desta maquina. Tente novamente. Se o problema continuar, contate o suporte.",
      diagnostics: expect.objectContaining({
        operation: "activate-license",
        stage: "persist_start",
        rawErrorName: "InvokeError",
        rawErrorMessage: "failed to persist local licensing state",
        rawErrorCode: "SAVE_STATE_ERR",
      }),
    });
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "license_apply_checkpoint",
        outcome: "failure",
        stage: "persist_start",
        rawErrorCode: "SAVE_STATE_ERR",
      }),
    );
  });
});
