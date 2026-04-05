import {
  LICENSE_CLIENT_STATES,
  type LicenseContextState,
  type LicensingFailureDiagnostics,
  type LicensingFailureReason,
} from "../../core/license/license-types";

type LicenseStateSource = LicenseContextState["source"];
type LicenseStateStatus = LicenseContextState["status"];

function buildState(
  status: LicenseStateStatus,
  message: string,
  source: LicenseStateSource,
  fields: Partial<LicenseContextState> = {},
): LicenseContextState {
  return {
    status,
    isLicensed:
      status === LICENSE_CLIENT_STATES.VALID || status === LICENSE_CLIENT_STATES.OFFLINE_VALID,
    message,
    source,
    ...fields,
  };
}

function buildConnectivityMessage(reason: LicensingFailureReason): string {
  switch (reason) {
    case "dns":
      return "Falha ao localizar o servico de licenciamento.";
    case "tls":
      return "Falha na conexao segura com o servico de licenciamento.";
    case "proxy_or_intercepted":
      return "A conexao com o servico de licenciamento parece estar sendo interceptada.";
    case "connect_timeout":
    case "read_timeout":
      return "Tempo limite excedido ao contatar o servico de licenciamento.";
    case "connection_refused":
      return "O servico de licenciamento recusou a conexao.";
    case "http_5xx":
      return "O servico respondeu com erro temporario.";
    case "http_4xx":
      return "O servico rejeitou a requisicao de licenciamento.";
    case "invalid_response":
      return "Resposta invalida do servico de licenciamento.";
    case "offline":
      return "Sem conexao para validar a licenca agora.";
    case "unknown_network":
    default:
      return "Falha de conectividade com o servico de licenciamento.";
  }
}

export function buildNoLicenseState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.NO_LICENSE,
    "Nenhuma licenca ativa nesta maquina. Insira seu codigo para liberar o app.",
    "local",
  );
}

export function buildActivatingState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.ACTIVATING,
    "Ativando a licenca. Aguarde a confirmacao do servidor.",
    "local",
  );
}

export function buildInvalidState(
  message = "Licenca invalida. Verifique o codigo ou solicite uma nova.",
  source: LicenseStateSource = "local",
): LicenseContextState {
  return buildState(LICENSE_CLIENT_STATES.INVALID, message, source);
}

export function buildErrorState(
  message = "Nao foi possivel confirmar a licenca agora. Tente novamente.",
  source: LicenseStateSource = "local",
  fields: Partial<LicenseContextState> = {},
): LicenseContextState {
  return buildState(LICENSE_CLIENT_STATES.ERROR, message, source, fields);
}

export function buildOfflineValidState(
  trustedUntil: string,
  nextValidationRequiredAt: string,
  expiresAt?: string,
  message = "Modo offline ativo. Conecte a internet para validar novamente antes do prazo informado.",
): LicenseContextState {
  return buildState(LICENSE_CLIENT_STATES.OFFLINE_VALID, message, "local", {
    expiresAt,
    trustedUntil,
    nextValidationRequiredAt,
  });
}

export function buildValidState(trustedUntil: string, nextValidationRequiredAt: string, expiresAt?: string | null): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.VALID,
    "Licenca validada com sucesso. Voce pode usar o app normalmente.",
    "remote",
    {
      expiresAt: expiresAt ?? undefined,
      trustedUntil,
      nextValidationRequiredAt,
      lastValidatedAt: new Date().toISOString(),
    },
  );
}

export function buildRevokedState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.REVOKED,
    "Esta licenca foi desativada. Entre em contato com o suporte.",
    "remote",
  );
}

export function buildBlockedState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.BLOCKED,
    "Esta licenca foi bloqueada. Entre em contato com o suporte.",
    "remote",
  );
}

export function buildExpiredState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.EXPIRED,
    "Esta licenca expirou. Solicite a renovacao para continuar.",
    "remote",
  );
}

export function buildMismatchState(): LicenseContextState {
  return buildState(
    LICENSE_CLIENT_STATES.MISMATCH,
    "Esta licenca ja esta em uso em outro dispositivo.",
    "remote",
  );
}

export function buildInvalidLicenseServerState(): LicenseContextState {
  return buildInvalidState("Licenca invalida. Verifique o codigo ou solicite uma nova.", "remote");
}

export function buildNetworkFallbackState(
  trustedUntil: string,
  nextValidationRequiredAt: string,
  reason: "network" | "timeout" | "server" = "network",
  diagnostics?: LicensingFailureDiagnostics,
  expiresAt?: string,
): LicenseContextState {
  const message =
    reason === "timeout"
      ? "Modo offline ativo. A validacao demorou demais. Conecte a internet e tente novamente em instantes."
      : reason === "server"
        ? "Modo offline ativo. O servico de licenciamento esta indisponivel no momento. Tente novamente quando houver conexao estavel."
        : diagnostics?.classifiedReason
          ? `${buildConnectivityMessage(diagnostics.classifiedReason)} Conecte a internet para validar novamente.`
          : "Modo offline ativo. Sem conexao com o servico de licenciamento. Conecte a internet para validar novamente.";

  return buildState(LICENSE_CLIENT_STATES.OFFLINE_VALID, message, "local", {
    expiresAt,
    trustedUntil,
    nextValidationRequiredAt,
    diagnostics,
  });
}

export function buildValidationRequiredErrorState(): LicenseContextState {
  return buildErrorState(
    "A licenca precisa ser validada online antes de liberar o uso nesta maquina. Conecte a internet e tente novamente.",
  );
}

export function buildNetworkErrorState(
  kind: "network" | "timeout" | "server",
  diagnostics?: LicensingFailureDiagnostics,
): LicenseContextState {
  const reason = diagnostics?.classifiedReason;

  if (kind === "timeout") {
    return buildErrorState(
      reason
        ? `${buildConnectivityMessage(reason)} Tente novamente com conexao estavel.`
        : "Tempo limite excedido ao contatar o servico de licenciamento. Tente novamente com conexao estavel.",
      "remote",
      { diagnostics },
    );
  }

  if (kind === "server") {
    return buildErrorState(
      reason
        ? `${buildConnectivityMessage(reason)} Tente novamente em alguns minutos.`
        : "O servico de licenciamento respondeu com erro temporario. Tente novamente em alguns minutos.",
      "remote",
      { diagnostics },
    );
  }

  return buildErrorState(
    reason
      ? `${buildConnectivityMessage(reason)} Verifique internet, proxy e firewall e tente novamente.`
      : "Sem conexao para validar a licenca agora. Verifique internet, proxy e firewall e tente novamente.",
    diagnostics?.classifiedReason === "offline" ? "local" : "remote",
    { diagnostics },
  );
}

export function buildUnexpectedResponseErrorState(diagnostics?: LicensingFailureDiagnostics): LicenseContextState {
  return buildErrorState(
    "Resposta invalida do servico de licenciamento. Tente novamente. Se o problema continuar, contate o suporte.",
    "remote",
    { diagnostics },
  );
}
