import { sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { canonicalizeLicensePayload } from "./canonicalize-license.mjs";
import { appendOperationLog } from "./logger.mjs";
import { loadPrivateKey, derivePublicKeyBase64UrlFromPrivateKey } from "./load-private-key.mjs";
import { VALID_PLANS } from "./license-schema.mjs";
import { readLicenseContract } from "./public-key-source.mjs";

function sanitizeLicenseFileName(licenseId) {
  return `${licenseId.replace(/[^a-zA-Z0-9-_]/g, "_")}.license`;
}

export function emitLicense(options) {
  const {
    customerName,
    licenseId,
    plan,
    issuedAt,
    expiresAt,
    outputDir,
    outputFile,
    privateKeyPath,
    logsDir,
    licenseContractPath,
  } = options;

  if (!customerName?.trim() || !licenseId?.trim() || !VALID_PLANS.includes(plan) || !issuedAt?.trim() || !expiresAt?.trim()) {
    throw new Error("Parametros obrigatorios invalidos para emissao da licenca.");
  }

  const contract = readLicenseContract(licenseContractPath);
  const privateKey = loadPrivateKey(privateKeyPath);
  const derivedPublicKey = derivePublicKeyBase64UrlFromPrivateKey(privateKey);

  if (!contract.publicKeys.some((entry) => entry.key === derivedPublicKey)) {
    throw new Error("A chave privada informada nao corresponde a nenhuma chave publica do contrato compartilhado.");
  }

  const payload = {
    customerName: customerName.trim(),
    licenseId: licenseId.trim(),
    plan: plan.trim(),
    issuedAt: issuedAt.trim(),
    expiresAt: expiresAt.trim(),
  };

  const signature = sign(null, Buffer.from(canonicalizeLicensePayload(payload), "utf8"), privateKey).toString("base64url");
  const licenseFile = { payload, signature };
  const targetPath = outputFile ? resolve(outputFile) : join(outputDir, sanitizeLicenseFileName(payload.licenseId));

  writeFileSync(targetPath, `${JSON.stringify(licenseFile, null, 2)}\n`, "utf8");
  appendOperationLog(logsDir, {
    command: "emitir",
    licenseId: payload.licenseId,
    status: "ok",
    filePath: targetPath,
  });

  return {
    payload,
    filePath: targetPath,
  };
}
