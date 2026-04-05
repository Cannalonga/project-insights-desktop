import type { LicenseContextState, StoredLicenseState } from "../../core/license/license-types";
import { isFutureIso } from "../../infrastructure/license/clock";
import { resolveLicensingConfig } from "../../infrastructure/license/licensing-config";
import { loadStoredLicensingState } from "../../infrastructure/license/license-state-storage";
import { getMachineFingerprint } from "../../infrastructure/license/machine-fingerprint";
import { clearInvalidLicenseState } from "./clear-invalid-license-state";
import {
  buildErrorState,
  buildInvalidState,
  buildMismatchState,
  buildNoLicenseState,
  buildOfflineValidState,
  buildValidationRequiredErrorState,
} from "./resolve-license-state";

export type LoadedStoredLicenseState = {
  context: LicenseContextState;
  storedState: StoredLicenseState | null;
};

export async function loadStoredLicenseState(): Promise<LoadedStoredLicenseState> {
  const stored = await loadStoredLicensingState();

  if (stored.status === "missing") {
    return {
      context: buildNoLicenseState(),
      storedState: null,
    };
  }

  if (stored.status === "invalid") {
    await clearInvalidLicenseState();
    return {
      context: buildInvalidState("O estado salvo da licença não pôde ser lido com segurança."),
      storedState: null,
    };
  }

  const config = resolveLicensingConfig();
  if (stored.state.projectRef !== config.projectRef) {
    await clearInvalidLicenseState();
    return {
      context: buildErrorState(
        "O estado local da licença aponta para um ambiente incorreto. Ative a licença novamente nesta instalação.",
      ),
      storedState: null,
    };
  }

  const currentFingerprint = await getMachineFingerprint();
  if (currentFingerprint !== stored.state.machineFingerprint) {
    await clearInvalidLicenseState();
    return {
      context: buildMismatchState(),
      storedState: null,
    };
  }

  if (isFutureIso(stored.state.trustedUntil)) {
    return {
      context: buildOfflineValidState(stored.state.trustedUntil, stored.state.nextValidationRequiredAt, stored.state.expiresAt),
      storedState: stored.state,
    };
  }

  return {
    context: buildValidationRequiredErrorState(),
    storedState: stored.state,
  };
}

