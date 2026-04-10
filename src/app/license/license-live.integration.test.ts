// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLicenseService } from "./license-service";

declare const process: {
  env: Record<string, string | undefined>;
};

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const liveEnabled = process.env.LIVE_LICENSE_TESTS === "1";
const liveSupabaseUrl = process.env.LIVE_LICENSING_SUPABASE_URL ?? "";
const liveAnonKey = process.env.LIVE_LICENSING_ANON_KEY ?? "";
const liveAdminToken = process.env.LIVE_LICENSING_ADMIN_TOKEN ?? "";
const liveProjectRef = process.env.LIVE_LICENSING_PROJECT_REF ?? "uziellpqviqtyquyaomr";

function buildHeaders(admin = false): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: liveAnonKey,
    Authorization: `Bearer ${liveAnonKey}`,
  };

  if (admin) {
    headers["x-admin-token"] = liveAdminToken;
  }

  return headers;
}

async function callFunction<T>(name: string, body: Record<string, unknown>, admin = false): Promise<T> {
  const response = await fetch(`${liveSupabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: buildHeaders(admin),
    body: JSON.stringify(body),
  });

  return response.json() as Promise<T>;
}

describe.runIf(liveEnabled)("license service live integration", () => {
  let storedState: string | null = null;
  let currentFingerprint = "";

  beforeEach(() => {
    const env = import.meta.env as Record<string, string | undefined>;

    storedState = null;
    currentFingerprint = `fingerprint-live-machine-a-${Math.random().toString(16).slice(2, 18)}`;
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case "load_licensing_state":
          return storedState;
        case "save_licensing_state":
          storedState = typeof args?.contents === "string" ? args.contents : null;
          return null;
        case "clear_licensing_state":
          storedState = null;
          return null;
        case "get_machine_fingerprint":
          return currentFingerprint;
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    env.VITE_LICENSING_SUPABASE_URL = liveSupabaseUrl;
    env.VITE_LICENSING_ANON_KEY = liveAnonKey;
    env.VITE_LICENSING_PROJECT_REF = liveProjectRef;
    env.VITE_LICENSING_TIMEOUT_MS = "8000";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("activates successfully and persists local state", async () => {
    const issue = await callFunction<{ data: { license_key: string } }>(
      "issue-license",
      { plan: "annual", metadata: { source: "desktop-live-test-activate" } },
      true,
    );

    const service = createLicenseService();
    const state = await service.activateLicense(issue.data.license_key);

    expect(state).toMatchObject({ status: "VALID", isLicensed: true });
    expect(storedState).toContain(issue.data.license_key);
  }, 20000);

  it("supports offline reopen inside the trust window and then renews online", async () => {
    const issue = await callFunction<{ data: { license_key: string } }>(
      "issue-license",
      { plan: "annual", metadata: { source: "desktop-live-test-offline" } },
      true,
    );

    let service = createLicenseService();
    await service.activateLicense(issue.data.license_key);

    service = createLicenseService();
    const offlineState = await service.loadCurrentState();
    expect(offlineState).toMatchObject({ status: "OFFLINE_VALID", isLicensed: true });

    const validatedState = await service.validateCurrentState();
    expect(validatedState).toMatchObject({ status: "VALID", isLicensed: true });
  }, 20000);

  it("does not persist valid state for an invalid license", async () => {
    const service = createLicenseService();
    const state = await service.activateLicense("PI-XXXXX-XXXXX-XXXXX-XXXXX");

    expect(state).toMatchObject({ status: "INVALID", isLicensed: false });
    expect(storedState).toBeNull();
  }, 20000);

  it("clears local validity after revoke on revalidation", async () => {
    const issue = await callFunction<{ data: { license_key: string } }>(
      "issue-license",
      { plan: "annual", metadata: { source: "desktop-live-test-revoke" } },
      true,
    );

    const service = createLicenseService();
    await service.activateLicense(issue.data.license_key);
    await callFunction(
      "revoke-license",
      { license_key: issue.data.license_key, reason: "desktop_live_revoke" },
      true,
    );

    const validatedState = await service.validateCurrentState();
    expect(validatedState).toMatchObject({ status: "REVOKED", isLicensed: false });
    expect(storedState).toBeNull();
  }, 20000);

  it("invalidates the old machine after reissue and activation on another machine", async () => {
    const issue = await callFunction<{ data: { license_key: string } }>(
      "issue-license",
      { plan: "annual", metadata: { source: "desktop-live-test-reissue" } },
      true,
    );

    const service = createLicenseService();
    await service.activateLicense(issue.data.license_key);
    await callFunction(
      "reissue-license",
      { license_key: issue.data.license_key, reason: "desktop_live_reissue" },
      true,
    );

    await callFunction(
      "activate-license",
      {
        license_key: issue.data.license_key,
        machine_fingerprint: "fingerprint-live-machine-b-fedcba0987654321",
        machine_label: "Machine B",
        app_version: "0.1.0",
        os_name: "windows",
        os_version: "desktop",
      },
      false,
    );

    const validatedState = await service.validateCurrentState();
    expect(["MISMATCH", "INVALID"]).toContain(validatedState?.status);
    expect(storedState).toBeNull();
  }, 20000);

  it("falls back safely on network errors without extending trust forever", async () => {
    const issue = await callFunction<{ data: { license_key: string } }>(
      "issue-license",
      { plan: "annual", metadata: { source: "desktop-live-test-network" } },
      true,
    );

    const service = createLicenseService();
    await service.activateLicense(issue.data.license_key);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const validatedState = await service.validateCurrentState();
    fetchSpy.mockRestore();

    expect(validatedState).toMatchObject({ status: "OFFLINE_VALID", isLicensed: true });
  }, 20000);
});
