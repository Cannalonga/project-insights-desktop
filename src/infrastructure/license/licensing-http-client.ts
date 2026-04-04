import type {
  LicensingFailureDiagnostics,
  LicensingFailureReason,
  LicensingFailureStage,
  LicensingOperation,
} from "../../core/license/license-types";
import { resolveLicensingConfig } from "./licensing-config";

type HttpResult = {
  status: number;
  body: unknown;
  elapsedMs: number;
  host: string;
  operation: LicensingOperation;
};

export class LicensingHttpError extends Error {
  constructor(
    public readonly kind: "network" | "timeout" | "invalid_json",
    message: string,
    public readonly diagnostics: LicensingFailureDiagnostics,
  ) {
    super(message);
    this.name = "LicensingHttpError";
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function readErrorField(error: unknown, field: "code" | "message" | "name"): string | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildDiagnostics(
  operation: LicensingOperation,
  host: string,
  stage: LicensingFailureStage,
  classifiedReason: LicensingFailureReason,
  elapsedMs: number,
  error?: unknown,
  httpStatus?: number,
): LicensingFailureDiagnostics {
  return {
    operation,
    classifiedReason,
    rawErrorName: readErrorField(error, "name"),
    rawErrorMessage: readErrorField(error, "message"),
    rawErrorCode: readErrorField(error, "code"),
    httpStatus,
    elapsedMs: Math.round(elapsedMs),
    host,
    stage,
  };
}

function classifyTransportFailure(error: unknown): {
  kind: "network" | "timeout";
  classifiedReason: LicensingFailureReason;
  stage: LicensingFailureStage;
} {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "network", classifiedReason: "offline", stage: "connect" };
  }

  const rawName = readErrorField(error, "name")?.toLowerCase() ?? "";
  const rawMessage = readErrorField(error, "message")?.toLowerCase() ?? "";
  const rawCode = readErrorField(error, "code")?.toLowerCase() ?? "";
  const combined = `${rawName} ${rawMessage} ${rawCode}`;

  if (
    combined.includes("enotfound") ||
    combined.includes("dns") ||
    combined.includes("getaddrinfo") ||
    combined.includes("name not resolved") ||
    combined.includes("server name or address could not be resolved")
  ) {
    return { kind: "network", classifiedReason: "dns", stage: "dns" };
  }

  if (
    combined.includes("tls") ||
    combined.includes("ssl") ||
    combined.includes("certificate") ||
    combined.includes("cert_") ||
    combined.includes("handshake") ||
    combined.includes("secure connection")
  ) {
    return { kind: "network", classifiedReason: "tls", stage: "tls" };
  }

  if (
    combined.includes("proxy") ||
    combined.includes("tunnel") ||
    combined.includes("intercept") ||
    combined.includes("http2 protocol")
  ) {
    return { kind: "network", classifiedReason: "proxy_or_intercepted", stage: "tls" };
  }

  if (combined.includes("refused") || combined.includes("econnrefused")) {
    return { kind: "network", classifiedReason: "connection_refused", stage: "connect" };
  }

  if (combined.includes("timed out") || combined.includes("timeout") || combined.includes("etimedout")) {
    return { kind: "timeout", classifiedReason: "read_timeout", stage: "response" };
  }

  return { kind: "network", classifiedReason: "unknown_network", stage: "unknown" };
}

async function parseJsonSafely(
  response: Response,
  operation: LicensingOperation,
  host: string,
  elapsedMs: number,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new LicensingHttpError(
      "invalid_json",
      "Licensing backend returned invalid JSON.",
      buildDiagnostics(operation, host, "parse", "invalid_response", elapsedMs, error, response.status),
    );
  }
}

async function postJson(path: LicensingOperation, payload: unknown): Promise<HttpResult> {
  const config = resolveLicensingConfig();
  const requestUrl = new URL(`${config.functionsBaseUrl}/${path}`);
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const startedAt = nowMs();

  try {
    const response = await fetch(requestUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const elapsedMs = nowMs() - startedAt;

    return {
      status: response.status,
      body: await parseJsonSafely(response, path, requestUrl.host, elapsedMs),
      elapsedMs: Math.round(elapsedMs),
      host: requestUrl.host,
      operation: path,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LicensingHttpError(
        "timeout",
        "Licensing request timed out.",
        buildDiagnostics(path, requestUrl.host, "connect", "connect_timeout", nowMs() - startedAt, error),
      );
    }

    if (error instanceof LicensingHttpError) {
      throw error;
    }

    const classified = classifyTransportFailure(error);
    throw new LicensingHttpError(
      classified.kind,
      "Licensing request failed.",
      buildDiagnostics(
        path,
        requestUrl.host,
        classified.stage,
        classified.classifiedReason,
        nowMs() - startedAt,
        error,
      ),
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function activateLicenseRequest(licenseKey: string, machineFingerprint: string): Promise<HttpResult> {
  return postJson("activate-license", {
    license_key: licenseKey,
    machine_fingerprint: machineFingerprint,
    app_version: "0.1.0",
    os_name: "windows",
    os_version: "desktop",
  });
}

export async function validateLicenseRequest(licenseKey: string, machineFingerprint: string): Promise<HttpResult> {
  return postJson("validate-license", {
    license_key: licenseKey,
    machine_fingerprint: machineFingerprint,
  });
}
