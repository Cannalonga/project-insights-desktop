export function canonicalizeLicensePayload(payload) {
  return [
    `customerName=${payload.customerName.trim()}`,
    `licenseId=${payload.licenseId.trim()}`,
    `plan=${payload.plan.trim()}`,
    `issuedAt=${payload.issuedAt.trim()}`,
    `expiresAt=${payload.expiresAt.trim()}`,
  ].join("\n");
}
