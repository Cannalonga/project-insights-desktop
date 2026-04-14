import { invoke } from "@tauri-apps/api/tauri";
import { LicensingAdminConfig } from "./licensing-config";

export type IssueLicensePayload = {
  plan: string;
  expires_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RevokeLicensePayload = {
  license_key: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
};

export type ReissueLicensePayload = {
  license_key: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
};

export type IssueLicenseData = {
  license_id: string;
  license_key: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
};

export type RevokeLicenseData = {
  license_id: string;
  license_key: string;
  license_status: string;
  activation_status: string | null;
  revoked_at: string | null;
  reason: string;
};

export type ReissueLicenseData = {
  license_id: string;
  license_key: string;
  license_status: string;
  previous_activation_status: string | null;
  previous_activation_id?: string | null;
  previous_machine_fingerprint?: string | null;
  reissue_count: number;
  ready_for_new_activation: boolean;
  reissued_at?: string | null;
};

export type LicenseCatalogRecord = {
  license_id: string;
  customer_name: string;
  email?: string | null;
  plan: string;
  expiration_date: string;
  issued_at: string;
  license_hash: string;
  license_json: string;
  license_preview?: {
    license_id: string;
    customer_name: string;
    plan: string;
    expiration_date: string;
  } | null;
  schema_version?: number | null;
  notes?: string | null;
  created_at: string;
};

type ApiSuccess<T> = {
  success: true;
  code: string;
  data: T;
};

type ApiFailure = {
  success: false;
  code: string;
  error: {
    message: string;
  };
};

type ProxyAdminResponse = {
  status: number;
  body: string;
};

type LicensingBackendStatus = {
  adminTokenConfigured: boolean;
};

type CatalogCleanupResult = {
  removedCount: number;
  remainingCount: number;
};

export class AdminApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

export async function issueLicense(config: LicensingAdminConfig, payload: IssueLicensePayload) {
  return postJson<IssueLicenseData>(config, "issue-license", payload);
}

export async function revokeLicense(config: LicensingAdminConfig, payload: RevokeLicensePayload) {
  return postJson<RevokeLicenseData>(config, "revoke-license", payload);
}

export async function reissueLicense(config: LicensingAdminConfig, payload: ReissueLicensePayload) {
  return postJson<ReissueLicenseData>(config, "reissue-license", payload);
}

export async function getLicensingBackendStatus() {
  return invoke<LicensingBackendStatus>("get_licensing_backend_status");
}

export async function loadLicenseCatalog() {
  const raw = await invoke<string>("load_license_catalog");

  try {
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.map(normalizeCatalogRecord).filter(Boolean) as LicenseCatalogRecord[] : [];
  } catch {
    throw new AdminApiError("invalid_catalog_response", "Catalogo local retornou JSON invalido.", 0);
  }
}

export async function saveLicenseCatalogRecord(record: LicenseCatalogRecord) {
  try {
    await invoke("save_license_record", {
      record: JSON.stringify(record),
    });
  } catch (error) {
    throw parseInvokeError(error);
  }
}

export async function removeLicenseCatalogRecords(licenseIds: string[]) {
  try {
    const raw = await invoke<string>("remove_license_catalog_records", {
      licenseIds,
    });

    const parsed = JSON.parse(raw) as CatalogCleanupResult;
    return parsed;
  } catch (error) {
    throw parseInvokeError(error);
  }
}

async function postJson<T>(config: LicensingAdminConfig, path: string, payload: unknown) {
  try {
    const response = await invoke<ProxyAdminResponse>("proxy_licensing_admin_request", {
      input: JSON.stringify({
        functionsBaseUrl: config.functionsBaseUrl,
        anonKey: config.anonKey,
        timeoutMs: config.timeoutMs,
        path,
        payload,
      }),
    });

    const parsed = parseEnvelope<T>(response.body);

    if (response.status < 200 || response.status >= 300 || !parsed.success) {
      const code = parsed.success ? "unexpected_success_shape" : parsed.code;
      const message = parsed.success ? "Resposta invalida do backend." : parsed.error.message;
      throw new AdminApiError(code, message, response.status);
    }

    return parsed;
  } catch (error) {
    if (error instanceof AdminApiError) {
      throw error;
    }

    throw parseInvokeError(error);
  }
}

function parseEnvelope<T>(raw: string): ApiSuccess<T> | ApiFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AdminApiError("invalid_response", "Backend respondeu com JSON invalido.", 0);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AdminApiError("invalid_response", "Backend respondeu com payload invalido.", 0);
  }

  if ((parsed as { success?: unknown }).success === true) {
    const success = parsed as ApiSuccess<T>;
    if (typeof success.code !== "string" || !("data" in success)) {
      throw new AdminApiError("invalid_response", "Resposta de sucesso do backend esta incompleta.", 0);
    }
    return success;
  }

  if ((parsed as { success?: unknown }).success === false) {
    const failure = parsed as ApiFailure;
    if (typeof failure.code !== "string" || !failure.error || typeof failure.error.message !== "string") {
      throw new AdminApiError("invalid_response", "Resposta de erro do backend esta incompleta.", 0);
    }
    return failure;
  }

  throw new AdminApiError("invalid_response", "Backend respondeu com envelope desconhecido.", 0);
}

function parseInvokeError(error: unknown) {
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error) as { code?: string; message?: string };
      if (typeof parsed.code === "string" && typeof parsed.message === "string") {
        return new AdminApiError(parsed.code, parsed.message, 0);
      }
    } catch {
      return new AdminApiError("network_error", error, 0);
    }

    return new AdminApiError("network_error", error, 0);
  }

  if (error instanceof Error) {
    return new AdminApiError("network_error", error.message || "Falha de rede ao chamar o backend.", 0);
  }

  return new AdminApiError("network_error", "Falha de rede ao chamar o backend.", 0);
}

function normalizeCatalogRecord(record: unknown): LicenseCatalogRecord | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const source = record as Record<string, unknown>;
  const licenseId = readString(source, ["license_id", "licenseId"]) ?? readString(source, ["license_hash", "licenseHash"]);
  const customerName = readString(source, ["customer_name", "customerName"]) ?? "";
  const email = readNullableString(source, ["email", "customer_email", "customerEmail"]);
  const plan = readString(source, ["plan"]) ?? "";
  const expirationDate = readString(source, ["expiration_date", "expirationDate"]) ?? "";
  const issuedAt = readString(source, ["issued_at", "issuedAt"]) ?? "";
  const licenseHash = readString(source, ["license_hash", "licenseHash"]) ?? "";
  const licenseJson = readString(source, ["license_json", "licenseJson"]) ?? "";
  const createdAt =
    readString(source, ["created_at", "createdAt"]) ??
    readString(source, ["issued_at", "issuedAt"]) ??
    "";

  const previewSource = source.license_preview ?? source.licensePreview;
  const preview =
    previewSource && typeof previewSource === "object"
      ? {
          license_id: readString(previewSource as Record<string, unknown>, ["license_id", "licenseId"]) ?? licenseId ?? "",
          customer_name:
            readString(previewSource as Record<string, unknown>, ["customer_name", "customerName"]) ?? customerName,
          plan: readString(previewSource as Record<string, unknown>, ["plan"]) ?? plan,
          expiration_date:
            readString(previewSource as Record<string, unknown>, ["expiration_date", "expirationDate"]) ??
            expirationDate,
        }
      : null;

  return {
    license_id: licenseId ?? "",
    customer_name: customerName,
    email,
    plan,
    expiration_date: expirationDate,
    issued_at: issuedAt,
    license_hash: licenseHash,
    license_json: licenseJson,
    license_preview: preview,
    schema_version: readNumber(source, ["schema_version", "schemaVersion"]),
    notes: readNullableString(source, ["notes"]),
    created_at: createdAt,
  };
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return null;
}

function readNullableString(record: Record<string, unknown>, keys: string[]) {
  const value = readString(record, keys);
  return value ?? null;
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}
