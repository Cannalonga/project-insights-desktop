import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLicense } from "./use-license";

const {
  appendOperationalLogMock,
  exportOperationalLogForUserMock,
  openExternalMock,
  loadCurrentStateMock,
  activateLicenseMock,
  validateCurrentStateMock,
  clearInvalidLicenseStateMock,
} = vi.hoisted(() => ({
  appendOperationalLogMock: vi.fn(),
  exportOperationalLogForUserMock: vi.fn(),
  openExternalMock: vi.fn(),
  loadCurrentStateMock: vi.fn(),
  activateLicenseMock: vi.fn(),
  validateCurrentStateMock: vi.fn(),
  clearInvalidLicenseStateMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/shell", () => ({
  open: (...args: unknown[]) => openExternalMock(...args),
}));

vi.mock("../../app/use-cases/app-log", () => ({
  appendOperationalLog: (...args: unknown[]) => appendOperationalLogMock(...args),
  exportOperationalLogForUser: (...args: unknown[]) => exportOperationalLogForUserMock(...args),
}));

vi.mock("../../app/license/license-service", () => ({
  LicenseActivationError: class LicenseActivationError extends Error {
    code: string;
    diagnostics?: unknown;

    constructor(code: string, message: string, diagnostics?: unknown) {
      super(message);
      this.name = "LicenseActivationError";
      this.code = code;
      this.diagnostics = diagnostics;
    }
  },
  createLicenseService: () => ({
    loadCurrentState: () => loadCurrentStateMock(),
    activateLicense: (licenseKey: string) => activateLicenseMock(licenseKey),
    validateCurrentState: () => validateCurrentStateMock(),
    clearInvalidLicenseState: () => clearInvalidLicenseStateMock(),
  }),
}));

type HookSnapshot = ReturnType<typeof useLicense>;

let latestSnapshot: HookSnapshot | null = null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function Harness(): null {
  latestSnapshot = useLicense();
  return null;
}

describe("useLicense", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latestSnapshot = null;
    appendOperationalLogMock.mockReset();
    exportOperationalLogForUserMock.mockReset();
    openExternalMock.mockReset();
    loadCurrentStateMock.mockReset();
    activateLicenseMock.mockReset();
    validateCurrentStateMock.mockReset();
    clearInvalidLicenseStateMock.mockReset();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    container.remove();
  });

  it("falls back to NO_LICENSE after local state load failure and still allows activation", async () => {
    loadCurrentStateMock.mockRejectedValue(new Error("stored state unreadable"));
    validateCurrentStateMock.mockResolvedValue(null);
    activateLicenseMock.mockResolvedValue({
      status: "VALID",
      isLicensed: true,
      message: "Licenca validada com sucesso. Voce pode usar o app normalmente.",
      source: "remote",
      trustedUntil: "2099-04-10T00:00:00.000Z",
      nextValidationRequiredAt: "2099-04-10T00:00:00.000Z",
    });

    await act(async () => {
      root.render(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(latestSnapshot).not.toBeNull();
    expect(latestSnapshot?.loading).toBe(false);
    expect(latestSnapshot?.license.status).toBe("NO_LICENSE");
    expect(latestSnapshot?.license.isLicensed).toBe(false);
    expect(latestSnapshot?.notice).toBe(
      "Nao foi possivel ler o estado local de licenciamento desta maquina. Voce pode tentar ativar a licenca novamente.",
    );
    expect(validateCurrentStateMock).not.toHaveBeenCalled();
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "license_state_load_failed",
        errorCategory: "license_state",
        uiStateAfter: "NO_LICENSE",
        rawErrorName: "Error",
        rawErrorMessage: "stored state unreadable",
      }),
    );

    let activated = false;
    await act(async () => {
      activated = await latestSnapshot!.applyLicenseText("PI-ABCDE-12345-FGHIJ-67890");
      await flushPromises();
    });

    expect(activated).toBe(true);
    expect(activateLicenseMock).toHaveBeenCalledWith("PI-ABCDE-12345-FGHIJ-67890");
    expect(latestSnapshot?.license.status).toBe("VALID");
    expect(appendOperationalLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "license_apply_success",
        uiStateBefore: "NO_LICENSE",
        uiStateAfter: "VALID",
      }),
    );
  });
});
