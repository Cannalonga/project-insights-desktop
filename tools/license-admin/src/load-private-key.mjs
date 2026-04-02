import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";

export function loadPrivateKey(privateKeyPath) {
  try {
    const privateKeyPem = readFileSync(privateKeyPath, "utf8");
    return createPrivateKey(privateKeyPem);
  } catch {
    throw new Error(`Nao foi possivel ler a chave privada em ${privateKeyPath}.`);
  }
}

export function derivePublicKeyBase64UrlFromPrivateKey(privateKey) {
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(-32)).toString("base64url");
}
