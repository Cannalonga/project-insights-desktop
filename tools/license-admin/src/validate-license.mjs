import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { canonicalizeLicensePayload } from "./canonicalize-license.mjs";
import { validateDates, validateLicenseShape, parseLicenseFile } from "./license-schema.mjs";
import { appendOperationLog } from "./logger.mjs";
import {
  readLicenseContract,
  verifyDetachedSignatureAgainstAnyKey,
} from "./public-key-source.mjs";

export function validateLicenseFile(options) {
  const filePath = resolve(options.filePath);
  const logsDir = options.logsDir;

  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    appendOperationLog(logsDir, {
      command: "validar",
      status: "malformed",
      filePath,
    });

    return {
      status: "malformed",
      filePath,
      fileName: basename(filePath),
      signatureValid: false,
    };
  }

  const parsed = parseLicenseFile(contents);
  const shape = validateLicenseShape(parsed);
  if (!parsed || !shape.ok) {
    appendOperationLog(logsDir, {
      command: "validar",
      status: "malformed",
      filePath,
    });

    return {
      status: "malformed",
      filePath,
      fileName: basename(filePath),
      signatureValid: false,
    };
  }

  const contract = readLicenseContract(options.licenseContractPath);
  const signatureValid = verifyDetachedSignatureAgainstAnyKey({
    contract,
    payload: canonicalizeLicensePayload(parsed.payload),
    signature: parsed.signature,
  });

  if (!signatureValid) {
    appendOperationLog(logsDir, {
      command: "validar",
      licenseId: parsed.payload.licenseId,
      status: "invalid",
      filePath,
    });

    return {
      status: "invalid",
      filePath,
      fileName: basename(filePath),
      signatureValid: false,
      ...parsed.payload,
    };
  }

  const temporal = validateDates(parsed.payload);
  appendOperationLog(logsDir, {
    command: "validar",
    licenseId: parsed.payload.licenseId,
    status: temporal.status,
    filePath,
  });

  return {
    status: temporal.status,
    filePath,
    fileName: basename(filePath),
    signatureValid: true,
    ...parsed.payload,
    daysRemaining: temporal.daysRemaining,
  };
}
