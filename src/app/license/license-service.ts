import type { LicenseContextState } from "../../core/license/license-types";
import { activateLicense, LicenseActivationError } from "./activate-license";
import { clearInvalidLicenseState } from "./clear-invalid-license-state";
import { loadStoredLicenseState } from "./load-stored-license-state";
import { validateLicense } from "./validate-license";

export type LicenseService = {
  loadCurrentState: () => Promise<LicenseContextState>;
  activateLicense: (licenseKey: string) => Promise<LicenseContextState>;
  validateCurrentState: () => Promise<LicenseContextState | null>;
  clearInvalidLicenseState: () => Promise<void>;
};

export { LicenseActivationError };

export function createLicenseService(): LicenseService {
  return {
    async loadCurrentState(): Promise<LicenseContextState> {
      const loaded = await loadStoredLicenseState();
      return loaded.context;
    },

    async activateLicense(licenseKey: string): Promise<LicenseContextState> {
      return activateLicense(licenseKey);
    },

    async validateCurrentState(): Promise<LicenseContextState | null> {
      const loaded = await loadStoredLicenseState();
      if (!loaded.storedState) {
        return null;
      }

      return validateLicense(loaded.storedState);
    },

    async clearInvalidLicenseState(): Promise<void> {
      await clearInvalidLicenseState();
    },
  };
}
