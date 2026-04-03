import type { LicenseContextState, StoredLicenseState } from "../../core/license/license-types";
import { parseActivateLicenseResponse } from "../../core/license/licensing-contract";
import { nowIso } from "../../infrastructure/license/clock";
import { activateLicenseRequest, LicensingHttpError } from "../../infrastructure/license/licensing-http-client";
import { resolveLicensingConfig } from "../../infrastructure/license/licensing-config";
import { getMachineFingerprint } from "../../infrastructure/license/machine-fingerprint";
import { saveStoredLicensingState } from "../../infrastructure/license/license-state-storage";
import {
  buildBlockedState,
  buildExpiredState,
  buildInvalidLicenseServerState,
  buildMismatchState,
  buildRevokedState,
  buildValidState,
} from "./resolve-license-state";

export class LicenseActivationError extends Error {
  constructor(
    public readonly code: "invalid_input" | "network" | "timeout" | "invalid_json" | "config" | "unexpected",
    message: string,
  ) {
    super(message);
    this.name = "LicenseActivationError";
  }
}

function normalizeLicenseKey(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  if (!/^PI-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalized)) {
    throw new LicenseActivationError("invalid_input", "A licen?a informada n?o est? no formato esperado.");
  }

  return normalized;
}

function mapDeniedState(reason: string): LicenseContextState {
  switch (reason) {
    case "revoked":
      return buildRevokedState();
    case "blocked":
      return buildBlockedState();
    case "expired":
      return buildExpiredState();
    case "license_already_bound":
      return buildMismatchState();
    case "invalid_license":
    case "rate_limited":
    default:
      return buildInvalidLicenseServerState();
  }
}

function buildStoredLicenseState(
  licenseKey: string,
  machineFingerprint: string,
  activationCorrelationToken: string,
  trustedUntil: string,
  nextValidationRequiredAt: string,
): StoredLicenseState {
  return {
    schemaVersion: 2,
    projectRef: resolveLicensingConfig().projectRef,
    licenseKey,
    machineFingerprint,
    activationCorrelationToken,
    licenseStatus: "active",
    lastValidationState: "valid",
    trustedUntil,
    nextValidationRequiredAt,
    lastValidatedAt: nowIso(),
  };
}

export async function activateLicense(licenseKeyInput: string): Promise<LicenseContextState> {
  const licenseKey = normalizeLicenseKey(licenseKeyInput);
  const machineFingerprint = await getMachineFingerprint();

  try {
    const response = await activateLicenseRequest(licenseKey, machineFingerprint);
    const parsed = parseActivateLicenseResponse(response.body);

    if (!parsed.approved) {
      return mapDeniedState(parsed.reason);
    }

    await saveStoredLicensingState(
      buildStoredLicenseState(
        licenseKey,
        machineFingerprint,
        parsed.activationCorrelationToken,
        parsed.trustedUntil,
        parsed.nextValidationRequiredAt,
      ),
    );

    return buildValidState(parsed.trustedUntil, parsed.nextValidationRequiredAt);
  } catch (error) {
    if (error instanceof LicensingHttpError) {
      throw new LicenseActivationError(error.kind, "N?o foi poss?vel ativar a licen?a agora.");
    }

    if (error instanceof LicenseActivationError) {
      throw error;
    }

    throw new LicenseActivationError("unexpected", "Falha inesperada ao ativar a licen?a.");
  }
}
