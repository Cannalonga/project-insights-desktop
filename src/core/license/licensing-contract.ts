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

const ACTIVATE_APPROVED_REASONS = ["first_activation", "already_active_same_machine"] as const;
const ACTIVATE_DENIED_REASONS = [
  "invalid_license",
  "expired",
  "revoked",
  "blocked",
  "license_already_bound",
  "rate_limited",
] as const;
const VALIDATE_STATES: LicenseValidationState[] = [
  "valid",
  "revoked",
  "expired",
  "blocked",
  "mismatch",
  "invalid_license",
];

export type ActivateLicenseApproved = {
  approved: true;
  reason: (typeof ACTIVATE_APPROVED_REASONS)[number];
  licenseStatus: "active";
  expiresAt: string | null;
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
  reason: (typeof ACTIVATE_DENIED_REASONS)[number];
  licenseStatus: string;
  expiresAt: string | null;
};

export type ActivateLicenseResponse = ActivateLicenseApproved | ActivateLicenseDenied;

export type ValidateLicenseResponse = {
  state: LicenseValidationState;
  reason: string;
  licenseStatus: string;
  expiresAt: string | null;
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

function expectOneOf<T extends readonly string[]>(value: string, allowed: T, key: string): T[number] {
  if (!allowed.includes(value)) {
    throw new LicensingContractError(`Unexpected ${key}: ${value}`);
  }

  return value as T[number];
}

function expectValidationState(value: string): LicenseValidationState {
  if (!VALIDATE_STATES.includes(value as LicenseValidationState)) {
    throw new LicensingContractError(`Unexpected validation state: ${value}`);
  }

  return value as LicenseValidationState;
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
      reason: expectOneOf(reason, ACTIVATE_DENIED_REASONS, "activation denial reason"),
      licenseStatus,
      expiresAt: getOptionalString(envelope.data, "expires_at"),
    };
  }

  const activationRaw = envelope.data.activation;
  if (!isRecord(activationRaw)) {
    throw new LicensingContractError("Activation response missing activation object.");
  }

  return {
    approved: true,
    reason: expectOneOf(reason, ACTIVATE_APPROVED_REASONS, "activation approval reason"),
    licenseStatus: "active",
    expiresAt: getOptionalString(envelope.data, "expires_at"),
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
    state: expectValidationState(getString(envelope.data, "state")),
    reason: getString(envelope.data, "reason"),
    licenseStatus: getString(envelope.data, "license_status"),
    expiresAt: getOptionalString(envelope.data, "expires_at"),
    trustedUntil: getOptionalString(envelope.data, "trusted_until"),
    nextValidationRequiredAt: getOptionalString(envelope.data, "next_validation_required_at"),
  };
}
