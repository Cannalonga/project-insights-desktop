import { invoke } from "@tauri-apps/api/tauri";

import type {
  LicensePlan,
  PersistedLicenseFile,
  VerifiedLicensePayload,
} from "../../core/license/license-types";

type VerifyLicenseCommandResult = {
  payload: VerifiedLicensePayload;
};

const VALID_PLANS: LicensePlan[] = ["semiannual", "annual"];

export class LicenseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseVerificationError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLicenseFile(contents: string): PersistedLicenseFile {
  try {
    return JSON.parse(contents) as PersistedLicenseFile;
  } catch {
    throw new LicenseVerificationError("Licenca em formato invalido.");
  }
}

function validatePayloadShape(file: PersistedLicenseFile): void {
  const { payload, signature } = file;

  if (!isObject(file) || !isObject(payload) || typeof signature !== "string" || signature.trim().length === 0) {
    throw new LicenseVerificationError("Licenca em formato invalido.");
  }

  if (
    typeof payload.customerName !== "string" ||
    typeof payload.licenseId !== "string" ||
    typeof payload.plan !== "string" ||
    typeof payload.issuedAt !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new LicenseVerificationError("Licenca em formato invalido.");
  }

  if (
    !payload.customerName.trim() ||
    !payload.licenseId.trim() ||
    !payload.issuedAt.trim() ||
    !payload.expiresAt.trim() ||
    !VALID_PLANS.includes(payload.plan as LicensePlan)
  ) {
    throw new LicenseVerificationError("Licenca em formato invalido.");
  }
}

export async function verifyLicense(contents: string): Promise<VerifiedLicensePayload> {
  const file = parseLicenseFile(contents);
  validatePayloadShape(file);

  try {
    const result = await invoke<VerifyLicenseCommandResult>("verify_license_signature", {
      contents,
    });
    return result.payload;
  } catch {
    throw new LicenseVerificationError("Licenca invalida ou corrompida.");
  }
}
