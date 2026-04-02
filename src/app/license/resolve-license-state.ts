import type {
  LicenseContextState,
  LicensePlan,
  LicenseStatus,
  VerifiedLicensePayload,
} from "../../core/license/license-types";

function parseIsoInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateDaysRemaining(expiresMs: number, nowMs: number): number {
  return Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24));
}

function buildStatusMessage(status: LicenseStatus, plan?: LicensePlan, daysRemaining?: number): string {
  if (status === "valid") {
    if (daysRemaining !== undefined && daysRemaining <= 15) {
      return `Licença ativa${plan ? ` (${plan})` : ""}. Restam ${daysRemaining} dias para expiração.`;
    }

    return `Licença ativa${plan ? ` (${plan})` : ""}.`;
  }

  if (status === "expired") {
    return "Sua licença expirou. O app está em modo demonstração.";
  }

  if (status === "invalid") {
    return "Licença inválida ou corrompida. O app está em modo demonstração.";
  }

  return "Modo demonstração ativo. Alguns recursos estão disponíveis apenas na versão completa.";
}

function buildState(status: Exclude<LicenseStatus, "valid">): LicenseContextState {
  return {
    status,
    isLicensed: false,
    message: buildStatusMessage(status),
  };
}

export function buildMissingState(): LicenseContextState {
  return buildState("missing");
}

export function buildInvalidState(): LicenseContextState {
  return buildState("invalid");
}

export function buildExpiredState(payload: VerifiedLicensePayload, daysRemaining?: number): LicenseContextState {
  return {
    status: "expired",
    isLicensed: false,
    daysRemaining,
    plan: payload.plan,
    customerName: payload.customerName,
    licenseId: payload.licenseId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    message: buildStatusMessage("expired", payload.plan, daysRemaining),
  };
}

export function resolveLicenseState(
  payload: VerifiedLicensePayload,
  nowIso: string = new Date().toISOString(),
): LicenseContextState {
  const issuedMs = parseIsoInstant(payload.issuedAt);
  const expiresMs = parseIsoInstant(payload.expiresAt);
  const nowMs = parseIsoInstant(nowIso);

  if (issuedMs === null || expiresMs === null || nowMs === null || issuedMs > expiresMs) {
    return buildInvalidState();
  }

  const daysRemaining = calculateDaysRemaining(expiresMs, nowMs);
  if (nowMs > expiresMs) {
    return buildExpiredState(payload, daysRemaining);
  }

  return {
    status: "valid",
    isLicensed: true,
    daysRemaining,
    plan: payload.plan,
    customerName: payload.customerName,
    licenseId: payload.licenseId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    message: buildStatusMessage("valid", payload.plan, daysRemaining),
  };
}
