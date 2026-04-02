import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTRACT_PATH = resolve("D:/CannaConverter_2.0/shared/license-contract.json");
const ED25519_SPKI_PREFIX_HEX = "302a300506032b6570032100";

function readContractPublicKeys(contractPath) {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const keys = [];

  if (Array.isArray(contract.publicKeys)) {
    for (const entry of contract.publicKeys) {
      if (entry && typeof entry.key === "string" && entry.key.trim().length > 0) {
        keys.push(entry.key.trim());
      }
    }
  }

  if (typeof contract.publicKeyBase64Url === "string" && contract.publicKeyBase64Url.trim().length > 0) {
    const legacy = contract.publicKeyBase64Url.trim();
    if (!keys.includes(legacy)) {
      keys.push(legacy);
    }
  }

  if (keys.length === 0) {
    throw new Error("Contrato sem chave publica valida.");
  }

  return keys;
}

function derivePublicKeyBase64UrlFromPrivateKey(privateKeyPath) {
  const privateKeyPem = readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const prefix = Buffer.from(ED25519_SPKI_PREFIX_HEX, "hex");

  if (!publicKeyDer.subarray(0, prefix.length).equals(prefix)) {
    throw new Error("A chave privada nao corresponde a uma chave publica Ed25519 em formato esperado.");
  }

  return publicKeyDer.subarray(prefix.length).toString("base64url");
}

function main() {
  const [, , privateKeyPathArg] = process.argv;
  if (!privateKeyPathArg) {
    process.stderr.write('Uso: node check-key-match.mjs "D:\\\\alguma-pasta\\\\private_key.pem"\n');
    process.exit(1);
  }

  const privateKeyPath = resolve(privateKeyPathArg);
  const contractPublicKeys = readContractPublicKeys(CONTRACT_PATH);
  const derivedPublicKeyBase64Url = derivePublicKeyBase64UrlFromPrivateKey(privateKeyPath);

  if (contractPublicKeys.includes(derivedPublicKeyBase64Url)) {
    process.stdout.write("MATCH\n");
    return;
  }

  process.stdout.write("NO MATCH\n");
  process.exitCode = 2;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Falha desconhecida ao verificar compatibilidade da chave.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
