import { invoke } from "@tauri-apps/api/tauri";

import type { LegacyStoredLicenseState, StoredLicenseState } from "../../core/license/license-types";

type LoadStateResult =
  | { status: "missing" }
  | { status: "loaded"; state: StoredLicenseState }
  | { status: "invalid" };

type StoredLicenseStateCandidate = StoredLicenseState | LegacyStoredLicenseState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyStoredLicenseState(value: unknown): value is LegacyStoredLicenseState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    typeof value.projectRef === "string" &&
    typeof value.licenseKey === "string" &&
    typeof value.machineFingerprint === "string" &&
    typeof value.activationToken === "string" &&
    value.licenseStatus === "active" &&
    value.lastValidationState === "valid" &&
    typeof value.trustedUntil === "string" &&
    typeof value.nextValidationRequiredAt === "string" &&
    typeof value.lastValidatedAt === "string"
  );
}

function isStoredLicenseState(value: unknown): value is StoredLicenseState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 2 &&
    typeof value.projectRef === "string" &&
    typeof value.licenseKey === "string" &&
    typeof value.machineFingerprint === "string" &&
    typeof value.activationCorrelationToken === "string" &&
    value.licenseStatus === "active" &&
    value.lastValidationState === "valid" &&
    typeof value.trustedUntil === "string" &&
    typeof value.nextValidationRequiredAt === "string" &&
    typeof value.lastValidatedAt === "string"
  );
}

function normalizeStoredState(value: StoredLicenseStateCandidate): StoredLicenseState {
  if (isStoredLicenseState(value)) {
    return value;
  }

  return {
    schemaVersion: 2,
    projectRef: value.projectRef,
    licenseKey: value.licenseKey,
    machineFingerprint: value.machineFingerprint,
    activationCorrelationToken: value.activationToken,
    licenseStatus: value.licenseStatus,
    lastValidationState: value.lastValidationState,
    trustedUntil: value.trustedUntil,
    nextValidationRequiredAt: value.nextValidationRequiredAt,
    lastValidatedAt: value.lastValidatedAt,
  };
}

export async function loadStoredLicensingState(): Promise<LoadStateResult> {
  try {
    const contents = await invoke<string | null>("load_licensing_state");
    if (!contents) {
      return { status: "missing" };
    }

    const parsed: unknown = JSON.parse(contents);
    if (!isStoredLicenseState(parsed) && !isLegacyStoredLicenseState(parsed)) {
      return { status: "invalid" };
    }

    return { status: "loaded", state: normalizeStoredState(parsed) };
  } catch {
    return { status: "invalid" };
  }
}

export async function saveStoredLicensingState(state: StoredLicenseState): Promise<void> {
  await invoke("save_licensing_state", { contents: JSON.stringify(state) });
}

export async function clearStoredLicensingState(): Promise<void> {
  await invoke("clear_licensing_state");
}
