export type LicensePlan = "semiannual" | "annual";

export type PersistedLicenseFile = {
  payload: {
    customerName: string;
    licenseId: string;
    plan: LicensePlan;
    issuedAt: string;
    expiresAt: string;
  };
  signature: string;
};

export type VerifiedLicensePayload = PersistedLicenseFile["payload"];

export type LicenseValidationState =
  | "valid"
  | "revoked"
  | "expired"
  | "blocked"
  | "mismatch"
  | "invalid_license";

export type LicensingOperation = "activate-license" | "validate-license";

export type LicensingFailureStage = "dns" | "tls" | "connect" | "response" | "parse" | "unknown";

export type LicensingFailureReason =
  | "dns"
  | "tls"
  | "connect_timeout"
  | "read_timeout"
  | "connection_refused"
  | "proxy_or_intercepted"
  | "http_4xx"
  | "http_5xx"
  | "invalid_response"
  | "offline"
  | "unknown_network";

export type LicensingFailureDiagnostics = {
  operation: LicensingOperation;
  classifiedReason: LicensingFailureReason;
  rawErrorName?: string;
  rawErrorMessage?: string;
  rawErrorCode?: string;
  httpStatus?: number;
  elapsedMs?: number;
  host?: string;
  stage: LicensingFailureStage;
};

export const LICENSE_CLIENT_STATES = {
  NO_LICENSE: "NO_LICENSE",
  ACTIVATING: "ACTIVATING",
  VALID: "VALID",
  OFFLINE_VALID: "OFFLINE_VALID",
  INVALID: "INVALID",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
  MISMATCH: "MISMATCH",
  BLOCKED: "BLOCKED",
  ERROR: "ERROR",
} as const;

export type LicenseStatus = (typeof LICENSE_CLIENT_STATES)[keyof typeof LICENSE_CLIENT_STATES];

export type LicenseContextState = {
  status: LicenseStatus;
  isLicensed: boolean;
  message: string;
  source: "local" | "remote";
  diagnostics?: LicensingFailureDiagnostics;
  daysRemaining?: number;
  plan?: LicensePlan;
  customerName?: string;
  licenseId?: string;
  issuedAt?: string;
  expiresAt?: string;
  trustedUntil?: string;
  nextValidationRequiredAt?: string;
  lastValidatedAt?: string;
};

export type StoredLicenseState = {
  schemaVersion: 2;
  projectRef: string;
  licenseKey: string;
  machineFingerprint: string;
  // Correlation metadata only. It is not authoritative and is not required by
  // validate-license in the current model.
  activationCorrelationToken: string;
  licenseStatus: "active";
  lastValidationState: "valid";
  trustedUntil: string;
  nextValidationRequiredAt: string;
  lastValidatedAt: string;
};

export type LegacyStoredLicenseState = {
  schemaVersion: 1;
  projectRef: string;
  licenseKey: string;
  machineFingerprint: string;
  activationToken: string;
  licenseStatus: "active";
  lastValidationState: "valid";
  trustedUntil: string;
  nextValidationRequiredAt: string;
  lastValidatedAt: string;
};

export type PremiumFeature =
  | "export_csv"
  | "export_power_bi_package"
  | "export_structured_xml"
  | "export_machine_json"
  | "export_executive_report"
  | "executive_full_view"
  | "recovery_full"
  | "comparison_task_lists"
  | "trend_curve_detail";
