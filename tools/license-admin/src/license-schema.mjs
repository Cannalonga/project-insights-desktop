export const VALID_PLANS = ["semiannual", "annual"];

export function parseLicenseFile(contents) {
  try {
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

export function isIsoInstant(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateLicenseShape(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return { ok: false, reason: "malformed" };
  }

  if (!file.payload || typeof file.payload !== "object" || Array.isArray(file.payload)) {
    return { ok: false, reason: "malformed" };
  }

  if (typeof file.signature !== "string" || file.signature.trim().length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const { customerName, licenseId, plan, issuedAt, expiresAt } = file.payload;
  if (
    typeof customerName !== "string" ||
    typeof licenseId !== "string" ||
    typeof plan !== "string" ||
    typeof issuedAt !== "string" ||
    typeof expiresAt !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (!customerName.trim() || !licenseId.trim() || !VALID_PLANS.includes(plan) || !issuedAt.trim() || !expiresAt.trim()) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true };
}

export function validateDates(payload, nowIso = new Date().toISOString()) {
  const issuedMs = Date.parse(payload.issuedAt);
  const expiresMs = Date.parse(payload.expiresAt);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || !Number.isFinite(nowMs) || issuedMs > expiresMs) {
    return { status: "invalid" };
  }

  if (nowMs > expiresMs) {
    return { status: "expired", daysRemaining: Math.ceil((expiresMs - nowMs) / 86400000) };
  }

  return { status: "valid", daysRemaining: Math.ceil((expiresMs - nowMs) / 86400000) };
}
