import type { LicenseValidationState } from "../../core/license/license-types";

type JsonRecord = Record<string, unknown>;

type RawApiSuccess = {
  success: true;
  code: string;
  data: JsonRecord;
};

type RawApiFailure = {
  success: false;
  code: string;
  error: {
    message: string;
  };
};

export type ActivateLicenseApproved = {
  approved: true;
  reason: "first_activation" | "already_active_same_machine";
  licenseStatus: "active";
  activation: {
    activationId: string;
    machineFingerprint: string;
    firstActivatedAt: string;
  };
  // Correlation token returned by the backend for compatibility and traceability.
  // It does not authorize the desktop locally in the current model.
  activationCorrelationToken: string;
  trustedUntil: string;
  nextValidationRequiredAt: string;
};

export type ActivateLicenseDenied = {
  approved: false;
  reason:
    | "invalid_license"
    | "expired"
    | "revoked"
    | "blocked"
    | "license_already_bound"
    | "rate_limited";
  licenseStatus: string;
};

export type ActivateLicenseResponse = ActivateLicenseApproved | ActivateLicenseDenied;

export type ValidateLicenseResponse = {
  state: LicenseValidationState;
  reason: string;
  licenseStatus: string;
  trustedUntil: string | null;
  nextValidationRequiredAt: string | null;
};

export class LicensingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingContractError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LicensingContractError(`Missing string field: ${key}`);
  }

  return value;
}

function getOptionalString(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new LicensingContractError(`Invalid optional string field: ${key}`);
  }

  return value;
}

function getBoolean(record: JsonRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new LicensingContractError(`Missing boolean field: ${key}`);
  }

  return value;
}

function parseApiEnvelope(input: unknown): RawApiSuccess | RawApiFailure {
  if (!isRecord(input) || typeof input.code !== "string" || typeof input.success !== "boolean") {
    throw new LicensingContractError("Invalid API envelope.");
  }

  if (input.success) {
    if (!isRecord(input.data)) {
      throw new LicensingContractError("Success response missing data payload.");
    }

    return {
      success: true,
      code: input.code,
      data: input.data,
    };
  }

  if (!isRecord(input.error) || typeof input.error.message !== "string") {
    throw new LicensingContractError("Failure response missing error payload.");
  }

  return {
    success: false,
    code: input.code,
    error: {
      message: input.error.message,
    },
  };
}

export function parseActivateLicenseResponse(input: unknown): ActivateLicenseResponse {
  const envelope = parseApiEnvelope(input);
  if (!envelope.success) {
    throw new LicensingContractError(`Activation endpoint returned failure envelope: ${envelope.code}`);
  }

  const approved = getBoolean(envelope.data, "approved");
  const reason = getString(envelope.data, "reason");
  const licenseStatus = getString(envelope.data, "license_status");

  if (!approved) {
    return {
      approved: false,
      reason: reason as ActivateLicenseDenied["reason"],
      licenseStatus,
    };
  }

  const activationRaw = envelope.data.activation;
  if (!isRecord(activationRaw)) {
    throw new LicensingContractError("Activation response missing activation object.");
  }

  return {
    approved: true,
    reason: reason as ActivateLicenseApproved["reason"],
    licenseStatus: "active",
    activation: {
      activationId: getString(activationRaw, "activation_id"),
      machineFingerprint: getString(activationRaw, "machine_fingerprint"),
      firstActivatedAt: getString(activationRaw, "first_activated_at"),
    },
    activationCorrelationToken: getString(envelope.data, "activation_token"),
    trustedUntil: getString(envelope.data, "trusted_until"),
    nextValidationRequiredAt: getString(envelope.data, "next_validation_required_at"),
  };
}

export function parseValidateLicenseResponse(input: unknown): ValidateLicenseResponse {
  const envelope = parseApiEnvelope(input);
  if (!envelope.success) {
    throw new LicensingContractError(`Validate endpoint returned failure envelope: ${envelope.code}`);
  }

  return {
    state: getString(envelope.data, "state") as LicenseValidationState,
    reason: getString(envelope.data, "reason"),
    licenseStatus: getString(envelope.data, "license_status"),
    trustedUntil: getOptionalString(envelope.data, "trusted_until"),
    nextValidationRequiredAt: getOptionalString(envelope.data, "next_validation_required_at"),
  };
}
