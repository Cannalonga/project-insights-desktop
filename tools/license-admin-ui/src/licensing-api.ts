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
