import { LicensingContractError, parseValidateLicenseResponse } from "../../core/license/licensing-contract";
import type {
  LicenseContextState,
  LicensingFailureDiagnostics,
  LicensingFailureReason,
  StoredLicenseState,
} from "../../core/license/license-types";
import { nowIso } from "../../infrastructure/license/clock";
import { resolveLicensingConfig } from "../../infrastructure/license/licensing-config";
import { LicensingHttpError, validateLicenseRequest } from "../../infrastructure/license/licensing-http-client";
import { getMachineFingerprint } from "../../infrastructure/license/machine-fingerprint";
import { saveStoredLicensingState } from "../../infrastructure/license/license-state-storage";
import { clearInvalidLicenseState } from "./clear-invalid-license-state";
import {
  buildBlockedState,
  buildErrorState,
  buildExpiredState,
  buildInvalidLicenseServerState,
  buildMismatchState,
  buildNetworkErrorState,
  buildNetworkFallbackState,
  buildRevokedState,
  buildUnexpectedResponseErrorState,
  buildValidState,
  buildValidationRequiredErrorState,
} from "./resolve-license-state";

function rebuildStoredState(
  storedState: StoredLicenseState,
  trustedUntil: string,
  nextValidationRequiredAt: string,
): StoredLicenseState {
  return {
    ...storedState,
    projectRef: resolveLicensingConfig().projectRef,
    trustedUntil,
    nextValidationRequiredAt,
    lastValidatedAt: nowIso(),
    lastValidationState: "valid",
  };
}

function hasOfflineTrust(storedState: StoredLicenseState): boolean {
  return Boolean(storedState.trustedUntil) && Date.parse(storedState.trustedUntil) > Date.now();
}

function diagnosticsFromResponse(
  operation: "activate-license" | "validate-license",
  host: string,
  elapsedMs: number,
  status: number,
  classifiedReason: LicensingFailureReason = status >= 500 ? "http_5xx" : "http_4xx",
): LicensingFailureDiagnostics {
  return {
    operation,
    classifiedReason,
    httpStatus: status,
    elapsedMs,
    host,
    stage: "response",
  };
}

export async function validateLicense(storedState: StoredLicenseState): Promise<LicenseContextState> {
  const machineFingerprint = await getMachineFingerprint();
  if (machineFingerprint !== storedState.machineFingerprint) {
    await clearInvalidLicenseState();
    return buildMismatchState();
  }

  try {
    const response = await validateLicenseRequest(storedState.licenseKey, machineFingerprint);

    if (response.status >= 500) {
      const diagnostics = diagnosticsFromResponse(
        response.operation,
        response.host,
        response.elapsedMs,
        response.status,
      );

      if (hasOfflineTrust(storedState)) {
        return buildNetworkFallbackState(
          storedState.trustedUntil,
          storedState.nextValidationRequiredAt,
          "server",
          diagnostics,
        );
      }

      return buildNetworkErrorState("server", diagnostics);
    }

    const parsed = parseValidateLicenseResponse(response.body);

    switch (parsed.state) {
      case "valid":
        if (!parsed.trustedUntil || !parsed.nextValidationRequiredAt) {
          return buildUnexpectedResponseErrorState(
            diagnosticsFromResponse(
              response.operation,
              response.host,
              response.elapsedMs,
              response.status,
              "invalid_response",
            ),
          );
        }

        await saveStoredLicensingState(
          rebuildStoredState(storedState, parsed.trustedUntil, parsed.nextValidationRequiredAt),
        );
        return buildValidState(parsed.trustedUntil, parsed.nextValidationRequiredAt);
      case "revoked":
        await clearInvalidLicenseState();
        return buildRevokedState();
      case "blocked":
        await clearInvalidLicenseState();
        return buildBlockedState();
      case "expired":
        await clearInvalidLicenseState();
        return buildExpiredState();
      case "mismatch":
        await clearInvalidLicenseState();
        return buildMismatchState();
      case "invalid_license":
        await clearInvalidLicenseState();
        return buildInvalidLicenseServerState();
      default:
        await clearInvalidLicenseState();
        return buildErrorState(
          "O servidor retornou um estado de licenca desconhecido. Tente novamente. Se o problema continuar, contate o suporte.",
          "remote",
          {
            diagnostics: diagnosticsFromResponse(
              response.operation,
              response.host,
              response.elapsedMs,
              response.status,
              "invalid_response",
            ),
          },
        );
    }
  } catch (error) {
    if (error instanceof LicensingHttpError) {
      if (hasOfflineTrust(storedState) && (error.kind === "network" || error.kind === "timeout")) {
        return buildNetworkFallbackState(
          storedState.trustedUntil,
          storedState.nextValidationRequiredAt,
          error.kind,
          error.diagnostics,
        );
      }

      if (error.kind === "invalid_json") {
        return buildUnexpectedResponseErrorState(error.diagnostics);
      }

      return buildNetworkErrorState(error.kind === "timeout" ? "timeout" : "network", error.diagnostics);
    }

    if (error instanceof LicensingContractError) {
      return buildUnexpectedResponseErrorState({
        operation: "validate-license",
        classifiedReason: "invalid_response",
        rawErrorName: error.name,
        rawErrorMessage: error.message,
        elapsedMs: 0,
        stage: "parse",
      });
    }

    if (hasOfflineTrust(storedState)) {
      return buildOfflineValidationError(storedState);
    }

    return buildValidationRequiredErrorState();
  }
}

function buildOfflineValidationError(storedState: StoredLicenseState): LicenseContextState {
  return buildErrorState(
    "Nao foi possivel concluir a validacao online agora. Tente novamente com internet estavel antes do prazo offline terminar.",
    "local",
    {
      trustedUntil: storedState.trustedUntil,
      nextValidationRequiredAt: storedState.nextValidationRequiredAt,
    },
  );
}
