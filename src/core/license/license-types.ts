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

export type LicenseStatus = "missing" | "valid" | "expired" | "invalid";

export type LicenseContextState = {
  status: LicenseStatus;
  isLicensed: boolean;
  daysRemaining?: number;
  plan?: LicensePlan;
  customerName?: string;
  licenseId?: string;
  issuedAt?: string;
  expiresAt?: string;
  message: string;
};

export type PremiumFeature =
  | "export_csv"
  | "export_power_bi_package"
  | "export_structured_xml"
  | "export_machine_json"
  | "export_executive_report"
  | "executive_full_view"
  | "recovery_full";
