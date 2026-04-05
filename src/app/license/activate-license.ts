import { LicensingContractError, parseActivateLicenseResponse } from "../../core/license/licensing-contract";
import type {
  LicenseContextState,
  LicensingFailureDiagnostics,
  LicensingFailureReason,
  LicensingFailureStage,
  StoredLicenseState,
} from "../../core/license/license-types";
import { appendOperationalLog } from "../use-cases/app-log";
import { nowIso } from "../../infrastructure/license/clock";
import { activateLicenseRequest, LicensingHttpError } from "../../infrastructure/license/licensing-http-client";
import { LicensingConfigError, resolveLicensingConfig } from "../../infrastructure/license/licensing-config";
import { getMachineFingerprint } from "../../infrastructure/license/machine-fingerprint";
import { saveStoredLicensingState } from "../../infrastructure/license/license-state-storage";
import {
  buildBlockedState,
  buildErrorState,
  buildExpiredState,
  buildInvalidLicenseServerState,
  buildMismatchState,
  buildRevokedState,
  buildUnexpectedResponseErrorState,
  buildValidState,
} from "./resolve-license-state";

export class LicenseActivationError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "network"
      | "timeout"
      | "server"
      | "invalid_response"
      | "config"
      | "unexpected",
    message: string,
    public readonly diagnostics?: LicensingFailureDiagnostics,
  ) {
    super(message);
    this.name = "LicenseActivationError";
  }
}

const LICENSING_BUILD_VERSION = "0.1.0";

function readUnknownStringField(error: unknown, field: "name" | "message" | "code"): string | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function resolveLicensingHostSafely(): string | undefined {
  try {
    return new URL(resolveLicensingConfig().functionsBaseUrl).host;
  } catch {
    return undefined;
  }
}

function buildUnexpectedDiagnostics(error: unknown, stage: LicensingFailureStage = "unknown"): LicensingFailureDiagnostics {
  return {
    operation: "activate-license",
    rawErrorName: readUnknownStringField(error, "name"),
    rawErrorMessage: readUnknownStringField(error, "message"),
    rawErrorCode: readUnknownStringField(error, "code"),
    host: resolveLicensingHostSafely(),
    stage,
  };
}

async function logActivationCheckpoint(
  stage: LicensingFailureStage,
  outcome: "success" | "failure" = "success",
  fields: Partial<LicensingFailureDiagnostics> & {
    rawErrorName?: string;
    rawErrorMessage?: string;
    rawErrorCode?: string;
    message?: string;
  } = {},
): Promise<void> {
  await appendOperationalLog({
    timestamp: nowIso(),
    event: "license_apply_checkpoint",
    action: "apply_license",
    outcome,
    source: "paste",
    operation: "activate-license",
    stage,
    classifiedReason: fields.classifiedReason,
    rawErrorName: fields.rawErrorName,
    rawErrorMessage: fields.rawErrorMessage,
    rawErrorCode: fields.rawErrorCode,
    httpStatus: fields.httpStatus,
    elapsedMs: fields.elapsedMs,
    host: fields.host,
    message: fields.message,
    buildVersion: LICENSING_BUILD_VERSION,
  });
}

function normalizeLicenseKey(raw: string): string {
  const normalized = raw.trim().toUpperCase();
  if (!/^PI-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalized)) {
    throw new LicenseActivationError(
      "invalid_input",
      "Licenca invalida. Verifique o codigo digitado e tente novamente.",
    );
  }

  return normalized;
}

function buildConnectivityMessage(reason: LicensingFailureReason): string {
  switch (reason) {
    case "dns":
      return "Falha ao localizar o servico de licenciamento. Verifique internet, DNS ou liberacao de dominio.";
    case "tls":
      return "Falha na conexao segura com o servico de licenciamento. Verifique certificado, proxy ou inspecao TLS.";
    case "proxy_or_intercepted":
      return "A conexao com o servico de licenciamento parece estar sendo interceptada por proxy ou filtro de rede.";
    case "connect_timeout":
    case "read_timeout":
      return "Tempo limite excedido ao contatar o servico de licenciamento. Tente novamente com conexao estavel.";
    case "connection_refused":
      return "O servico de licenciamento recusou a conexao. Verifique a rede e tente novamente.";
    case "http_5xx":
      return "O servico de licenciamento respondeu com erro temporario. Tente novamente em alguns minutos.";
    case "http_4xx":
      return "O servico de licenciamento rejeitou a requisicao. Revise a configuracao e tente novamente.";
    case "invalid_response":
      return "Resposta invalida do servico de licenciamento. Tente novamente. Se persistir, contate o suporte.";
    case "offline":
      return "Sem conexao para validar a licenca agora. Conecte a internet e tente novamente.";
    case "unknown_network":
    default:
      return "Falha de conectividade com o servico de licenciamento. Verifique internet, proxy e firewall e tente novamente.";
  }
}

function mapDeniedState(reason: string): LicenseContextState {
  switch (reason) {
    case "revoked":
      return buildRevokedState();
    case "blocked":
      return buildBlockedState();
    case "expired":
      return buildExpiredState();
    case "license_already_bound":
      return buildMismatchState();
    case "rate_limited":
      return buildErrorState("Muitas tentativas de ativacao em sequencia. Aguarde um pouco e tente novamente.", "remote");
    case "invalid_license":
    default:
      return buildInvalidLicenseServerState();
  }
}

function buildStoredLicenseState(
  licenseKey: string,
  machineFingerprint: string,
  activationCorrelationToken: string,
  expiresAt: string | null,
  trustedUntil: string,
  nextValidationRequiredAt: string,
): StoredLicenseState {
  return {
    schemaVersion: 2,
    projectRef: resolveLicensingConfig().projectRef,
    licenseKey,
    machineFingerprint,
    activationCorrelationToken,
    licenseStatus: "active",
    lastValidationState: "valid",
    expiresAt: expiresAt ?? undefined,
    trustedUntil,
    nextValidationRequiredAt,
    lastValidatedAt: nowIso(),
  };
}

function mapHttpError(error: LicensingHttpError): LicenseActivationError {
  if (error.kind === "invalid_json") {
    return new LicenseActivationError(
      "invalid_response",
      buildConnectivityMessage("invalid_response"),
      error.diagnostics,
    );
  }

  if (error.diagnostics.classifiedReason === "http_5xx") {
    return new LicenseActivationError("server", buildConnectivityMessage("http_5xx"), error.diagnostics);
  }

  if (error.diagnostics.classifiedReason === "http_4xx") {
    return new LicenseActivationError("invalid_response", buildConnectivityMessage("http_4xx"), error.diagnostics);
  }

  if (error.kind === "timeout") {
    return new LicenseActivationError(
      "timeout",
      buildConnectivityMessage(error.diagnostics.classifiedReason!),
      error.diagnostics,
    );
  }

  return new LicenseActivationError(
    "network",
    buildConnectivityMessage(error.diagnostics.classifiedReason!),
    error.diagnostics,
  );
}

export async function activateLicense(licenseKeyInput: string): Promise<LicenseContextState> {
  const licenseKey = normalizeLicenseKey(licenseKeyInput);
  let lastStage: LicensingFailureStage = "unknown";

  try {
    lastStage = "fingerprint_start";
    await logActivationCheckpoint(lastStage);
    const machineFingerprint = await getMachineFingerprint();

    lastStage = "fingerprint_done";
    await logActivationCheckpoint(lastStage);

    lastStage = "http_start";
    await logActivationCheckpoint(lastStage, "success", {
      host: resolveLicensingHostSafely(),
    });
    const response = await activateLicenseRequest(licenseKey, machineFingerprint);

    lastStage = "http_response";
    await logActivationCheckpoint(lastStage, "success", {
      host: response.host,
      httpStatus: response.status,
      elapsedMs: response.elapsedMs,
    });

    if (response.status >= 500) {
      throw new LicenseActivationError("server", buildConnectivityMessage("http_5xx"), {
        operation: response.operation,
        classifiedReason: "http_5xx",
        httpStatus: response.status,
        elapsedMs: response.elapsedMs,
        host: response.host,
        stage: "response",
      });
    }

    const parsed = parseActivateLicenseResponse(response.body);

    lastStage = "parse_done";
    await logActivationCheckpoint(lastStage, "success", {
      host: response.host,
      httpStatus: response.status,
      elapsedMs: response.elapsedMs,
    });

    if (!parsed.approved) {
      return mapDeniedState(parsed.reason);
    }

    try {
      lastStage = "persist_start";
      await logActivationCheckpoint(lastStage, "success", {
        host: response.host,
        httpStatus: response.status,
        elapsedMs: response.elapsedMs,
      });
      await saveStoredLicensingState(
        buildStoredLicenseState(
          licenseKey,
          machineFingerprint,
          parsed.activationCorrelationToken,
          parsed.expiresAt,
          parsed.trustedUntil,
          parsed.nextValidationRequiredAt,
        ),
      );

      lastStage = "persist_done";
      await logActivationCheckpoint(lastStage, "success", {
        host: response.host,
        httpStatus: response.status,
        elapsedMs: response.elapsedMs,
      });
    } catch (error) {
      throw new LicenseActivationError(
        "unexpected",
        "A licenca foi aprovada, mas nao foi possivel salvar o estado local desta maquina. Tente novamente. Se o problema continuar, contate o suporte.",
        buildUnexpectedDiagnostics(error, lastStage),
      );
    }

    return buildValidState(parsed.trustedUntil, parsed.nextValidationRequiredAt, parsed.expiresAt);
  } catch (error) {
    if (error instanceof LicensingConfigError) {
      throw new LicenseActivationError(
        "config",
        "A configuracao local de licenciamento esta invalida. Reinstale o app ou contate o suporte.",
        buildUnexpectedDiagnostics(error, lastStage),
      );
    }

    if (error instanceof LicensingHttpError) {
      await logActivationCheckpoint(lastStage, "failure", {
        classifiedReason: error.diagnostics.classifiedReason,
        rawErrorName: error.diagnostics.rawErrorName,
        rawErrorMessage: error.diagnostics.rawErrorMessage,
        rawErrorCode: error.diagnostics.rawErrorCode,
        httpStatus: error.diagnostics.httpStatus,
        elapsedMs: error.diagnostics.elapsedMs,
        host: error.diagnostics.host,
        message: error.message,
      });
      throw mapHttpError(error);
    }

    if (error instanceof LicensingContractError) {
      await logActivationCheckpoint(lastStage, "failure", {
        classifiedReason: "invalid_response",
        rawErrorName: error.name,
        rawErrorMessage: error.message,
        message: error.message,
      });
      throw new LicenseActivationError("invalid_response", buildUnexpectedResponseErrorState().message, {
        operation: "activate-license",
        classifiedReason: "invalid_response",
        rawErrorName: error.name,
        rawErrorMessage: error.message,
        elapsedMs: 0,
        stage: "parse",
      });
    }

    if (error instanceof LicenseActivationError) {
      await logActivationCheckpoint(lastStage, "failure", {
        classifiedReason: error.diagnostics?.classifiedReason,
        rawErrorName: error.diagnostics?.rawErrorName,
        rawErrorMessage: error.diagnostics?.rawErrorMessage,
        rawErrorCode: error.diagnostics?.rawErrorCode,
        httpStatus: error.diagnostics?.httpStatus,
        elapsedMs: error.diagnostics?.elapsedMs,
        host: error.diagnostics?.host,
        message: error.message,
      });
      throw error;
    }

    const diagnostics = buildUnexpectedDiagnostics(error, lastStage);
    await logActivationCheckpoint(lastStage, "failure", {
      rawErrorName: diagnostics.rawErrorName,
      rawErrorMessage: diagnostics.rawErrorMessage,
      rawErrorCode: diagnostics.rawErrorCode,
      host: diagnostics.host,
      message: readUnknownStringField(error, "message") ?? "Unexpected activation failure.",
    });

    throw new LicenseActivationError(
      "unexpected",
      "Falha inesperada ao ativar a licenca. Tente novamente. Se o problema continuar, contate o suporte.",
      diagnostics,
    );
  }
}
