import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function canonicalizeLicensePayload(payload) {
  return [
    `customerName=${payload.customerName.trim()}`,
    `licenseId=${payload.licenseId.trim()}`,
    `plan=${payload.plan.trim()}`,
    `issuedAt=${payload.issuedAt.trim()}`,
    `expiresAt=${payload.expiresAt.trim()}`,
  ].join("\n");
}

function requireArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required argument ${flag}`);
  }

  return process.argv[index + 1];
}

function getOptionalArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function validatePlan(plan) {
  if (plan !== "semiannual" && plan !== "annual") {
    throw new Error("Plan must be semiannual or annual");
  }

  return plan;
}

function main() {
  const customerName = requireArg("--name");
  const licenseId = requireArg("--license-id");
  const plan = validatePlan(requireArg("--plan"));
  const issuedAt = requireArg("--issued-at");
  const expiresAt = requireArg("--expires-at");
  const privateKeyPath = requireArg("--private-key-file");
  const outputPath =
    getOptionalArg("--output") ?? `${licenseId.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase()}.license.json`;

  const payload = {
    customerName,
    licenseId,
    plan,
    issuedAt,
    expiresAt,
  };

  const privateKeyPem = readFileSync(resolve(privateKeyPath), "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonicalizeLicensePayload(payload), "utf8"), privateKey).toString(
    "base64url",
  );

  const licenseFile = {
    payload,
    signature,
  };

  writeFileSync(resolve(outputPath), `${JSON.stringify(licenseFile, null, 2)}\n`, "utf8");
  process.stdout.write(`License file created at ${resolve(outputPath)}\n`);
}

main();
