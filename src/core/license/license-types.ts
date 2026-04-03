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

export type LicenseStatus =
  | "missing"
  | "valid"
  | "offline_valid"
  | "expired"
  | "invalid"
  | "invalid_license"
  | "revoked"
  | "blocked"
  | "mismatch"
  | "validation_required";

export type LicenseContextState = {
  status: LicenseStatus;
  isLicensed: boolean;
  message: string;
  source: "local" | "remote";
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
  | "recovery_full";
