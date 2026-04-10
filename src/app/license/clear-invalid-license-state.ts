import { clearStoredLicensingState } from "../../infrastructure/license/license-state-storage";

export async function clearInvalidLicenseState(): Promise<void> {
  await clearStoredLicensingState();
}
