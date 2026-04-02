import { loadLicense } from "./load-license";
import {
  buildInvalidState,
  buildMissingState,
  resolveLicenseState,
} from "./resolve-license-state";
import { saveLicense } from "./save-license";
import { verifyLicense } from "./verify-license";
import type { LicenseContextState } from "../../core/license/license-types";

export type LicenseService = {
  loadCurrentState: () => Promise<LicenseContextState>;
  importLicense: (contents: string) => Promise<LicenseContextState>;
};

export function createLicenseService(): LicenseService {
  return {
    async loadCurrentState(): Promise<LicenseContextState> {
      const stored = await loadLicense();

      if (stored.status === "missing") {
        return buildMissingState();
      }

      if (stored.status === "invalid") {
        return buildInvalidState();
      }

      try {
        const payload = await verifyLicense(stored.contents);
        return resolveLicenseState(payload);
      } catch {
        return buildInvalidState();
      }
    },

    async importLicense(contents: string): Promise<LicenseContextState> {
      const payload = await verifyLicense(contents);
      await saveLicense(contents);
      return resolveLicenseState(payload);
    },
  };
}
